# TODO — `packages/contracts`

**Authority:** Planning only. Accepted ADRs and the contracts package specification govern conflicts.
**Reconciled:** 20 August 2026 against all five package suites and the running vertical path.

## Status

`@fleet/contracts` is locally complete: its public schemas, codecs, error vocabulary,
health responses, and pure freshness derivation are covered by 150 tests. The adapter,
server, simulator, and web consumers are wired and the raw-fixture-to-browser join covers
all three vendors.

## Remaining cross-package gates

- **D22 — stream recovery and server-restart reconciliation.** Any required wire evolution
  begins here only after a numbered ADR ratifies it.
- **Battery history.** The proposed history response and retention constants are not a
  contract until the history/retention decision is registered and ratified.
- **Regressive sequence reporting.** Do not add a counter until a consumer-driven health
  contract revision is approved; lower sequences are already rejected by server state.
- **D23 — browser automation.** This package has no implementation work, but its strict
  parsers and encoders must be used by any committed browser harness rather than hand-built
  canonical payloads.

## Verification

Package tests, lint, typecheck, and build pass. Cross-package contract changes must also run
adapter, server, simulator, and web consumers plus the architecture-documentation checks.

## Recorded consumer cost

Zod remains in the browser bundle because the console decodes network input at its boundary.
The first-load budget is 720 kB raw / 300 kB gzip and is enforced by ADR 22.
