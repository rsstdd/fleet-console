# Regressive Sequence Observability

**Authority:** Historical only. This plan was consumed by the server implementation,
package specification, TODOs, READMEs, and focused tests named below.
**Status:** Done
**Archived:** 2026-08-20
**Superseded by:** `packages/server/src/state/currentStateStore.ts`,
`packages/server/src/ingest/ingestTelemetry.ts`, `packages/server/src/runServer.ts`, and
`docs/03_package-specs/04_SERVER.md` § State and verification matrix.

> Executed without a D-id, ADR, health-contract change, dependency, browser requirement,
> or counter reclassification. The server suite passed 189 tests; focused tests cover the
> enriched store result, exact safe event, non-emitting inputs, unchanged state/history/
> diagnostics/deltas/counters, and the logger's live composition path.

## Summary

Implement only structured logging as a non-critical follow-up. Regressive readings
remain rejected without changing robot state, history, deltas, or existing health
counters. Create no D-id or ADR for the logging change. Add `regressions` to
`SequenceHealth` only during the next consumer-driven health/diagnostics contract
version.

## Immediate Changes

- Do not register a decision or mark an existing decision Partial; the structured event
  records an already-required rejected condition without changing the health contract.
- Enrich the pure store’s out-of-order result with acceptedSequence and receivedSequence; keep the store free of logging dependencies.
- Inject the existing server Logger into ingestTelemetry.
- Emit one warning per rejected regression:
  - event: telemetry.sequence_regression
  - fields: robotId, vendorId, adapterId, acceptedSequence, receivedSequence, and server receivedAt

- Do not log raw payloads or vendor-provided prose. Accepted readings, duplicates, malformed payloads, and counterless dialects do not emit this event.
- Do not increment gaps, duplicates, adapter failures, or malformed-ingest counts. A lower sequence is a distinct condition.

## Deferred Contract Change

- Trigger only when a real health or technician-diagnostics consumer requires a new response version; logging evidence alone does not force versioning.
- In that coordinated version:
  - add required non-negative regressions beside gaps and duplicates on evaluated SequenceHealth;
  - count rejected lower-sequence arrivals per robot since process start;
  - sum them into the existing per-vendor health rollup;
  - expose the per-robot value in technician diagnostics;
  - preserve { evaluated: false } without counters for dialects that cannot evaluate sequence;
  - advance the applicable wire version and update every strict producer, decoder, fixture, and consumer together—no optional compatibility fallback.

- Do not add a separate process-wide regression counter; per-robot state and its derived per-vendor fold remain the authoritative scopes.

## Tests and Documentation

- Write focused tests first proving a regression reports both sequence values while leaving current state, retained payload, history, delta state, gaps, and
  duplicates unchanged.

- Verify exactly one structured event with the stable name and safe fields; assert duplicates and accepted readings produce none.
- Verify server composition passes the injected logger through the ingest path.
- Update the D6a remainder in root TODO, the server TODO and package specification, and
  root and server READMEs to distinguish “structured logging implemented” from
  “contract counter deferred.”
- Leave `docs/decisions.json` and the generated decision index unchanged until the
  consumer-driven contract-version trigger fires.
- Leave the historical audit unchanged and keep this work off feature and UI critical paths.
- Run server tests, lint/typecheck, pnpm check:type-safety, decision-index generation, pnpm check:architecture-docs, repository tests, and git diff --check.

## Assumptions

- The logging slice consumes no decision or ADR number. A later consumer-driven contract
  version allocates identifiers only if it introduces a genuinely new decision.
- The current health schema and schema version remain unchanged in this slice.
- No browser verification is required because there is no user-visible change.
- No dependencies or commits are added.
