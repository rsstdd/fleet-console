# ADR 31 — Full-Jitter Reconnect With a Capped Initial Probe, and a Server Session Epoch on the Wire

**Decision:** The console reconnects automatically — an immediate first attempt, then full-jitter exponential delays under a 30-second ceiling, capped at three attempts only while the socket has never opened — and every fleet snapshot and telemetry batch carries a per-process `serverSessionId` UUID that scopes the flush sequence, so a restarted server is detected and re-joined rather than silently ignored; the wire schema version advances to 2.
**Group:** Integration / transport (the recovery half of ADR 2's socket, and the restart half ADR 18 left open).
**Status:** Decided · 2026-08-20 · Implemented

## Issue

Register stub **D22** held two entangled questions that had to be answered together because both are about what the client does when a connection comes back.

**The console did not retry.** `createFleetTransport().connect()` after a close was the caller's problem, and `streamLifecycle`'s `give-up` was an event the caller raised rather than a policy the transport enforced. The banner shipped a manual retry control and an attempt counter — honest, but README demo step 6 ("restore stream, labels return without reload") could not pass, and `packages/server` TODO **H6c** listed reconnect among the undefined connection states. Three sub-questions were open: how long to wait between attempts, when (if ever) to stop, and whether a handshake that never opened differs from a connection that dropped.

**A server restart silently froze every row.** The flush sequence restarts at zero with the process (ADR 6 keeps no durable state), so a console holding a snapshot at sequence 50 discarded every delta from the new runtime until its counter caught up — `isDeltaCoveredBySnapshot` behaving exactly as designed while the operator watched rows quietly stop updating. ADR 18 § Open questions named this and deferred it because no server process existed to have the problem; `packages/server/TODO.md` **H3c** carried the candidate answers.

## Assumptions

- The browser classifies an initial handshake only by whether the socket ever opened. The WebSocket API does not reliably expose HTTP 404, origin rejection, or DNS failure, so no policy here may depend on distinguishing them.
- A server session identifier provides sequence-epoch identity only — no persistence, no cross-session continuity. Two starts of one binary are two sessions, and that is the property being relied on, not a limitation.
- Every console that loses a server loses it at the same moment, so reconnect timing is a thundering-herd problem before it is a UX problem.
- Persistent disagreement between the snapshot's session and the stream's session is a deployment-integrity failure (two servers behind one address, or a proxy splitting paths), not a transient to retry through.

## Constraints

- The socket carries one message shape for its whole lifetime, and initial state arrives over HTTP (ADR 2). Recovery must therefore re-run the same join — open, buffer, fetch, reconcile — not introduce a resume protocol.
- The reconciliation rule must be identical on both sides of the wire, so it lives in `packages/contracts` and nowhere else (Principle 1, as ADR 18 already established for the sequence half).
- All non-connected states keep suppressing per-robot freshness; the banner carries the connection-level truth (ADR 3, ADR 23).
- A retry control that does nothing observable, and a console that claims to be trying when it has stopped, are the class of lie this project exists to argue against (Principle 4's spirit applied to connection state).
- Schema versions evolve deliberately with all producers and consumers updated together; no optional compatibility fallback (packages/contracts/AGENTS.md).

## Decision

**Retry policy.** Attempt 1 starts immediately. After `n` consecutive failed attempts, the next is scheduled after a full-jitter delay: `0 ≤ delay < min(30s, 1s × 2^(n−1))`. While the socket has _never_ opened, three failed attempts end the operator-initiated probe cycle in a terminal `failed` state with cause `handshake-exhausted`; the banner's Retry starts immediately and grants a fresh three-attempt cycle. Once a socket has opened even once, automatic retries are uncapped. The backoff counter resets only when a join completes — socket open _and_ snapshot reconciled — not on open alone. A dropped established stream begins recovery with its own immediate first attempt.

**Published vocabulary.** `StreamConnectionState` widens to `connecting | connected | reconnecting | disconnected`. `connecting` is reserved for a console that has never received anything; `reconnecting` for recovery after prior success. Why a console stopped travels as separate metadata — `terminalCause: handshake-exhausted | contract | session-mismatch` — not as more states, because the three causes share every transition and differ only in operator copy.

**Server session epoch.** `packages/contracts` gains `serverSessionIdSchema` (UUID). `fleetSnapshotSchema` and `telemetryBatchSchema` carry it as a required field; `packages/server` mints one `randomUUID()` per `startServer` and stamps both paths from the same value. Because a required field changes the serialized contract, `SCHEMA_VERSION` advances from `"1"` to `"2"` with every in-repository producer, fixture, and consumer updated together.

**Reconciliation.** `isDeltaCoveredBySnapshot` is replaced by `reconcileDeltaWithSnapshot(snapshot, delta) → covered | apply | session-mismatch`. The session comparison wins before any sequence comparison. On join, buffered same-session frames reconcile as before; buffered or live frames from a different session are never applied. A mismatched _live_ stream is closed: the snapshot is retained as explicitly last-known state, row freshness stays suppressed, automatic retries stop, the state is terminal `disconnected` with cause `session-mismatch`, and the banner offers immediate manual retry.

**Restart recovery, end to end.** When an established stream drops because the server restarted, the console reconnects automatically, re-joins against the new process's snapshot — which carries the new session — replaces its picture wholesale, and resumes live updates. No reload, no operator action.

## Positions

1. **Bounded full-jitter backoff, no cap after first success, three-attempt initial probe.** Chosen. The jitter prevents synchronized stampedes after a restart; the ceiling keeps recovery time bounded for an operator watching the banner; the asymmetric cap encodes the one honest distinction the browser can make — a server that has answered once is worth waiting for, one that has never answered may not exist.
2. **Fixed-interval retry.** Rejected: predictable for the operator but hammers a server that is down, and synchronizes every console's retries — worst exactly when the whole fleet of consoles reconnects at once.
3. **Uncapped retry from the first attempt.** Rejected: a wrong URL or dead deployment retries forever behind a banner that implies progress. The stub called this the console lying to its own operator.
4. **A capped retry count even after success.** Rejected: a transient outage would turn a tab left open overnight into a console that silently gave up.
5. **For restart: persist the flush sequence.** Rejected: ADR 6 deliberately keeps no durable state, and persistence would only narrow the window, not close it — a restored counter still cannot say whether the history behind it is the same.
6. **For restart: reset detection by observing a lower sequence.** Rejected: a lower sequence is ambiguous (reordered delivery, a second server), and the absence of a signal is not evidence of continuity. An explicit epoch identity is one field and no inference.

## Argument

The retry schedule and the session epoch had to land together because each is unsound alone. Automatic reconnection without restart detection _widens_ the silent-freeze defect: the console diligently reconnects to the new process and then discards every delta it sends. Restart detection without automatic reconnection detects an epoch change only when an operator happens to click Retry. Together, the common case — server restarts, console recovers by itself — needs no policy beyond "re-join and trust the new snapshot", because the join sequence already replaces state wholesale; the epoch field's real work is refusing the _cross_-epoch application that the sequence numbers would otherwise permit.

Making the session comparison terminal when it fails persistently (mismatched live stream) rather than retrying is the same reasoning as the terminal contract failure in **W-6**: retrying returns the same disagreement, and a console cycling between two servers' histories would present interleaved instants as one fleet — the exact failure Principle 4 names. Retaining the snapshot as last-known keeps the operator's rows on screen under an honest banner instead of blanking the console to prove a point.

Counting the join, not the open, as success keeps the backoff honest against a half-working deployment: a socket that opens onto a snapshot endpoint returning 503 would otherwise reset its backoff every cycle and retry at full speed forever.

## Implications

- The wire format changed: version 2 payloads are refused by version 1 consumers and vice versa. All producers and consumers in this repository moved together; there is no compatibility window, deliberately.
- `packages/web`'s transport owns timers and randomness as injected ports (`RetryTimer`, `random`), so the whole schedule is deterministic under test. `streamLifecycle` owns the pure state machine, delay formula, and constants; `fleetTransport` owns only the sequencing that needs a socket.
- The banner and shell gained a state and three terminal copies: "Connecting to stream · attempt N", "Unable to connect to stream after 3 attempts", "Stream integrity error · showing last known state (may be stale)"; component spec 07 revision 3 and the app-shell spec carry them.
- `shared/ui`'s structurally-restated union and `connectionContext`'s union widened in the same change, as the coupling notes on both require.
- The server's startup log now records `serverSessionId`, so an operator can match a console's integrity error to a deployment event.
- ADR 18's open restart question is closed by this ADR; its reconciliation function was renamed and re-scoped here. The at-or-below boundary and its shelf-life warning carry over unchanged into the same-session branch.
- ADR 23's three-value connection vocabulary is amended to four by this ADR; the projection in `streamLifecycle` remains the one place the loss of detail is visible.
- Browser-level proof of the recovery flow (restart the real stack, watch the console re-join without reload) is the first scenario owed to the D23 browser-evidence decision; unit, contract, and process boundaries are covered in this change.

## Open questions

- **Should `reconnecting` distinguish "scheduled, waiting out a delay" from "attempt in flight"?** Current lean: no — the banner's attempt counter moves on each attempt, which is the observable that matters. Reopens if operators report the waiting period reads as a hang.
- **Should the terminal integrity state auto-clear if the mismatched server later answers with a matching session?** Current lean: no — it cannot answer while the stream is closed, and probing quietly would blur the deliberate line between automatic and manual recovery. Reopens with real deployment evidence of transient split-brain proxies.

## Observed consequences

- **20 August 2026 — the browser-level proof owed to D23 was delivered (ADR 32).** Against the real stack, the smoke suite kills the server process, watches the banner report reconnecting over retained last-known rows, restarts a genuinely new process — new session, sequence back at zero — and observes the console re-join and resume live row updates without Retry or reload. Proven in Chromium and Firefox locally; the WebKit project is configured for CI, where its system libraries are installed.
- **20 August 2026 — implemented and verified at three boundaries in the landing change.** Contracts: session field required on both shapes, version-1 payloads rejected, all three reconciliation outcomes pinned (`envelopeSchema.test.ts`). Server: one runtime stamps one identity on both paths, restart mints a new one while the sequence returns to zero, and the cross-restart reconciliation was proven over real sockets and real wire bytes (`runServer.test.ts`). Web: the schedule's exact delay ladder (1s, 2s, 4s … 30s ceiling), zero-delay jitter draws, the three-attempt probe, fresh cycles on manual retry, backoff reset only on join, single-socket invariants, stale-callback immunity, and automatic restart recovery without retry or reload (`fleetTransport.test.ts`, fake timers and pinned randomness).

## Related

- **ADR 2** (HTTP ingest, WebSocket fan-out) — the join order whose recovery this ADR defines; cold start and reconnect remain the same path.
- **ADR 18** (flush sequence) — created the sequence this ADR scopes and left the restart question open; amended by this ADR's closure of that question.
- **ADR 23** (connection state through shared lib) — the published vocabulary this ADR widens from three values to four; the delivery mechanism is unchanged.
- **ADR 3** (server-derived freshness) — the suppression rule every non-connected state continues to honor.
- **ADR 6** (bounded in-memory state) — the reason sequence numbers restart and persistence was not a viable position.
- **Register D22** — resolved by this ADR.
- **Register D23** — owns the browser-level automation this ADR's recovery flow is the first scenario for.
- **Principle 4** (never present stale data as current) — the reason cross-epoch application and optimistic terminal states are disqualifying.
- **Principle 5** (complete async state vocabularies) — the reason `connecting` and the terminal causes are declared rather than collapsed.

## Notes

The three-attempt limit and the 30-second ceiling are policy numbers, not measurements; they were chosen for operator legibility (the banner can state both honestly) and are cheap to amend without reversing this decision.
