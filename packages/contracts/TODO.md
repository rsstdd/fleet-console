# TODO — `packages/contracts`

**Authority:** Planning only. Accepted ADRs and the contracts package specification govern conflicts.
**Reconciled:** 20 August 2026 against all five package suites and the running vertical path.

## Status

`@fleet/contracts` is locally complete: its public schemas, codecs, error vocabulary,
health responses, battery-history response, and pure freshness derivation are covered by
174 tests. The adapter,
server, simulator, and web consumers are wired and the raw-fixture-to-browser join covers
all three vendors.

## Remaining cross-package gates

- **Stream recovery and server-restart reconciliation — done (ADR 31, 20 August 2026).**
  The wire evolved to version 2: `serverSessionId` is required on fleet snapshots and
  telemetry batches, and `reconcileDeltaWithSnapshot` replaced the sequence-only rule.
- **Battery history — done (ADR 33, register D24, 20 August 2026).**
  `robotBatteryHistorySchema` and its constants are the contract: literal 60-second
  window, 60-point budget, its own `schemaVersion: "1"`, and cross-field checks that
  enforce the server decimator's count and window invariants on the wire.
- **Regressive sequence reporting.** Do not add a counter until a consumer-driven health
  contract revision is approved; lower sequences are already rejected by server state.
- **Browser automation — done (ADR 32, 20 August 2026), and the constraint held.** The
  committed scale measurement expands its 500-robot seed through `encodeCanonicalEnvelope`
  and re-validates with `parseFleetSnapshot`/`parseTelemetryBatch` before serving a byte;
  no browser test hand-builds a canonical payload.

## Verification

Package tests, lint, typecheck, and build pass. Cross-package contract changes must also run
adapter, server, simulator, and web consumers plus the architecture-documentation checks.

## Recorded consumer cost

Zod remains in the browser bundle because the console decodes network input at its boundary.
The first-load budget is 720 kB raw / 300 kB gzip and is enforced by ADR 22.
