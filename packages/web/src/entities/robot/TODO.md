# TODO — `entities/robot`

**Authority:** Planning only. Accepted ADRs and the web package specification govern conflicts.
**Reconciled:** 20 August 2026 against the three-vendor join and live HTTP/WebSocket consumers.

## Status

The entity decodes canonical fleet, detail, and health responses; maps all three recorded
vendor paths into the browser read model; subscribes to the live fleet store; and keeps
freshness as a server-supplied field. Test-only adapter access is enforced by ADR 12 and
does not enter the production bundle.

## Remaining work

- **W3 — derive vendor filters from observed fleet data.** `Robot.vendor` is open-ended,
  but the fleet filter still imports the closed `VENDORS` list. Derive options from the
  fleet before removing the compatibility alias and constant.
- **Fleet resource state.** Replace the bare-array hook contract with a discriminated state
  only as part of fleet A1, keeping transport lifecycle in `app` and robot data here.
- **Future contract revisions.** A regressions counter or other new stream fields begin in
  `@fleet/contracts` after their decisions are ratified; do not invent local optional
  fields. (Session-aware reconciliation landed with ADR 31; battery history landed with
  ADR 33 — `useRobotHistory` decodes the contracts-owned response here and never joins the
  delta store.)

## Settled constraints

Unknown-field counts stay adapter-scoped and are injected from the health response rather
than placed on a robot envelope. Connectivity remains the vendor-reported value—currently
`unknown` for every supported dialect—and is never inferred from freshness.
