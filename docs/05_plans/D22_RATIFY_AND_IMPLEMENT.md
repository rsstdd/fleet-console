# Ratify and implement D22 stream recovery

**Authority:** Planning only. D22 remains open until a numbered ADR is accepted.
**Status:** Active
**Updated:** 2026-08-20

## Summary

Create the next available ADR resolving D22 with:

- An immediate first attempt followed by full-jitter exponential retries: 0 ≤ delay < min(30s, 1s × 2^(failedAttempt−1)).
- Three attempts per initial-handshake cycle before requiring manual retry.
- Unlimited automatic retries after the console has completed at least one successful connection.
- A distinct published connecting state; reconnecting is reserved for recovery after prior success.
- A process-unique server session identifier on fleet snapshots and WebSocket batches.
- Snapshot authority during session mismatch: retain/apply the snapshot, reject mismatched deltas, suppress freshness, close the stream, and require manual
  retry.

## Decision and contract changes

- Add the next available ADR, map D22 to it in docs/decisions.json, regenerate the pending-decision index, and resolve ADR 18’s restart question.
- Define a required UUID-format serverSessionId contract field on FleetSnapshot and TelemetryBatch, generated once per server runtime and shared by the
  snapshot and fan-out paths.

- Deliberately advance the wire schema version because adding a required field changes the serialized contract. Update all in-repository producers, fixtures,
  and consumers together; do not add an optional compatibility fallback.

- Replace sequence-only reconciliation with a contracts-owned result distinguishing:
  - same session and covered;
  - same session and newer;
  - different server session.

- Widen the connection vocabulary to connecting | connected | reconnecting | disconnected. Keep terminal causes as separate metadata: initial-handshake
  exhaustion, contract failure, or session-integrity mismatch.

## Implementation changes

- Generate/inject one server session UUID when starting the server. Include it in every snapshot and delta from that runtime; a restart necessarily creates a
  new value.

- Refactor the transport around an injected timer and random source so retry behavior is deterministic in tests:
  - attempt 1 starts immediately;
  - after failed attempt n, schedule the next attempt using the selected full-jitter formula;
  - stop after three never-opened attempts and expose an unable-to-connect terminal state;
  - manual Retry cancels any pending timer, starts immediately, and grants another three-attempt initial probe cycle;
  - after prior success, retry without a cap;
  - cancel timers and ignore stale callbacks on unmount, explicit disconnect, superseded attempts, or terminal failure;
  - never permit concurrent sockets.

- Consider a retry successfully reset only after the socket and matching snapshot complete the joining sequence. A snapshot network failure closes the attempt
  and follows retry policy; an undecodable snapshot remains terminal.

- During reconciliation:
  - apply the decoded snapshot as authoritative;
  - apply only buffered/live batches carrying its session identifier;
  - discard mismatched batches;
  - close the mismatched stream, retain the snapshot as last-known state, enter terminal disconnected/integrity state, and wait for manual Retry.

- Update the banner and shell:
  - connecting: “Connecting to stream” with attempt number;
  - reconnecting: existing recovery copy with attempt and last-event details;
  - exhausted initial connection: “Unable to connect to stream after 3 attempts”;
  - session mismatch: “Stream integrity error · showing last known state (may be stale)”;
  - all non-connected states continue suppressing per-robot freshness.

- Update the new D22 ADR, ADR 18, `docs/decisions.json`, and the generated pending-decision
  index.
- Update the connection-banner component specification, app-shell page specification,
  affected contracts/server/web package specifications, root and affected scoped TODOs,
  and root and affected package READMEs.
- Leave the dated decision audit unchanged; it remains historical evidence of the state
  observed on 20 August 2026.

## Test and acceptance plan

- Contracts: accept valid UUID session identifiers; reject missing/malformed identifiers and old-version payloads; test all three reconciliation outcomes.
- Server: prove one runtime emits the same identifier in snapshots and batches, separate starts produce different identifiers, and sequence numbers may
  restart at zero safely.

- Lifecycle/transport with fake timers and deterministic randomness:
  - exact delay bounds and 30-second ceiling;
  - three initial failures then terminal;
  - manual retry starts immediately;
  - unlimited post-success recovery;
  - successful join resets backoff;
  - snapshot request failure retries;
  - contract failure and session mismatch do not loop;
  - stale callbacks, unmounts, and repeated Retry clicks cannot create concurrent sockets.

- UI: verify connecting/reconnecting/terminal copy, retry accessibility, context propagation, and freshness suppression for every non-connected state.
- Integration: start the full stack, load the console, restart the server so its sequence returns to zero with a new session identifier, and verify without
  reloading that rows are retained during the outage, freshness labels are suppressed, automatic reconnection replaces state from the new snapshot, and live
  updates resume.

- Run affected contracts, server, and web tests plus typecheck/lint/build, pnpm check:type-safety, pnpm check:architecture-docs, the repository test command,
  and git diff --check.

- Before closing the phase, verify that ADRs, the decision mapping, generated index,
  specifications, TODOs, and READMEs all describe the implemented recovery behavior.

## Assumptions

- The browser classifies an initial handshake only by whether the socket ever opened; it does not claim to distinguish HTTP 404, origin rejection, DNS
  failure, or refusal because the WebSocket API does not reliably expose those details.

- “Three attempts” means three attempts in each operator-initiated initial probe cycle.
- Session identifiers provide sequence-epoch identity, not persistence or cross-session continuity.
- Persistent snapshot/stream session disagreement is a deployment-integrity failure, not a condition in which the console may continue claiming a healthy
  stream.

- No dependencies are added and no commit is created.
