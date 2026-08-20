# Web Package Alignment Plan

**Authority:** Planning only.
**Status:** Active
**Updated:** 2026-08-20

## Summary

- Create docs/05_plans/WEB.md as the single active, planning-only document; archive it when all acceptance evidence is recorded.
- Current evidence: 313/313 web tests and all 1,114 workspace tests pass; web lint/build, strictness, documentation comments, tokens, dependencies,
  formatting, bundle budget, and 500-robot scale checks pass. Chromium/Firefox pass all 14 smoke runs; WebKit is CI-only because this host lacks its system
  libraries.

- Correct the substantive gaps: incomplete fleet resource states, invisible contract failures, non-live robot detail, invented site labels, closed vendor
  filters, misleading “local fixture” provenance, unsurfaced rejected frames, and stale documentation.

- Preserve ADR 26’s demo-only raw diagnostics. Production deployment remains explicitly blocked until authentication and authorization supersede that
  decision.

## Contract and Data Changes

- Record a new ADR for the required wire change, using the next identifiers at implementation time. Amend ADRs 14 and 25 with the resulting roster and
  response consequences.

- Advance SCHEMA_VERSION from "2" to "3" with no compatibility fallback, updating all producers, consumers, fixtures, schemas, and documentation together.
- Add exported fleetSiteSchema and FleetSite with strict { siteId, label } fields. Add required sites to FleetSnapshot; reject duplicate site IDs and robot
  references to undefined sites.

- Widen the server manifest to { sites, robots }, with unique site definitions and validated robot references. Seed the committed configuration with North
  site, South site, and East site.

- Make the simulator emit the same site directory and preserve ADR 14’s byte-for-byte manifest parity. Register the manifest, parity, and fleet-snapshot
  schema mechanisms under mechanicalRules.

- Carry the site directory through GET /api/fleet only; telemetry envelopes continue carrying authoritative siteId values without duplicating labels.

## Web Implementation

- Replace useFleetRobots(): Robot[] with a FleetResourceState union covering loading, ready, refreshing, and recoverable/terminal error. Ready-bearing states
  retain robots, sites, snapshot capture time, latest stream-frame time, and safe error details; only recoverable states expose retry.

- Have the entity-owned fleet store receive explicit snapshot-start, snapshot-success, recoverable-failure, terminal-failure, and batch transitions from the
  app transport. Remove the orphaned contractFailure state once the resource union renders it.

- Render the complete fleet state matrix: initial loading, empty roster, filtered empty, retained rows during refresh/error/offline, recoverable retry, and
  terminal contract failure with contract issue paths/codes. Keep connection state separate and continue suppressing freshness whenever the stream is not
  connected.

- Replace the false “source: local fixture” footer with decoded provenance: fleet API snapshot capture time and, when present, latest WebSocket sentAt.
- Remove VENDORS, the closed Vendor type, and the fixture-backed SITES table. Derive vendor options from observed robots and site options/labels from the
  snapshot directory; retain raw site ID only as a transient fallback before the directory is available.

- Expand the keyed robot read model with the canonical fields needed by detail (model, connectivity, position, capabilities, and observed/registered state).
  Add a per-ID useFleetRobot subscription and a pure reconciliation function so detail core values and freshness update from deltas without refetching
  diagnostics/history or re-rendering for unrelated robots.

- Add a stream-diagnostics context carrying the session-wide rejected-frame count. Show it only in technician Diagnostics with its scope stated; keep
  repeated-frame escalation trigger-deferred.

- Retarget the deliberate cross-feature violation fixture to the real RobotDetailPage export and remove the placeholder RobotDetail.
- Preserve the unvirtualized table and existing bundle budget; the measured ADR 24 trigger remains unfired.

## Documentation Reconciliation

- Update the web package spec with the actual open-vendor model, resource-state ownership, live-detail reconciliation, site-directory contract, provenance,
  boundary fixtures, all relevant ADRs, and a concise enforcement/evidence mapping for Principles 1–15.

- Correct the fleet and robot-detail page specs, all eight component implementation paths to camelCase, and malformed-payload behavior: malformed snapshots
  are terminal; malformed stream frames are dropped, counted, and surfaced.

- Update root and package READMEs with measured test commands/results, local Chromium/Firefox versus CI WebKit instructions, version 3, site labels, live
  detail behavior, and the demo-only security boundary. Remove volatile hard-coded test counts where they are not dated audit evidence.

- Reconcile root and scoped TODOs: close W3, A1, A4, R6, R7, P2.5, and F16 only after their evidence lands; correct the six/seven Playwright drift and stale
  W-6/W-8/A3 references. Leave manual accessibility evidence, production authentication, and genuinely trigger-deferred work open.

- Move historical packages/web/UI_PLAN.md into docs/04_archive/, record its replacement, and stop linking it as current remaining work. Update package specs
  and READMEs affected by the schema change, including the stale contracts README version claim.

- Do not modify the unrelated untracked docs/05_plans/SERVER.md; its invalid metadata currently prevents check:architecture-docs from passing and must be
  reported separately if still present.

## Test and Acceptance Plan

- Write focused tests first for site-schema validation, manifest parity, version rejection, server snapshot encoding, resource-state transitions, retained-
  data errors, provenance, dynamic filters, live-detail reconciliation, unrelated-robot subscription stability, rejected-frame diagnostics, and placeholder
  removal.

- Extend browser coverage with:
  - Live robot-detail values changing from WebSocket deltas without navigation or reload.
  - Manifest-provided site labels and filters.
  - Initial server failure followed by visible retry and recovery.
  - A controlled malformed-snapshot browser case for terminal UI behavior.
  - A real tenant-B production build in Chromium, including its light theme, disabled lidar panel, and narrow viewport behavior.

- Retain real-stack Chromium/Firefox smoke and the Chromium 500-robot measurement locally; require all three smoke engines, including WebKit, in CI.
- Record manual screen-reader reading order and forced-colors results. If the required environment is unavailable, keep the plan active or mark it blocked
  with that exact external condition rather than claiming WCAG completion.

- Run focused package tests, then pnpm docs:decisions, architecture-doc checks, type-safety, doc-comments, tokens, dependencies, serial pnpm test, lint,
  typecheck, builds, fixture recording/drift check, Playwright suites, diff-size, bundle, git diff --check, and finally pnpm check:ci. Verify pnpm dev in a
  running browser before archiving the plan.
