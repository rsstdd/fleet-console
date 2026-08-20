# Web Package Alignment Plan

**Authority:** Historical. This plan records the web package alignment executed on 20 August 2026; current ADRs, package specifications, and shipped tests supersede its status claims.

**Archived 20 August 2026** from `docs/05_plans/WEB.md`, by owner decision, with two acceptance items still outstanding rather than on completion: manual screen-reader reading-order and forced-colors evidence needs a host with real assistive technology, which the implementation host (headless WSL2) lacks. Those two items remain live work in the root `TODO.md` (P2.7 screen-reader verification; P3.3 forced-colors evidence) — this archive does not claim them. Everything else the plan required is consumed by ADR 34 (register D25), the amended ADRs 14 and 25, `docs/03_package-specs/05_WEB.md`, the fleet and robot-detail page specifications (Revisions 6 and 8), and the recorded test evidence below.

## Summary

- Create docs/05_plans/WEB.md as the single active, planning-only document; archive it when all acceptance evidence is recorded.
- Correct the substantive gaps: incomplete fleet resource states, invisible contract failures, non-live robot detail, invented site labels, closed vendor filters, misleading “local fixture” provenance, unsurfaced rejected frames, and stale documentation.
- Preserve ADR 26’s demo-only raw diagnostics. Production deployment remains explicitly blocked until authentication and authorization supersede that decision.

## Contract and Data Changes — [DONE] 2026-08-20

- **ADR 34** recorded for the wire change (registered as D25); ADRs 14 and 25 amended with the roster and response consequences.
- `SCHEMA_VERSION` advanced "2" → "3" with no compatibility fallback; producers, consumers, fixtures, schemas, and documentation moved together (`pnpm record:fixtures` re-recorded cleanly).
- Exported `fleetSiteSchema` and `FleetSite` with strict `{ siteId, label }`; required `sites` on `FleetSnapshot`; duplicate site ids and robot references to undefined sites are rejected in the schema itself.
- Server manifest widened to `{ sites, robots }` with unique sites and validated robot references; committed configuration seeds North site, South site, East site.
- Simulator emits the same directory (`SITE_DIRECTORY`); byte-for-byte manifest parity held with no new mechanism. Manifest, parity, and fleet-snapshot schema mechanisms registered under `mechanicalRules` (ADR 14 ×2, ADR 34).
- Site directory travels on `GET /api/fleet` only; envelopes keep carrying bare `siteId`.

## Web Implementation — [DONE] 2026-08-20

- `useFleetRobots()` returns the `FleetResourceState` union (loading, ready, refreshing, recoverable-error with the one retry, terminal-error with issue paths/codes); data-bearing states retain robots, sites, snapshot `capturedAt`, and latest stream-frame `sentAt`.
- The entity-owned fleet store receives explicit snapshot-start, snapshot-success, recoverable-failure, terminal-failure, and batch transitions from the app transport; the orphaned `contractFailure` hook field is removed.
- The fleet page renders the complete state matrix, keeps connection state separate, and continues suppressing freshness while the stream is not connected.
- The footer states decoded provenance (snapshot capture time; latest WebSocket `sentAt`, “none yet” before the first frame); the false “source: local fixture” claim is gone.
- `VENDORS`, the closed `Vendor` type, and the fixture-backed `SITES` table are removed; vendor options derive from the robots given and site options/labels from the snapshot directory, raw id as transient pre-directory fallback only.
- The keyed robot read model carries model, connectivity, position, capabilities, and observed/registered state; `useFleetRobot(id)` plus pure `reconcileDetailWithRow` keep detail live from deltas without refetching diagnostics/history and without re-rendering for unrelated robots.
- `StreamDiagnosticsContext` carries the session-wide rejected-frame count into technician Diagnostics with its scope stated; repeated-frame escalation remains trigger-deferred (`docs/05_plans/HANDLE_MALFORMED_STREAM_FRAMES.md`, trigger restated).
- The cross-feature violation fixture targets the real `RobotDetailPage` export; the `RobotDetail = "placeholder"` export is deleted and the boundary suite still reports the rule.
- The table stays unvirtualized within the existing bundle budget; the measured ADR 24 trigger remains unfired (500-robot run re-measured green after the schema change).

## Documentation Reconciliation — [DONE] 2026-08-20

- Web package spec updated: open-vendor model, resource-state ownership, live-detail reconciliation, site-directory contract, provenance, corrected boundary-fixture note, full ADR roster, and a Principles 1–15 enforcement/evidence mapping (§ 13).
- Fleet and robot-detail page specs revised (Revisions 6 and 8); all eight component implementation paths corrected to camelCase; malformed-payload behavior stated: snapshots terminal, frames dropped/counted/surfaced.
- Root and package READMEs updated: version 3, site labels, live detail, the tenant-B/e2e commands, local Chromium/Firefox versus CI WebKit, ADR 26 demo-only boundary named in § 9; volatile hard-coded test counts removed where not dated audit evidence.
- TODOs reconciled: W3, A1, A4 (surface), R6, R7, P2.5, F16 closed with their evidence; the six/seven Playwright drift and stale W-6/W-8/A3 references corrected (code comments now cite ADR 20/ADR 15 directly).
- `packages/web/UI_PLAN.md` moved to `docs/04_archive/WEB_UI_PLAN.md` with its replacement recorded; `authorityMarkers` repointed; contracts README version claim corrected ("1" → "3" with the version history).
- `docs/05_plans/SERVER.md` was found tracked with valid metadata; `check:architecture-docs` passes, so the reported blocking condition no longer exists and nothing there was modified.

## Test and Acceptance Evidence — [DONE] 2026-08-20

- Focused tests first, then implementation, across contracts (site-schema validation, version rejection), server (manifest, snapshot encoding, runtime), simulator (directory emission, parity), and web (resource-state transitions, retained-data errors, provenance, dynamic filters, live-detail reconciliation, unrelated-robot subscription identity, rejected-frame diagnostics, fixture retarget).
- **Workspace tests, serial:** 180 (contracts) + 227 (adapters) + 193 (server) + 211 (simulator) + 340 (web) — all passing.
- **Browser coverage (ADR 32):** smoke suite extended with live robot-detail deltas without navigation, manifest site labels and filters, initial server failure → visible retry → recovery, and a controlled malformed-snapshot terminal case — 11/11 in Chromium and 11/11 in Firefox locally; WebKit remains CI-only (this host lacks its system libraries; CI installs them with `--with-deps` and `pnpm test:e2e` requires all three engines there).
- **Tenant-B production build (new `tenant-b-chromium` project, wired into CI):** 3/3 — light theme painted (`rgb(244, 242, 236)` body), lidar panel disabled while the robot still declares it, narrow-viewport (390px) usable with no horizontal document scroll.
- **Scale:** `test:e2e:scale` re-measured green at 500 robots / 10 Hz after the schema change (120/120 frames applied).
- **Gates:** `pnpm docs:decisions`, `check:architecture-docs`, `check:type-safety`, `check:doc-comments`, `check:tokens`, `check:dependencies`, serial `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm record:fixtures` + clean fixture diff, `check:diff-size`, `check:bundle` (598.56 kB raw / 180.94 kB gzip against 720/300), `git diff --check`, and the full `pnpm check:ci` — all passing on 2026-08-20.
- **`pnpm dev` verified in a running browser** (headless Chromium against the live dev stack): 50 rows rendered, “North site” offered and labelled from the manifest directory, a fleet row’s last-seen advanced live, and robot detail values changed from deltas without navigation or reload.
- **Outstanding at archive time:** manual screen-reader reading order and forced-colors results. Not claimed here; they remain tracked as root `TODO.md` P2.7 and P3.3, and WCAG completion is not asserted until they are recorded there.
