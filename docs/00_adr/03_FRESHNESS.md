# ADR 3 — Freshness Derived on a Timer, Not on Arrival

**Decision:** Freshness is derived by a recurring 500ms server-side sweep that reads `receivedAt` exclusively and compares it against the current time to assign one of four states: LIVE, STALE, UNREACHABLE, or UNKNOWN.

**Status:** Decided · 2026-08-19 · Not started

**Group:** Data / derived state (spans server and client, unlike ADR 6 which is server-only).

## Issue
The console's central thesis is that it never presents stale state as current. That claim only means something if freshness is computed in a way that can detect the failure mode it is meant to catch: a robot going silent.

The naive implementation recomputes a robot's freshness label whenever a new telemetry message arrives for it, which cannot detect silence at all, because it only runs when something happens and the thing being detected is precisely the absence of something happening. This ADR decides how freshness is actually computed. The wrong choice makes the headline claim false in exactly the situation the claim is about.

## Assumptions
- The simulator's `--drop` flag is how this decision gets exercised and demonstrated. If freshness only updated on arrival, `--drop` would produce no visible effect at all, silently defeating the fault-injection design the simulator was built around.
- A telemetry-emitting robot reports at roughly 1 Hz, so a 2-second LIVE threshold means a robot must miss roughly two consecutive expected messages before leaving LIVE. That tolerates ordinary jitter without over-triggering STALE.
- The demo script's fault-injection sequence needs degradation to happen in seconds, not minutes. That constrains the thresholds, though the specific 2s and 10s values are a judgment call rather than a value derived from a hard requirement.
- Worst-case detection latency is the configured threshold plus the sweep interval. Sweeping every 2 seconds against a 2-second LIVE threshold means silence can take up to 4 seconds to detect. The interval is therefore fixed at 500 milliseconds: 500 timestamp comparisons twice per second is negligible against any other cost in the system, and a sub-second sweep keeps worst-case detection at 2.5 seconds.
- The server, not the client, is the correct place to compute freshness. A client recomputing independently from raw timestamps duplicates the derivation in two places and risks disagreeing with itself if server and client clocks drift.

## Constraints
- Freshness must be one of exactly four states, matching principle 4's vocabulary (LIVE, STALE, UNREACHABLE, UNKNOWN) and the `FreshnessLabel` component contract. Introducing a fifth state or renaming one requires updating the component spec, the wireframes, and this ADR together.
- The sweep must run independently of the WebSocket fan-out's coalescing interval (up to 10 Hz, per ADR 2). Conflating "how often do we check freshness" with "how often do we flush deltas" makes the two impossible to tune separately.
- Thresholds and the sweep interval must be configuration values under `liveThresholdMs`, `staleThresholdMs`, and `sweepIntervalMs` in `config/freshness.json`, per principle 13. A reviewer or future tenant should be able to retune sensitivity and sweep frequency without touching the derivation logic.

## Decision
Freshness is derived by a recurring sweep on a fixed 500-millisecond interval, independent of message arrival. The sweep reads `receivedAt` exclusively — the server's own receipt instant — and compares it against the current time, assigning LIVE (`receivedAt` within the last 2 seconds), STALE (within the last 10 seconds), UNREACHABLE (older than 10 seconds), or UNKNOWN (no telemetry ever received for a registered robot). The roster of registered robots lives in a fleet manifest provided as configuration, giving UNKNOWN a real population on cold start rather than relying on derived state. The sweep reads `receivedAt` exclusively because server receipt time is the only clock the freshness guarantee can be made against.

The operator-facing "last seen" value displays `reportedAt`, the vendor-supplied instant normalized to epoch-milliseconds, because that is the last real telemetry instant. The sweep reads `receivedAt` and the display reads `reportedAt`, so a freshness-only transition cannot disturb "last seen" by construction. This is a stated invariant of the system.

The sweep runs on the server. Freshness state is included in the canonical envelope's derived fields sent to clients, and the client does not independently recompute it from timestamps — it displays what the server sweep last determined, refreshing when a delta arrives via the WebSocket fan-out in ADR 2. While the WebSocket is disconnected, the client suppresses per-robot freshness labels in favour of a connection-level indeterminate state, because a per-robot label sourced from a dead connection asserts currency the client cannot support. The connection-integrity banner is part of this ADR's correctness rather than adjacent UI. A client showing per-robot freshness with no live connection is a defect against principle 4 regardless of what the banner says.

Thresholds (2s, 10s) and the 500ms sweep interval live in configuration under the keys `liveThresholdMs`, `staleThresholdMs`, and `sweepIntervalMs` in `config/freshness.json`, not hardcoded in the freshness function.

## Positions
1. **Freshness recomputed only when a new message arrives, comparing its timestamp against the previous one.** Rejected, and disqualifying rather than suboptimal: it cannot represent "nothing has arrived in N seconds" at all, because there is no new message to trigger the recomputation. A robot that stops reporting keeps showing its last-known freshness state forever.
2. **Client-side countdown, where the client computes elapsed time since the last message it received and derives freshness locally, with the server sending only raw timestamps.** Considered seriously. It removes the server-sweep infrastructure and moves computation to a place that already has a render loop. Rejected as the sole mechanism: it makes freshness dependent on the client's WebSocket staying alive, which is backwards. The case that matters most is the socket dropping, and that is exactly when a client-only countdown stops updating — unless paired with an "assume UNREACHABLE if the socket is down" rule, which reintroduces server-derived state through a side door. A pure client computation cannot distinguish "robot went silent while the socket stayed connected" from "the socket dropped and I have no idea what is happening." The console needs that distinction for the connection-integrity banner to make sense.
3. **Server-side sweep, freshness computed centrally and sent to clients as a derived field, with the client displaying rather than recomputing.** Chosen.
4. **Cut to three states, removing UNKNOWN.** Considered to resolve the lack of a registered-robot roster, since ADR 6 only materializes state on first message and an unregistered silent robot does not exist at all. Rejected: a fleet console that cannot distinguish "never heard from" from "does not exist" is missing a state an operator needs. Removing UNKNOWN would also require updating `docs/02_component-specs/02_FRESHNESS_LABEL.md`, the wireframes, and principle 4's vocabulary in the same commit, when a manifest resolves the issue instead.

## Argument
The server-side sweep was chosen because it is the only option that can represent absence as a first-class event rather than an artifact of comparing two messages that both arrived. That is the capability principle 4 requires, and position 1 cannot provide it at all.

It was chosen over a pure client-side countdown because the client-only version conflates two distinct failure signals — the robot going silent, and the client's own connection to the server going down — that the console's design already treats as separate concerns, with freshness state per robot and a connection-integrity banner for the whole stream. Collapsing them into one client-side timer would make that separation cosmetic.

Computing centrally also means the four freshness states are the same four states for every connected client simultaneously. That matters for a tool where more than one operator could be watching.

## Implications
- The server needs a running interval independent of request handling. Ingest and fan-out are both naturally event-driven; this sweep is the one part of the server that is not.
- Every robot's freshness is recomputed on every tick, which at 500 robots is 500 timestamp comparisons per tick. This is negligible against the validation cost in ADR 2, but it scales linearly with fleet size and should be revisited if fleet size assumptions change by orders of magnitude.
- Because freshness is derived state included in fan-out, a freshness transition for a robot that has otherwise not changed must still trigger a delta send. ADR 2's coalescing logic must treat a freshness-only change as a real change rather than skipping it because no telemetry field moved.
- The sweep shares an event loop with ingest validation, so ADR 2's ceiling is also this mechanism's ceiling. Sustained event-loop blocking delays the sweep. Under ingest saturation the console freezes robots at their last computed state instead of degrading them to STALE, which is the exact failure mode this mechanism exists to prevent. ADR 2's mitigation ordering is therefore a freshness-correctness concern, not only a throughput concern.
- To detect that failure mode, the sweep must record when the interval between its ticks exceeds the configured interval by more than a stated tolerance. The late-tick fact is a system-health signal and belongs on the health endpoint.
- The demo script's step "kill the stream, watch every row degrade through STALE to UNREACHABLE on the timer" depends entirely on this decision. If freshness were client-computed only, that step would need rewriting around whatever the client-only mechanism could show.

## Open questions
- Do the 2s/10s thresholds produce a demo-able degradation pace against the real simulator?
  - *Current lean:* Yes. They were chosen to tolerate ordinary jitter while degrading within seconds.
  - *Resolves on:* Running the demo script's fault-injection sequence against the live simulator.

## Observed consequences
-

## Related
ADR 2 — the sweep's output becomes part of what fan-out sends, and ADR 2's event-loop ceiling applies directly to this sweep's ability to fire reliably.
ADR 6 — the sweep reads each robot's `receivedAt` from the same in-memory current-state store ADR 6 specifies.
Principle 4 (provenance and freshness are explicit where they affect a decision) — this ADR is its derivation mechanism.
Principle 11 (state is separated by authority, lifetime, and transition model) — freshness is live-state metadata distinct from the telemetry value it qualifies.
Requirement (demo script fault-injection sequence) — the observable proof this mechanism works as claimed.
Artifact `packages/server` — not yet implemented; will contain the sweep.
Artifact `docs/02_component-specs/02_FRESHNESS_LABEL.md` — the four-state vocabulary this ADR's output must match exactly.
Artifact `docs/01_page-specs/01_FLEET.md`, `docs/01_page-specs/02_ROBOT_DETAIL.md` — both display freshness derived by this mechanism rather than recomputed locally.
Artifact `config/fleet-manifest.json` — lists every expected robot identifier, serving as the roster so the sweep can identify silent robots as UNKNOWN.
Artifact `config/freshness.json` — holds the threshold values and sweep interval.

## Notes
- 19 August 2026: decision recorded ahead of server implementation. No code exists yet. The first expected observed-consequence entry is whether the 2s/10s thresholds produce a demo-able degradation pace once run against the real simulator, or need retuning.
