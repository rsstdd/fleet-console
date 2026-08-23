# TODO — robot data layer (`hooks`, `stores`, `types`, `utils` mapping)

**Authority:** Planning only. Accepted ADRs and the web package specification govern conflicts.
**Reconciled:** 20 August 2026 against the three-vendor join and live HTTP/WebSocket consumers.

## Status

The entity decodes canonical fleet, detail, and health responses; maps all three recorded
vendor paths into the browser read model; subscribes to the live fleet store; and keeps
freshness as a server-supplied field. Test-only adapter access is enforced by ADR 12 and
does not enter the production bundle.

## Remaining work

- **W3 — derive vendor filters from observed fleet data — done (20 August 2026).** The
  closed `Vendor` union and `VENDORS` constant are deleted; the fleet filter derives its
  options from the robots it was given, and a unit test drives a vendor outside A/B/C
  through it (ADR 1).
- **Fleet resource state — done with fleet A1 (20 August 2026).** `useFleetRobots` returns
  the entity-owned `FleetResourceState` union; the store receives explicit
  snapshot-start/success, recoverable/terminal failure, and batch transitions from the
  app transport, keeping transport lifecycle in `app` and robot data here. `useFleetRobot`
  adds the per-id subscription behind live robot detail (R6).
- **Future contract revisions.** A regressions counter or other new stream fields begin in
  `@fleet/contracts` after their decisions are ratified; do not invent local optional
  fields. (Session-aware reconciliation landed with ADR 31; battery history landed with
  ADR 33 — `useRobotHistory` decodes the contracts-owned response here and never joins the
  delta store.)

## Settled constraints

Unknown-field counts stay adapter-scoped and are injected from the health response rather
than placed on a robot envelope. Connectivity remains the vendor-reported value—currently
`unknown` for every supported dialect—and is never inferred from freshness.
