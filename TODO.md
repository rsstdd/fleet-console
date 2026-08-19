# TODO — current repository work

**Authority:** Planning only. This file tracks work; ADRs and package specifications override it when they disagree.

**Audited:** 20 August 2026

This is the repository-level index of unfinished work. It records only work observable
in the current tree; completed bootstrap history belongs in Git, ADRs, or package
READMEs. The audit covered the principles and agent guides, README, ADRs, page and
component specs, design system, wireframes, manifests, package TODOs, and source/tests.

## Current implementation baseline

| Area      | Current state                                                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | Canonical schemas, capability codecs, freshness derivation, and tests are built.                                                                                                                                                                |
| Adapters  | Boundary/result primitives, vendor-support parsing, unknown-field accounting, one recorded fixture per vendor (drift-gated, ADR 13), and a public `testing` subpath (ADR 11) are built. Vendor payload schemas, adapters, and registry are not. |
| Simulator | Deterministic payload generation, CLI/config, fault injection, bounded scheduling/transport, metrics, lifecycle, and tests are built. Downstream E2E and measured results remain.                                                               |
| Server    | Validated config, manifest-seeded state, bounded history, freshness sweep, delta coalescing, health metrics, and tests are built. There is no HTTP/WebSocket process.                                                                           |
| Web       | Shell, router, fixture-backed fleet/detail views, all eight shared UI components, gallery, contract decoding, and tests are built. There is no live store.                                                                                      |

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

- `packages/adapters/TODO.md` and `TODO_E2E_JOIN.md` were reconciled on 20 August 2026;
  their remaining open items match the current adapter source and ADRs 1, 10–16, 19,
  20, 22, 25–29.
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

### P0.4 Refresh the five stale ADR statuses

ADR 1, 2, 3, 6 and 8 read **"Not started"** while substantially implemented — ADR 1's
envelope and capability codec, ADR 3's `deriveFreshness` and the server sweep, ADR 6's
current-state store and ring buffer. Every ADR written since (10–29) carries an accurate
`Implemented` / `Partial` status, so the five are the only ones a reader cannot trust.

This item was previously tracked in `docs/PENDING_ARCHITECTURE_DECISIONS.md` § "Existing ADR
reconciliation required alongside these decisions". That file is now generated from
`docs/decisions.json` and holds only the stub-to-ADR table, and the item was lost with the
prose it sat in — re-filed here on 19 August 2026 rather than left only in
`docs/ARCHITECTURE_AUDIT.md` § 4.1, which is exactly what that section said not to do.

Check the implementation state against the code before editing a header. Do not update
prose ahead of code (Principle 14); an ADR that is genuinely `Not started` should stay so.

### P0.5 Restore a green CI baseline

A consistently failing gate is not a gate: it becomes background noise and encourages
bypasses. Restore every required CI job to green before adding optional quality gates or
calling the baseline maintainable.

- Fix the current unused `_omit` lint failures in
  `packages/contracts/src/envelope/envelopeSchema.test.ts`.
- Run the same architecture-documentation, lint, typecheck, test, build, fixture-drift,
  and bundle checks required by `.github/workflows/ci.yml`.
- Record any environment-only failure honestly; do not weaken or skip a gate merely to
  obtain a green result.

## Priority 1 — complete the live telemetry path

### P1.1 Build the vendor adapters

Owner: `packages/adapters`.

- ~~Declare and consume `@fleet/contracts` with `workspace:*`.~~ Done 19 August 2026.
- ~~Record deterministic representative, boundary-empty, and boundary-full fixtures per
  vendor, plus one hand-authored malformed payload per vendor.~~ Done 20 August 2026. The
  nine valid fixtures are simulator-recorded and drift-gated in CI (ADR 13); malformed
  payloads have separate provenance outside the generated path.
- Add loose vendor schemas for Vendors A, B, and C (loose, not strict: ADR 15 counts
  unknown fields on payloads that still normalize).
- Normalize units, timestamps, statuses, and capabilities with injected `receivedAt`.
- Settle the four canonical fields no dialect sources — `adapterId`, `adapterVersion`,
  `position.frame`, `connectivity`. See `packages/adapters/TODO.md` § FIXME; three
  spellings of `adapterId` are already loose in the tree.
- Count unknown fields per adapter, including Vendor C's `telemetry.firmware_channel`.
- Add the registry and exact contract tests for malformed input, conversions,
  capability absence, Vendor B ordering, and JSON round trips.
- Join simulator output to the contracts/web decode path in an E2E contract test.

Raw-payload retention has moved off this item: ADR 26 put it wholly in `packages/server`,
which retains the accepted request body and serves it from the single-robot endpoint. No
adapter holds it.

Detailed source: `packages/adapters/TODO.md`, audited against ADRs 10-29 on 20 August 2026.

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

### P2.1 Validate tenant configuration and define flags — DONE 19 August 2026

Resolved as register **D8** and recorded in
[ADR 17](docs/00_adr/17_BUILD_TIME_TENANT_CONFIGURATION.md): two profiles selected per
build through `VITE_TENANT`, validated twice — in `vite.config.ts` so an unknown tenant
fails the build, and at module load so an invalid profile never renders. No fallback in
either place, deliberately.

- The flag is `flags.lidarHealthPanel`, `false` for Tenant B; a panel renders only when
  the robot declared the capability **and** the tenant enables it.
- Profiles are parsed from `unknown` by a strict schema; `TenantConfigContext` keeps its
  stable identity.
- `config/tenant.test.ts` asserts wordmark, theme and the flag differ together, and
  `features/robot/tenantPanelFlag.test.tsx` proves the panel is absent under Tenant B.

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

### P2.6 Remove or configure inert Git-hook tooling — DONE 19 August 2026

Removed, not configured. `simple-git-hooks` is gone from `packages/web`, and its
`allowBuilds: false` entry is gone from `pnpm-workspace.yaml` along with it — the entry
described a package that no longer exists. CI carries the gates.

Found by the new dependency check rather than by this note, which had sat unactioned:
see [ADR 29](docs/00_adr/29_VETTED_DEPENDENCY_ALLOW_LIST_AND_RELEASE_AGE_QUARANTINE.md).

### P2.7 Verify the accessibility wording with a real screen reader

The revised StatusChip/fleet specs say currency is visible in the label and age follows
in the adjacent cell. `DESIGN_SYSTEM.md` § 5 contradicted this by saying the chip's own
accessible name carried both state and age; that sentence was aligned with the specs on
19 August 2026 (design profile revision 3), so the documents now agree.

What remains is the half that cannot be done by editing prose: verify the behavior with a
real screen reader on fleet and detail. Three documents agreeing is not evidence that the
row reads correctly, and DOM reasoning alone is insufficient.

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

**Partly done, 19 August 2026** ([ADR 22](docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md),
register D17): validation cost is measured and gated at ADR 2's own falsification
threshold — 5.8–6.4 µs per message against 400 µs — and the console's first-load size is
gated at 720 kB raw / 300 kB gzip. Everything else on this list needs a listening server
and is unchanged. Adapter coverage was deliberately left ungated; do not add a threshold
without a derivation.

### P3.3 Record WCAG 2.2 AA contrast evidence

Verify both themes for every pair in `DESIGN_SYSTEM.md` §6, all status tints, muted ink
on surface, and forced-colors status/freshness. Record ratios/results in README.

### P3.4 Replace submission placeholders

After the work exists, replace README placeholders for shipped scope, AI usage,
measurements, and contrast. AI-usage text requires user-provided facts; do not invent
authorship or review claims.

## Priority 4 — maintainability gates if time permits

These are optional hardening after **P0.5** makes the existing CI baseline green. Each proposed gate
must identify the failure it prevents and cite an ADR when it mechanically enforces an
architecture decision; do not add arbitrary percentages or permanently noisy checks.

### P4.0 Reviewable-diff budget — DONE 19 August 2026

Resolved as register **D19** and recorded in
[ADR 27](docs/00_adr/27_CAP_THE_REVIEWABLE_DIFF_WITH_A_NAMED_OVERRIDE.md): a pull request's
hand-written change is capped at **300 modified lines**, enforced by
`scripts/checkDiffSize.mjs` as `pnpm check:diff-size`.

The failure it prevents is named: a large, plausible, agent-written change is the one a
reviewer is least able to check, because the defect is hidden by the same volume that
exhausts the reader. The number is derived rather than picked — one reviewer, one
60-minute sitting, at a defect-seeking reading rate of 300 lines/hour — and the derivation
is in the script's header, so raising it means changing that claim.

- Code and prose both count; generated output (lockfile, recorded fixtures, the decision
  index) does not, because nobody wrote or reads it.
- A change with no smaller form passes by saying so: an `Oversized-diff: <reason>` commit
  trailer, which leaves the exception in the history rather than in somebody's memory.
- **P0.3 will be the first user of that override** — the initial import is ~27,000 lines
  and has no smaller honest form. Land it as a named exception, not as the change that
  quietly proved the gate optional.
- `scripts/checkDiffSize.test.mjs` covers the counting, exclusions and trailer parsing, so
  a wrong answer surfaces in a test rather than in a confusing red build.

### P4.1 Dependency admission — DONE 19 August 2026

Resolved as register **D20** and recorded in
[ADR 29](docs/00_adr/29_VETTED_DEPENDENCY_ALLOW_LIST_AND_RELEASE_AGE_QUARANTINE.md): every
third-party package is named with a reason in `scripts/checkDependencies.mjs`, enforced as
`pnpm check:dependencies`, behind a seven-day `minimumReleaseAge` quarantine and a
`pnpm audit --audit-level=high` step.

The failure it prevents was measured before the gate was written: a probe file importing an
installed-but-unvetted package passed `pnpm lint` with **exit 0**. Every supply-chain rule
this repository had was a deny-list, and a deny-list cannot name the package nobody thought
of. No tool was adopted — `knip` and `depcheck` would have added a dependency in order to
police dependencies, and neither answers the vetting question.

- On its first run it found `@mui/icons-material` and `simple-git-hooks` unused (P2.6), and
  `eslint-plugin-jsdoc` unvetted — added hours earlier by the ADR 28 work.
- The quarantine was found switched **off**: `minimumReleaseAgeExclude` had listed nine
  exceptions to a `minimumReleaseAge` that was never set. The check now asserts it is on.
- `scripts/checkDependencies.test.mjs` builds a fixture workspace carrying one instance of
  each violation, so the gate is proven to fire rather than assumed to.

1. Add monorepo-aware dead-code and unused-**export** detection, with explicit entry
   points to avoid hiding false positives in blanket exclusions. The unused-**dependency**
   half landed with P4.1; dead code and unused exports did not.
2. Validate the complete workspace dependency graph: package layer direction, public
   exports only, no cross-package `src` imports, and no production imports from testing
   subpaths.
3. Compile small external-consumer fixtures for each package so public exports and types
   are proven usable without repository-internal paths.
4. Trial mutation testing on critical pure behavior only: freshness transitions,
   envelope validation, unknown-field accounting, normalization, and capability
   classification. Report first; gate only a stable, justified surface in line with ADR 22.
5. Add a narrow browser smoke suite for essential operator flows, keyboard use, tenant
   flags, offline/freshness behavior, and automated accessibility checks once the live
   server path exists.
6. — landed with P4.1. The "result can change without a repository change" objection was
   not dodged; it was accepted in the open, with the reasoning in ADR 29 § Argument.
7. Add JavaScript/TypeScript static security analysis for unsafe data flow and boundary
   handling that ordinary lint rules do not model.
8. Reject focused tests, unexplained skipped tests, leaked timers/handles, unhandled
   rejections, and wall-clock-dependent freshness tests.
9. Check repository hygiene: broken internal documentation links, merge-conflict
   markers, unexpected generated/build artifacts, oversized files, secrets, and
   case-colliding paths.

## Deliberate non-goals

Keep these documented in README “Not Built”; they are cuts, not active tasks:

- discovery/commissioning;
- map/floor-plan calibration;
- commands/dispatch (requires authorization and requested-state transitions);
- auth, settings, and tenant administration UI;
- persisted history/database and horizontal broker scale;
- persona in the URL;
- alerting/escalation and schema-driven vendor configuration forms.

Virtualization is different: it is deferred pending **P3.2**, not permanently cut — and the deferral is now a recorded decision rather than an omission ([ADR 24](docs/00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md), register D14). The claim was narrowed to what a test can back: one row per robot, correct at 500 rows, ceiling unmeasured.

## Recommended sequence

1. Correct overclaims/scoped TODOs (**P0.1–P0.2**), protect the tree (**P0.3**), and
   restore green CI (**P0.5**).
2. Build adapters (**P1.1**), then server transport (**P1.2**).
3. Replace web fixtures (**P1.3**) and prove the live path (**P1.4**).
4. Resolve focused configuration/UI alignment (**P2.1–P2.7**).
5. Finish evidence, measurements, and accessibility (**P3.1–P3.4**).

## Completion rule

Remove an item only when implementation, focused tests, documentation, and required
browser or measurement evidence agree. If an ADR or principle conflicts, reconcile the
decision instead of marking the item complete around it.
