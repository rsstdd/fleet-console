# ADR 2 — Transport: HTTP POST Ingest, WebSocket Fan-Out

**Decision:** Ingest is HTTP POST one request per telemetry reading, validated and normalized at the boundary; fan-out is WebSocket carrying coalesced deltas; no MQTT or broker is introduced.
**Status:** Decided · 2026-08-19 · Not started
**Group:** Integration / transport.

## Issue

Telemetry has to get from three simulated vendor sources into the server, and current state has to get from the server to however many browser consoles are watching it. Two independent transport choices are bundled into one ADR because they interact. The ingest path's cost — validation, normalization, upsert — determines how much headroom exists before fan-out becomes a bottleneck at all. The fan-out path's design — snapshot against delta, push against poll — determines what the client-side store in `packages/web` has to consume. Choosing them separately risks a mismatch discovered late, such as a fan-out format the client store was not built to handle efficiently.

## Assumptions

- The simulator emits at roughly 1 Hz per robot in normal mode and up to 5 Hz per robot in load mode (`--robots 500 --hz 5`). That sets the traffic shape this ADR is designed against, and the measurement commitment at 50 and 500 robots tests it directly.
- Connected consoles number in the single digits at most. This is a demonstration, not a multi-operator deployment, so fan-out scaling to many simultaneous clients is not a concern this ADR solves for — though the reasoning below holds at higher counts, since WebSocket broadcast is I/O-bound and cheap regardless of client count.
- WebSocket fan-out and HTTP ingest are architecturally independent choices that happen to run in the same Node process. Nothing about WebSocket fan-out requires a particular ingest transport, and nothing about HTTP ingest requires WebSocket fan-out. They are bundled here for the reason stated in Issue, not because they are technically coupled.
- Back-of-envelope: Zod validation of a small telemetry object runs in tens of microseconds. At the stated peak of roughly 2,500 messages per second (500 robots at 5 Hz), that consumes low single-digit percent of one core. Per-request HTTP overhead at 2,500 discrete POSTs per second is a competing candidate for the first bottleneck. To falsify this estimate, the harness would have to show validation consuming more than 100% of one core at 2,500 msg/s — more than roughly 400 microseconds per message.

## Constraints

- The stack decision in `CLAUDE.md` commits this repository to TypeScript. Introducing a second server language mid-project would reverse a decision recorded the same day.
- The measurement harness must report where the ingest path actually degrades, not only favourable numbers at the primary scale point. This ADR's staged mitigation path exists so that when the 500-robot measurement shows degradation, the README can name the cause and the next step rather than presenting an unexplained number.
- No broker (Redis, NATS, MQTT) is added without its own ADR, per the standing no-dependency-without-a-record rule. This ADR defers that decision rather than making it, since nothing at this scale requires it.

## Decision

Ingest is HTTP POST, one request per telemetry reading, validated and normalized at the boundary per ADR 1's contract, with malformed payloads rejected and counted rather than coerced. Fan-out is WebSocket, one connection per connected console, carrying coalesced deltas — changed robots only, not full snapshots — flushed at up to 10 Hz server-side. Neither MQTT nor a message broker is introduced at this scale.

Coalescing is per client, not global. Each connection owns a pending set keyed by robot id, and a flush writes that set and empties it. A client whose socket is not draining therefore accumulates a set bounded by the size of the fleet rather than a queue bounded by how far behind it has fallen: the same robot changing twenty times while the socket is busy occupies one entry, not twenty. Such a client receives current state less often, never stale state, and nothing is dropped on its behalf. A frame assembled from several flushes carries the highest flush sequence it contains. A connection that stops draining entirely is closed on a timeout, because a bounded set is still a set held for a client that will never read it.

A joining console gets its initial state from `GET /api/fleet`, not from the socket. The socket carries exactly one message shape — a coalesced delta — for its whole lifetime, and the same code path serves cold start and reconnect. Because an HTTP read and a socket open are two separate events, the client opens the socket first and buffers what arrives, then fetches the snapshot, then discards the buffered deltas the snapshot already contains and applies the rest. That discrimination requires a monotonically increasing flush sequence carried on both the snapshot and every delta: the snapshot states the flush it was taken at, and a buffered delta at or below that number is redundant. The sequence is server-wide and per flush, not per robot — a single number answers "does this delta predate my snapshot" for the whole fleet, where per-robot versions would answer the same question with five hundred numbers.

The identified ceiling is a bottleneck in the ingest path, from either per-request HTTP overhead or CPU-bound schema validation, under high robot counts. It is named explicitly rather than discovered silently, with a staged mitigation path recorded rather than implemented: batch ingest first; process-level forking or worker-pooled validation second, to discriminate and mitigate the specific bottleneck; and Rust with Axum and Tokio as the specific next runtime if the ingest path genuinely cannot be parallelized enough inside Node.

## Positions

1. **MQTT or a message broker for ingest**, given robots are the kind of device that conventionally speaks a pub/sub telemetry protocol. Rejected at this scale: a broker adds a dependency, a deployment concern, and a second protocol to document, for traffic volume — single digits to low hundreds of messages per second — that a plain HTTP endpoint handles without difficulty.
2. **Polling instead of WebSocket for the client**, where the console periodically re-fetches `/api/fleet`. Rejected: polling cannot deliver the sub-second freshness transitions ADR 3's timer-based machine is designed to demonstrate, unless it polls fast enough to approximate a push model anyway. At that point it is strictly worse than a WebSocket for the same effective update rate, since every poll re-sends full state rather than a delta.
3. **Full snapshot fan-out on every flush, rather than deltas.** Considered as the simpler implementation. Rejected: at 500 robots, a full snapshot at up to 10 Hz is significantly more bytes than a delta of only the robots that changed, for no benefit. The client-side normalized store already applies deltas keyed by robot id rather than replacing wholesale.
4. **Per-message HTTP POST ingest with WebSocket delta fan-out, staying within Node, with a named staged mitigation path for the identified ingest ceiling.** Chosen.
5. **A full rewrite of the server in Rust (Axum, Tokio) from the outset**, given that Tokio's multi-threaded scheduler offers real parallel validation without the IPC overhead of Node worker threads. Rejected here, not because it is technically wrong: it contradicts the same-day TypeScript-monorepo decision in `CLAUDE.md`. Recorded as the correct next step past Node's ceiling rather than adopted.

## Argument

WebSocket delta fan-out was chosen over polling because polling cannot approach the sub-second freshness transitions that are the entire point of ADR 3 without simulating a push model at a worse cost profile, and delta rather than snapshot fan-out was chosen because the client store already assumes per-robot keyed updates, so a full snapshot on every flush would pay a wire-format cost the receiving side was never built to need. The cheaper format is also the one already expected.

The harder question is why the ceiling is named rather than solved outright. Node's event loop handles I/O-bound work — HTTP connections, WebSocket broadcast — well regardless of scale. Heavy per-request overhead and schema validation are CPU-bound, and CPU-bound work on a single thread blocks everything else on that thread, including the fan-out this ADR otherwise has no complaint about.

The staged response treats the ceiling as a known, priced fact rather than an unexamined risk. Batch ingest comes first, as the highest-leverage change for reducing per-request overhead and already the right move even at 500 robots; process-level forking via `node:cluster` comes second, forking processes and load-balancing connections to parallelize whole request handling end-to-end, or worker-pooled validation instead if the harness proves validation rather than overhead dominates. Rust is the identified but unadopted step past that.

Worker-thread validation requires transferring the payload across a structured-clone boundary. For objects this small that frequently costs more than validating inline, which makes `node:cluster` the better mitigation if HTTP overhead dominates.

## Implications

- The measurement harness must isolate whether degradation at 500 robots comes from ingest validation cost, per-request HTTP overhead, or something else entirely — client rendering, fan-out coalescing, network. Attributing degradation to the wrong layer misinforms which mitigation applies.
- If `node:cluster` process forking is implemented as a mitigation, ADR 6's in-memory current-state map does not survive it, because each worker holds its own. This does not invalidate the mitigation. It prices it. ADR 6's multi-instance implication reaches the same conclusion from the persistence side.
- ADR 3's freshness sweep output must be included in what the fan-out coalescing logic treats as a changed robot, even when no telemetry field changed. This is a direct dependency from ADR 3 onto this ADR's coalescing implementation, noted there and repeated here.
- Per-client coalescing means fan-out memory is `clients × fleet size` in the worst case rather than `clients × backlog`. At ADR 2's assumed single-digit console count and 500 robots that is negligible, and it is bounded by construction rather than by a tuning value nobody can derive.
- Per-client coalescing is what makes "one client must not block ingest or other clients" true without dropping anyone. The residual case is a connection that never drains, which a timeout closes; that timeout is the only place fan-out discards a client, and it belongs on the health endpoint.
- The initial-state contract requires a flush sequence on the wire, which is a `packages/contracts` change before it is a server or client change: the delta envelope and the fleet snapshot response both carry it. Without it the client cannot tell a redundant buffered delta from a new one, and the choice of an HTTP snapshot over a socket-borne one stops being safe.
- The client's cold-start order is load-bearing and easy to get backwards. Fetching the snapshot before opening the socket loses every delta emitted in between, silently, and the symptom is a row that stops updating rather than an error.
- If batch ingest is implemented, the simulator needs a corresponding batch-emission mode. This ADR implies that change without specifying it.
- The README's "not built" table should name the broker/MQTT decision and the staged mitigation path, with this ADR referenced.

## Open questions

- Should the batch-ingest mitigation be built preemptively, ahead of measurement showing it is needed, or left as a named-but-unbuilt stage in the "not built" table?
  - _Current lean:_ The latter, consistent with building only what measurement shows is necessary.
  - _Resolves on:_ The 500-robot measurement number is in hand.

## Observed consequences

- 19 August 2026: the flush sequence this ADR's initial-state contract requires landed in
  `packages/contracts`, decided as [ADR 18](./18_FLUSH_SEQUENCE_NOW_DELTA_GRANULARITY_WHEN_MEASURED.md)
  (register D10). `telemetryBatchSchema` gained a required `flushSequence`; the fleet
  snapshot response this ADR committed to but never defined now exists as
  `fleetSnapshotSchema`; and the reconciliation rule itself ships as
  `isDeltaCoveredBySnapshot`, in contracts because both sides of the wire must agree on
  it. The Implications entry predicting "a `packages/contracts` change before it is a
  server or client change" held exactly.
- 19 August 2026: delta granularity was examined in the same pass and deliberately left
  as decided here — whole envelope per changed robot. `docs/ARCHITECTURE_AUDIT.md`
  estimates a freshness-only transition at 5-10x the bytes it needs and recommends a
  second, freshness-only message shape before the fan-out is written. ADR 18 declines to
  act on an estimate, because a second shape is what this ADR's initial-state decision
  paid the flush sequence to avoid. It reopens on a measured mass-transition flush at 500
  robots — the harness this ADR commits to and which does not yet exist.
- 19 August 2026: **the validation half of this ADR's estimate was measured, and it holds.**
  One telemetry message — `JSON.parse` of the body plus a strict canonical decode — costs
  **5.8-6.4 µs**, against the falsification threshold of roughly 400 µs stated in
  Assumptions. At the design point of 2,500 msg/s that is about **1.5% of one core**, so
  the "tens of microseconds" estimate was right and slightly conservative, and the
  competing candidate named in the same assumption — per-request HTTP overhead — is where
  the remaining measurement has to go. The threshold is now a CI assertion rather than a
  sentence: `packages/server/src/ingest/validationCost.test.ts`, decided as
  [ADR 22](./22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md) (register D17).
  Two of this ADR's three per-message costs are covered by it; the third, HTTP overhead,
  and the vendor schema decode both need packages that do not exist, so the throughput and
  latency tables in `README.md` § 10 stay empty and § 5 of the audit stays estimates.

## Related

- ADR 8 — names what implements the two transports this ADR chose: Hono on `@hono/node-server` for HTTP, `ws` for the socket. Its per-request overhead is inside the measurement this ADR commits to.
- ADR 1 — the envelope schema this ADR's validation cost is calculated against; the two describe the same boundary from different sides.
- ADR 3 — direct dependency; depends on this ADR's fan-out coalescing propagating freshness-only state changes.
- ADR 6 — bounded in-memory history; keeps persistence out of this ADR's measurement scope so ingest-path degradation stays attributable.
- Requirement — measurement commitment (throughput and latency at 50 and 500 robots, with the degradation point published rather than concealed).
- Principle 2 ("external contracts are decoded once and evolved deliberately") — this ADR is where that decoding's cost, not only its correctness, is reasoned about.
- Principle 4 (provenance and freshness) — indirect, via the freshness-sweep-must-propagate-as-a-change implication shared with ADR 3.
- Artifact `packages/server` — ingest, dispatch, and fan-out live here (not yet implemented).
- Artifact `packages/simulator` — the load-mode flag (`--robots 500 --hz 5`) that exercises this design.
- ADR 22 — gates this ADR's falsification threshold in CI and reports the numbers that are not gated; the validation half of the harness, and the record of which rows remain unmeasured.
- Artifact README measurements section — reports the outcome of the harness specified in Implications.
- Artifact `packages/web/src/entities/robot` — the normalized, delta-consuming client store this fan-out format feeds.

## Notes

- 19 August 2026: per-client coalescing was added to the Decision in the same review. The alternatives were dropping a client past a `bufferedAmount` threshold, and a bounded queue of pending flushes. The queue was rejected because its frames are stale by the time they send, which is the specific behaviour this console exists to argue against; dropping was rejected as unnecessary once it was noticed that a per-robot keyed set is already bounded by the fleet, so slowness costs a client update _frequency_ rather than update _content_.
- 19 August 2026: the initial-state contract was added to the Decision after review found the ADR silent on how a joining client gets its first full picture. Amending the Decision rather than appending a consequence is safe here because the status is Not started — nothing had been built against the earlier text. The alternative considered was sending a snapshot as the socket's first frame, which needs no sequence at all because WebSocket ordering supplies the guarantee; it was rejected in favour of keeping one message shape on the socket, at the cost of the flush sequence now required above.
- 19 August 2026: decision recorded ahead of server implementation. No code exists yet. The first expected observed-consequence entry is the measured throughput ceiling at 500 robots and 5 Hz, compared against the back-of-envelope estimate of roughly 2,500 requests per second.
