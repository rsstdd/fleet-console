# TODO — `features/robot`

**Authority:** Planning only. The robot-detail page specification and accepted ADRs govern conflicts.
**Reconciled:** 20 August 2026 against live detail/health fetches and the web unit suites.

## Status

Robot detail fetches and strictly decodes the single-robot, battery-history, and health
endpoints, renders capability-driven operator/technician panels and the battery-history
sparkline, keeps each secondary resource's failure independent from the main resource, and
suppresses per-robot freshness whenever the stream is not connected.

## Remaining work

- **R6 — live background updates — done (20 August 2026).** The page subscribes to this
  robot's fleet row through `useFleetRobot(id)` and overlays it onto the fetched detail
  with the pure `reconcileDetailWithRow`: core values and freshness update from deltas
  with no refetch, unrelated robots' deltas cause no re-render, and the Playwright suite
  watches detail values change live without navigation.
- **R7 — remove the placeholder boundary export — done (20 August 2026).** The deliberate
  fleet violation fixture imports the real `RobotDetailPage` export, the boundary test
  still reports the rule, and `RobotDetail = "placeholder"` is deleted.
- **Battery history — done (ADR 33, register D24, 20 August 2026).** `useRobotHistory`
  fetches the ratified contract once per visit as its own resource beside `useRobotDetail`,
  and the "Battery history" section renders the full state matrix — loading, inline retry,
  terminal contract failure, and honest prose for empty, null-only, and single-reading
  windows — around an accessible inline-SVG sparkline with a visible textual summary. Its
  failure degrades the section inline and never blanks valid robot detail; the Playwright
  scenario proves the retained window survives the robot going silent.
- **Browser automation — done (ADR 32, 20 August 2026).** The committed smoke suite opens
  this page in real engines: capability panels per vendor (presence and absence), heading
  structure, and keyboard navigation from the fleet table. Real screen-reader and
  subjective forced-colors checks remain manual evidence, per that ADR.

## Constraints

Panels remain capability-driven, never vendor-driven. Raw payload remains technician-only
and is explicitly identified as unauthenticated per ADR 26. Historical values may remain
visible during stream loss only when they are unambiguously historical.

## Settled test placement

Test files inherit their production layer and obey the same feature/entity/shared import
direction. `robotDetailFixtures.ts` therefore stays inside `features/robot`, in the
feature's `tests/` directory beside its only consumers — the `robotDetailPage.test.tsx`
and `tenantPanelFlag.test.tsx` suites. That is same-feature reuse, not duplication, and
`src/test` is not a universal permissive layer. Revisit only if fixture construction or
data is materially copied across production layers or feature directories.
