# TODO — `features/robot`

**Authority:** Planning only. The robot-detail page specification and accepted ADRs govern conflicts.
**Reconciled:** 20 August 2026 against live detail/health fetches and 265 web tests.

## Status

Robot detail fetches and strictly decodes the single-robot and health endpoints, renders
capability-driven operator/technician panels, keeps health failure independent from the main
resource, and suppresses per-robot freshness whenever the stream is not connected.

## Remaining work

- **R6 — live background updates.** Detail is fetched on navigation and does not subscribe
  to fleet deltas, so changing summary/header values in place remains unverified and the
  page can lag the fleet store until navigation or retry.
- **R7 — remove the placeholder boundary export.** Retarget the deliberate fleet
  feature-to-feature violation at the real `RobotDetailPage` export, prove lint still
  reports the boundary, then remove `RobotDetail = "placeholder"`.
- **Battery history.** The sparkline is proposed but blocked on a registered and ratified
  history/retention contract; no planning document is authority to add it.
- **D23/manual accessibility evidence.** Commit the browser workflow selected by D23 while
  retaining real screen-reader and subjective forced-colors checks as manual evidence.

## Constraints

Panels remain capability-driven, never vendor-driven. Raw payload remains technician-only
and is explicitly identified as unauthenticated per ADR 26. Historical values may remain
visible during stream loss only when they are unambiguously historical.
