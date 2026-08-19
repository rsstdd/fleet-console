# TODO — current repository work

**Audited:** 19 August 2026

This is the repository-level index of unfinished work. It records only work observable
in the current tree; completed bootstrap history belongs in Git, ADRs, or package
READMEs. The audit covered the principles and agent guides, README, ADRs, page and
component specs, design system, wireframes, manifests, package TODOs, and source/tests.

## Current implementation baseline

| Area      | Current state                                                                                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | Canonical schemas, capability codecs, freshness derivation, and tests are built.                                                                                                  |
| Adapters  | Boundary, result/error primitives, vendor parsing, and unknown-field ledger are built. Vendor A/B/C schemas, fixtures, adapters, and registry are not.                            |
| Simulator | Deterministic payload generation, CLI/config, fault injection, bounded scheduling/transport, metrics, lifecycle, and tests are built. Downstream E2E and measured results remain. |
| Server    | Validated config, manifest-seeded state, bounded history, freshness sweep, delta coalescing, health metrics, and tests are built. There is no HTTP/WebSocket process.             |
| Web       | Shell, router, fixture-backed fleet/detail views, all eight shared UI components, gallery, contract decoding, and tests are built. There is no live store.                        |

## Priority 0 — correct statements that overclaim reality

### P0.1 Make the README describe what actually runs

`README.md` says `pnpm dev` starts simulator, server, and console, but the server has no
`dev` script or executable listener. The root recursive command currently starts only
packages exposing `dev`.

- Do not claim a complete one-command stack until the server process exists.
- Replace `[FILL]` markers in Run, Scope, AI Usage, and Measurements with verified facts
  or an honest statement that evidence has not been collected.
- Populate Built from the baseline above. Do not claim adapters, ingest, health HTTP,
  or WebSocket fan-out before they exist.
- Keep simulator commands as implemented facts, but do not say their data reaches the
  console until the adapter/server/web path exists.

### P0.2 Reconcile stale scoped planning documents

Several scoped TODOs describe implemented code as absent:

- `packages/simulator/TODO.md` leaves most implemented and tested bootstrap work open.
- `packages/server/TODO.md` has stale counts and open items for state, sweep, health,
  and enforcement work that landed.
- `packages/contracts/TODO.md` is locally complete but retains downstream integration
  gates; reduce it to those gates or archive the bootstrap checklist.
- `packages/web/UI_PLAN.md` says `ConnectionBanner`, `Stat` styling, and `EmptyState`
  styling are not built.
- Feature TODOs correctly identify live-data gaps but reference retired root item ids.

Audit each against its package, retain genuine work, and remove stale checklist
history. Do not update prose ahead of code (Principle 14).

### P0.3 Protect the current work in version control

`git status --short` reports the entire `packages/` and `config/` trees as untracked,
alongside ADR 7 and ADR 8; many tracked documents are modified. A clone therefore does
not contain the implementation described here.

Review and commit intentionally. Keep implementation, documentation, and mechanical
formatting separate where practical. This is operational work, not authorization for a
blind or destructive Git command.

## Priority 1 — complete the live telemetry path

### P1.1 Build the vendor adapters

Owner: `packages/adapters`.

- Declare and consume `@fleet/contracts` with `workspace:*`.
- Add recorded fixtures and strict schemas for Vendors A, B, and C.
- Normalize units, timestamps, statuses, and capabilities with injected `receivedAt`.
- Retain raw payload only for single-robot diagnosis; exclude it from fleet state,
  history, and deltas.
- Count unknown fields per adapter, including Vendor C's intentional extra field.
- Add the registry and exact contract tests for malformed input, conversions,
  capability absence, Vendor B ordering, and JSON round trips.
- Join simulator output to the contracts/web decode path in an E2E contract test.

Detailed source: `packages/adapters/TODO.md`, after **P0.2** removes stale items.

### P1.2 Build server transport and the composition root

ADR 8 selects Hono, `@hono/node-server`, and `ws`; the dependencies and listener are
not present.

- Add validated host, port, and origin configuration.
- Implement `POST /api/telemetry/:vendor`: validate the route, treat the body as
  `unknown`, stamp receipt time, dispatch through adapters, reject invalid input, and
  apply idempotent ordering.
- Implement `GET /api/fleet`, `GET /api/robots/:id`, a history endpoint, and
  `GET /api/health`. Raw payload is permitted only in single-robot diagnostics.
- Add late-sweep detection to health.
- Add no-more-than-10-Hz WebSocket delta fan-out using the coalescer; define initial
  snapshot, slow-client, reconnect, and shutdown behavior without unbounded buffers.
- Add lifecycle, structured logging, `dev`/`start`, graceful shutdown, and integration
  and invariant tests.
- Prove freshness-only changes fan out, out-of-order input cannot regress state, and
  raw payload never leaks into fleet, delta, or history surfaces.

Detailed source: `packages/server/TODO.md`, after **P0.2** reconciles completed items.

### P1.3 Replace web fixtures with a decoded live store

Owners: web `shared/lib`, `entities/robot`, and composing features.

- Add an HTTP snapshot client and WebSocket state machine with boundary validation via
  `@fleet/contracts`.
- Store robots by id, coalesce deltas on scheduled frames, and expose field-scoped
  subscriptions with `useSyncExternalStore` or an equivalently bounded design.
- Preserve observed data during reconnect; do not collapse observed, requested,
  workflow, or connection state.
- Expose all specified async states: initial load, background refresh, empty/not-found,
  partial, offline, recoverable error, and terminal error.
- Route connection state to the shell banner. While disconnected, suppress every
  per-robot `FreshnessLabel`; the banner is the sole freshness-integrity signal (ADR 3).
- Decode retained diagnostics at their boundary and keep technician-only data out of
  operator surfaces.

Detailed sources: the two web feature TODOs after **P0.2** updates their references.

### P1.4 Prove the integrated behavior in a running browser

- Vendor payload → adapter → ingest/state → HTTP/WebSocket → web model and row.
- A targeted drop moves only those robots LIVE → STALE → UNREACHABLE.
- Stream loss shows the banner, retains rows, and suppresses per-robot freshness;
  reconnect restores labels without reload.
- Malformed payloads are rejected and counted without crashing stream or list.
- Recovery/shutdown leaves no timers, sockets, queues, or buffers unbounded.

Unit tests alone do not close this item (Principle 10).

## Priority 2 — configuration and UI alignment

### P2.1 Validate tenant configuration and define flags

`tenant.ts` is a typed literal, not validated external configuration. It has no fallback
loader or flags although the design system says Tenant B disables a panel.

- Define the actual flag and panel, or remove the unsupported Tenant B claim.
- Parse from `unknown`, apply the app-shell failure policy, and keep context stable.
- Verify one tenant switch changes wordmark, theme, and the named flag together.
- Record the deployment decision in an ADR if it adds a cross-package constraint.

### P2.2 Remove duplicate palette authority

`tenantTheme.ts` repeats colors from `tokens.css`; MUI reads the JavaScript copy, so the
two can drift. Make CSS tokens authoritative—read resolved tokens or use CSS variables
where MUI accepts them—then remove `TENANT_PALETTE` without adding raw component colors.

### P2.3 Consolidate `FreshnessLabel` styling

The component uses inline `CSSProperties` while `global.css` contains a partially stale
class implementation. Make the spec-mandated classes authoritative, delete obsolete
`.freshness .state`/`.age` rules, align element names, and preserve muted
unreachable/unknown treatment without tenant accent.

### P2.4 Resolve the stylelint/BEM mismatch

The selector pattern permits modifiers but rejects spec-required `__element` names;
narrow disable comments bypass it. Extend the rule to the BEM form already used, test
representative selectors if practical, and remove the suppressions.

### P2.5 Reconcile shared-UI paths, exports, and documentation

- Specs name PascalCase files while the repository uses camelCase.
- Shared UI mixes default/named exports and has no barrel despite older planning text.
  Choose and document one convention; do not add a barrel if it hides dependencies.
- Add missing one-sentence comments to every export. Confirmed examples include
  `DataPlateProps`, `DataPlate`, `StatusChipSize`, `StatusChipProps`, `SITES`, and
  `selectSiteLabel`; audit the complete export surface rather than stopping there.

### P2.6 Remove or configure inert Git-hook tooling

`simple-git-hooks` is a web dev dependency, its install script is denied in
`pnpm-workspace.yaml`, and no configuration exists. Remove it and rely on CI, or
configure a deliberate root-owned hook. Do not claim a gate that does not run.

### P2.7 Resolve the accessibility wording contradiction

The revised StatusChip/fleet specs say currency is visible in the label and age follows
in the adjacent cell. `DESIGN_SYSTEM.md` still says the chip's own accessible name
carries both state and age. Align the sentence with the chosen behavior and verify it
with a real screen reader on fleet and detail; DOM reasoning alone is insufficient.

## Priority 3 — verification and evidence

### P3.1 Finish integration, browser, and accessibility coverage

Existing suites cover contracts, simulator primitives, server state/freshness,
shared UI, routing, fleet filters/summary, robot capabilities/personas, and boundaries.
Remaining high-value coverage:

- adapter contracts and malformed-boundary matrices;
- server HTTP/WebSocket integration and shutdown;
- disconnected freshness suppression/reconnect and live stale-transition E2E;
- screen-reader reading order and keyboard workflows;
- both themes, responsive views, and forced colors;
- running-browser verification after each integrated user-facing change.

Do not add snapshot tests; package guidance requires observable behavior.

### P3.2 Measure committed scale points

Build a reproducible harness for 50 robots at 1 Hz and 500 at 5 Hz. Record environment,
warmup/duration, achieved ingest, validation and HTTP cost, fan-out p50/p95, coalesced
WebSocket rate, memory, event-loop/sweep lateness, client frame time, and row count.
Publish actual results and degradation point in README and ADR 2. Decide virtualization
from those results; until then it is a deferral, not a completed scale claim.

### P3.3 Record WCAG 2.2 AA contrast evidence

Verify both themes for every pair in `DESIGN_SYSTEM.md` §6, all status tints, muted ink
on surface, and forced-colors status/freshness. Record ratios/results in README.

### P3.4 Replace submission placeholders

After the work exists, replace README placeholders for shipped scope, AI usage,
measurements, and contrast. AI-usage text requires user-provided facts; do not invent
authorship or review claims.

## Deliberate non-goals

Keep these documented in README “Not Built”; they are cuts, not active tasks:

- discovery/commissioning;
- map/floor-plan calibration;
- commands/dispatch (requires authorization and requested-state transitions);
- auth, settings, and tenant administration UI;
- persisted history/database and horizontal broker scale;
- persona in the URL;
- alerting/escalation and schema-driven vendor configuration forms.

Virtualization is different: it is deferred pending **P3.2**, not permanently cut.

## Recommended sequence

1. Correct overclaims/scoped TODOs (**P0.1–P0.2**) and protect the tree (**P0.3**).
2. Build adapters (**P1.1**), then server transport (**P1.2**).
3. Replace web fixtures (**P1.3**) and prove the live path (**P1.4**).
4. Resolve focused configuration/UI alignment (**P2.1–P2.7**).
5. Finish evidence, measurements, and accessibility (**P3.1–P3.4**).

## Completion rule

Remove an item only when implementation, focused tests, documentation, and required
browser or measurement evidence agree. If an ADR or principle conflicts, reconcile the
decision instead of marking the item complete around it.
