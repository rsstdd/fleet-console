# Gate Slow-Client Drain Protection

**Authority:** Planning only. This work is trigger-deferred and is not a registered decision.
**Status:** Trigger-deferred
**Updated:** 2026-08-20
**Trigger:** Representative slow-client evidence appears or a target deployment requires explicit WebSocket resource limits.

## Summary

Preserve the existing bounded per-client coalescing behavior and defer both decision
registration and runtime work until representative slow-client evidence appears or a
target deployment requires explicit WebSocket resource limits. This plan does not block
D22 or any feature phase.

## Recommended future decision

- Configure both controls through a future strictly validated config/stream.json:
  - noProgressTimeoutMs: 30_000
  - bufferedByteCeiling: 1_048_576

- Consider a client stalled only while bytes or sends are outstanding. An idle connection with zero buffered bytes never accrues no-progress time.
- Define progress as a successful send completion or observed reduction to the queued bytes. Check stalled clients on the fan-out interval even when no new
  deltas are pending.

- Before enqueueing a frame, close the client if its UTF-8 byte length plus the socket’s buffered bytes would exceed the ceiling.
- Close either condition with private WebSocket code 4001 and stable reason slow-client-backpressure; structured diagnostics distinguish no-progress-timeout
  from buffered-byte-ceiling.

- Discard that client’s pending coalesced state on closure. Describe recovery as reconnecting through D22’s socket-first, snapshot-second joining path—not as
  replaying or recovering lost messages.

- Treat this as a recoverable post-connection close in D22. Bounded exponential backoff applies, and the next snapshot becomes authoritative.

## Deferred Implementation Contract

- When the trigger fires, widen the listener/fan-out client port to expose buffered bytes, send completion, and close(code, reason), while keeping socket-
  specific APIs out of the fan-out core.

- Inject the clock so timeout behavior is deterministic; ensure shutdown, normal peer closure, and fan-out removal cancel all client monitoring.
- Add process-scope health counters separated by trigger and a stable structured event such as fleet.stream.slow_client_closed, including cause, buffered
  bytes, stalled duration, and an opaque connection correlation identifier.

- Extend the contracts-owned health response only when implementation begins; do not publish zero-valued fields for behavior the server does not yet measure.
- Trigger implementation when representative testing or production evidence shows persistent buffered bytes/no send completion, or when deployment hardening
  requires bounded socket retention regardless of observed incidents.

## Documentation and verification

- While gated, update server H6b/M6, the server package specification, root TODO, and
  affected READMEs only as needed to record the recommendation and explicit trigger;
  describe it as unregistered and unimplemented.
- When the trigger fires, allocate the next available D-id and ADR, update
  `docs/decisions.json`, regenerate the decision index, and update the server package
  specification, root and server TODOs, and root and server READMEs with the decided
  implementation.
- Leave the historical decision audit unchanged and keep D22 independently actionable.
- Run `pnpm docs:decisions` when a mapping is added, `pnpm
check:architecture-docs`, formatting checks for changed documentation, and `git diff
--check`.

## Assumptions

- While gated, this adds no decision mapping, configuration file, runtime fields, health
  schema, tests, dependencies, or socket behavior.
- The 30-second and 1 MiB values are initial deployment defaults and remain configurable when implemented.
- One closure increments exactly one cause counter, even if both conditions are observed during the same check.
- No commit is created.
