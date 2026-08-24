# TODO — current repository work

**Authority:** Planning only. This file tracks work; ADRs and package specifications override it when they disagree.

**Audited:** 20 August 2026

This is the repository-level index of unfinished work. It records only work observable
in the current tree; completed bootstrap history belongs in Git, ADRs, or package
READMEs. The audit covered the principles and agent guides, README, ADRs, page and
component specs, design system, wireframes, manifests, package TODOs, and source/tests.

## Current implementation baseline

| Area      | Current state                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contracts | Canonical schemas, capability codecs, freshness derivation, wire responses including the battery-history contract (ADR 33), and 174 tests are built.                                                                                                                                                                                                                                                       |
| Adapters  | Complete locally: fixtures, three adapters, exhaustive dispatch, unknown-field accounting, browser join, and 227 tests are built.                                                                                                                                                                                                                                                                          |
| Simulator | Deterministic payload generation, CLI/config, fault injection, bounded scheduling/transport, metrics, lifecycle, and 211 tests are built. Measured full-stack results remain.                                                                                                                                                                                                                              |
| Server    | Runnable HTTP/WebSocket process with ingest, reads, health, bounded state, compact battery-history retention with the decimated history route (ADR 33), privacy-safe regressive-sequence logging, freshness sweep, coalesced fan-out, and 189 tests. Slow-client policy and a consumer-triggered regressions health counter remain deferred.                                                               |
| Web       | Live decoded fleet store, fleet/detail routes, eight shared UI components, tenant configuration, connection handling with automatic jittered reconnect and restart reconciliation (ADR 31), the fetch-on-visit battery-history sparkline (ADR 33), 313 unit/component tests, and the committed Playwright browser suite — three-engine smoke plus the reported 500-robot measurement (ADR 32) — are built. |

## Current decision and blocker register

| Classification          | Items                                                                                                                                                                                                                                                                                                                     | Effect                                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active blockers         | None (**P3.4** resolved 21 August 2026)                                                                                                                                                                                                                                                                                   | The AI-usage account in README §8 is now the author's own record: the working rules, the enforcement, and the explicit statement that no per-file ledger exists. No registered architecture stub is open: D22 and D23 resolved as ADRs 31 and 32. |
| Actionable non-blockers | Complete fleet resource-state modeling; robot-detail delta subscription and placeholder-boundary cleanup; WebSocket origin policy; remaining server/stream measurements; real screen-reader, responsive-theme, and forced-colors review; dead-code/export, consumer-fixture, mutation, static-security, and hygiene gates | These have enough evidence or a named decision point to schedule. ADR 32 keeps assistive-technology and subjective forced-colors evidence manual; planning is not authority to change a contract or product policy.                               |
| Trigger-deferred        | Repeated malformed-frame escalation; slow-client drain limits; regressions health counter; cross-layer testing-fixture location; batch ingest/process scaling; fleet-table virtualization                                                                                                                                 | Activate only when the documented diagnostics, deployment, consumer, duplication, saturation, or measured-churn trigger occurs.                                                                                                                   |
| Deliberate cuts         | Authentication/authorization UI, commands, database, broker/MQTT, commissioning/discovery, schema-driven configuration forms, alerting                                                                                                                                                                                    | Keep visible as non-goals or release risks; unauthenticated raw diagnostics remain a deployment blocker by ADR 26, not an authorization feature supplied by the technician toggle.                                                                |

Planning documents under `docs/05_plans/` are proposals. They do not reserve D-ids or ADR
numbers and do not turn recommendations into decisions.

## Priority 0 — correct statements that overclaim reality

### P0.1 Make the README describe what actually runs — **DONE 20 August 2026**

Rewritten against one `pnpm dev` run rather than against the diff: the status banner, the
one-command section, five rows of the status table, the tree diagram and the adapter and
unknown-field claims. The two things still unproven were **not** upgraded — the demo script
stays `[PARTIAL]` and the E2E row stays `[NOT BUILT]`, each narrowed to what is actually
missing. Original text follows.

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

### P0.2 Reconcile stale scoped planning documents — **DONE 20 August 2026, and worth repeating on a schedule**

Two passes. The first corrected the documents that described a repository without a server:
`README.md`, `packages/README.md`, both package specs, five ADR statuses, and the
reconciliation list. The second — this one — closed the gap between _work that was finished_
and _work still marked open_: three FIXME assessment lines reading "open" over
struck-through bullets, and six P-items with no done-marker.

**The lesson is that this drifts in both directions.** Documents overstate what exists while
the code is behind, and understate it while the code races ahead; the second is harder to
notice because nothing looks broken. Re-run this whenever a finding closes, not only when
one is raised. Original text follows.

Several scoped TODOs describe implemented code as absent:

- `packages/adapters/TODO.md` was reconciled and its completed joining checklist archived
  on 20 August 2026;
  their remaining open items match the current adapter source and ADRs 1, 10–16, 19,
  20, 22, 25–29.
- `packages/simulator/TODO.md` leaves most implemented and tested bootstrap work open.
- `packages/server/TODO.md` has stale counts and open items for state, sweep, health,
  and enforcement work that landed.
- `packages/contracts/TODO.md` is locally complete but retains downstream integration
  gates; reduce it to those gates or archive the bootstrap checklist.
- `packages/web/UI_PLAN.md` said `ConnectionBanner`, `Stat` styling, and `EmptyState`
  styling were not built; its claims were corrected in place and the document is now
  archived at `docs/04_archive/WEB_UI_PLAN.md` (20 August 2026).
- Feature TODOs correctly identify live-data gaps but reference retired root item ids.

Audit each against its package, retain genuine work, and remove stale checklist
history. Do not update prose ahead of code (Principle 14).

### P0.3 Protect the current work in version control — **DONE**

The trees this item found untracked are committed. Original text follows.

`git status --short` reports the entire `packages/` and `config/` trees as untracked,
alongside ADR 7 and ADR 8; many tracked documents are modified. A clone therefore does
not contain the implementation described here.

Review and commit intentionally. Keep implementation, documentation, and mechanical
formatting separate where practical. This is operational work, not authorization for a
blind or destructive Git command.

### P0.4 Refresh the five stale ADR statuses — **DONE 20 August 2026**

All five now read accurately and carry the date they changed, so a later reader can tell a
status that was reviewed from one never revisited: ADR 1 Implemented, ADR 2 Partial, ADR 3
Implemented, ADR 6 Partial, ADR 8 Partial. Original text follows.

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

### P0.5 Restore a green CI baseline — **DONE**

The named `_omit` lint failure is gone and the full gate set — lint, typecheck, test, build,
architecture-docs, dependencies, doc-comments, tokens, fixture-drift, bundle — runs green.
Original text follows.

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

### P1.1 Build the vendor adapters — **DONE**

Three vendor modules, per-vendor schemas, the dispatch registry, exact-output contract
tests, and recorded fixtures drift-gated in CI. Original text follows.

Owner: `packages/adapters`.

- ~~Declare and consume `@fleet/contracts` with `workspace:*`.~~ Done 19 August 2026.
- ~~Record deterministic representative, boundary-empty, and boundary-full fixtures per
  vendor, plus one hand-authored malformed payload per vendor.~~ Done 20 August 2026. The
  nine valid fixtures are simulator-recorded and drift-gated in CI (ADR 13); malformed
  payloads have separate provenance outside the generated path.
- ~~Add loose schemas and adapters for Vendors A, B, and C.~~ Done 20 August 2026,
  including exact canonical-output, malformed-input, boundary, capability, and
  unknown-field tests (loose, not strict: ADR 15).
- ~~Normalize units, timestamps, statuses, and capabilities with injected `receivedAt`.~~
  Done 20 August 2026, including D7's cross-vendor equality assertion over both shared
  boundary states.
- ~~Settle the four canonical fields no dialect sources — `adapterId`, `adapterVersion`,
  `position.frame`, `connectivity`.~~ Done by ADR 30 and asserted across all vendors.
- ~~Count unknown fields per adapter, including Vendor C's
  `telemetry.firmware_channel`.~~ Done and asserted at its dotted path.
- ~~Add the exhaustive dispatch registry with one process-owned unknown-field ledger.~~
  Done 20 August 2026; server deep imports are rejected by a tested lint boundary.
- ~~Add the cross-vendor normalization test.~~ Done 20 August 2026; both shared boundary
  states normalize to identical canonical cores across A, B, and C.
- ~~Join recorded simulator output to the contracts/web decode path in an E2E contract
  test.~~ Done 20 August 2026 for A, B, and C in `fromEnvelope.test.ts`.

Raw-payload retention has moved off this item: ADR 26 put it wholly in `packages/server`,
which retains the accepted request body and serves it from the single-robot endpoint. No
adapter holds it.

Detailed source: `packages/adapters/TODO.md`, audited against ADRs 10-29 on 20 August 2026.

### P1.2 Build server transport and the composition root — **DONE 20 August 2026**

The server listens, ingests through the registry, sweeps, serves four reads and fans
coalesced deltas out over `/ws`, composed from repository-root configuration under
`pnpm dev`. The history read (**G4**) closed on 20 August 2026 as ADR 33/D24; what remains
of Section 8's list is backpressure (**H6b**), tracked in `packages/server/TODO.md` and
trigger-deferred. Original text follows.

The D6a remainder also closed on 20 August 2026: a rejected lower sequence emits one
privacy-safe `telemetry.sequence_regression` warning without changing state, deltas,
history, or existing counters. A public regressions counter is still trigger-deferred
until a real health or technician-diagnostics consumer requires contract versioning.

ADR 8 selects Hono, `@hono/node-server`, and `ws`; the dependencies and listener are
not present.

- Add validated host, port, and origin configuration.
- Implement `POST /api/telemetry/:vendor` after resolving ADR 10's runtime-validation and
  ADR 11's server-fixture-access questions; do not copy a vendor payload into server tests
  to work around them.
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

### P1.3 Replace web fixtures with a decoded live store — **DONE 20 August 2026**

Owners: web `shared/lib`, `entities/robot`, and composing features.

- [x] HTTP snapshot client and WebSocket state machine with boundary validation via
      `@fleet/contracts` — `shared/lib/{transportDecoding,streamLifecycle,coldStart,fleetTransport}.ts`.
- [x] Robots stored by id and read with `useSyncExternalStore`. Deltas are applied
      synchronously and **notification** is what is scheduled: holding state the console
      already received would be a second coalescing layer on top of the server's 10 Hz cap
      and would make the store lie about what it knows.
- [x] Observed data is preserved across a reconnect — the store is never cleared by a
      connection event, only replaced by a newer snapshot — and connection state lives in
      its own context rather than on the robot read model (Principle 11, ADR 23).
- [x] Async states: `loading`, `not-found`, recoverable error with retry, and terminal
      error carrying `ContractIssue[]`. A failed request is recoverable; a body the contract
      refuses is terminal, because retrying returns the same bytes (**W-6**).
- [x] Connection state reaches the shell banner from a real socket, and per-robot labels
      are suppressed while the stream is not delivering (ADR 3).
- [x] Retained diagnostics are decoded at the boundary and stay behind the technician
      toggle; the raw payload is served by one route and no other (ADR 1).

**Resolved 20 August 2026 by [ADR 31](docs/00_adr/31_JITTERED_RECONNECT_AND_SERVER_SESSION_RECONCILIATION.md):**
the console now reconnects automatically — immediate first attempt, full-jitter exponential
delays under a 30-second ceiling, a three-attempt cap only while the socket has never
opened — and every snapshot and batch carries a `serverSessionId` so a restarted server is
re-joined rather than silently ignored. The banner's manual retry remains, for the terminal
states.

Detailed sources: the two web feature TODOs after **P0.2** updates their references.

### P1.4 Prove the integrated behavior in a running browser — **DONE 20 August 2026; automated by ADR 32**

Every hop below is built, and each was first watched in headless Chrome via a throwaway
CDP script, then committed as automation: D23 was ratified as
[ADR 32](docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md), and
`pnpm test:e2e` now drives the real server, simulator, and built console through seven
scenarios per engine in Chromium, Firefox, and (in CI) WebKit.

- [x] **Done 20 August 2026, in a browser.** Vendor payload → adapter → ingest/state →
      HTTP/WebSocket → web model and row. Headless Chrome rendered 50 rows from the live
      server with all three dialects normalised into one table.
- [x] **Done 20 August 2026.** A targeted drop moves only those robots
      LIVE → STALE → UNREACHABLE; the whole-fleet version of the same transition was then
      watched rendering in a browser (`{Live: 46, Stale: 4}` → `{Unreachable: 50}`, banner
      staying `Stream connected` throughout — the distinction from stream loss, visible). Run on 20 August 2026: a normal simulator run, then a
      `--drop R-007,R-023,R-041` run, produced `{live: 47, unreachable: 3}` with exactly
      those three unreachable. Recovery came free with it — robots that had aged out while
      the simulator was stopped returned to `LIVE` within seconds of it resuming.
      One finding worth keeping: **a cold start with `--drop` shows `UNKNOWN`, not
      `UNREACHABLE`**, because those robots never reported. Following the README's step 3
      from a cold fleet is the one way to make this demo look broken while it is working,
      and the step now says so.
- [x] _the suppression half_ / [x] _the reconnect half at unit/process boundaries_ /
      [x] _the reconnect half in a browser_ — Stream loss shows the banner, retains rows,
      and suppresses per-robot freshness. **Observed in a browser**: with the server
      stopped, all 50 rows remained and **no** per-robot freshness label rendered, while
      the banner read `Stream reconnecting`. Automatic reconnection landed with ADR 31 on
      20 August 2026 (restart recovery proven with fake sockets in
      `fleetTransport.test.ts` and over real sockets in `runServer.test.ts`), and the
      browser proof is now a committed Playwright scenario: kill the real server, restart
      it, watch the console re-join and resume live rows without Retry or reload
      (`packages/web/e2e/smoke.spec.ts`, ADR 32).
- [x] _at the wire_ / [ ] _in a browser_ — Malformed payloads are rejected and counted
      without crashing stream or list. Verified against a running server: a non-JSON body
      is a counted 400, a bad payload increments `malformedIngest`, and neither disturbs the
      fleet response.
- Recovery/shutdown leaves no timers, sockets, queues, or buffers unbounded.

Unit tests alone do not close this item (Principle 10).

## Priority 2 — configuration and UI alignment

### P2.1 Validate tenant configuration and define flags — **DONE 19 August 2026**

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

### P2.2 Remove duplicate palette authority — **DONE 24 August 2026**

Reopened when the MUI audit exposed the mismatch with implemented ADR 5. Authored
`styles/tokens.ts` now supplies MUI directly and generates committed `tokens.css` through
`scripts/generateWebTokens.mjs`; `pnpm check:tokens` rejects stale output. The existing
contrast gate remains, now checking generated output rather than pinning two authorities.

### P2.3 Consolidate `FreshnessLabel` styling — **DONE 20 August 2026**

Done as prescribed: the classes are authoritative, the inline `CSSProperties` are gone, and
the obsolete `.state`/`.age` rules are deleted. Worth recording what they were: not merely
stale but **contradictory**, colouring freshness from the status palette three lines under
a comment saying freshness "does not share the status palette. It is carried by emphasis."
The inline styles followed that comment and the CSS did not, and nothing failed because
nothing matched. One test got weaker in the move and the trade is named in
`packages/FIXME.md` **F8**. Original text follows.

The component uses inline `CSSProperties` while `global.css` contains a partially stale
class implementation. Make the spec-mandated classes authoritative, delete obsolete
`.freshness .state`/`.age` rules, align element names, and preserve muted
unreachable/unknown treatment without tenant accent.

### P2.4 Resolve the stylelint/BEM mismatch — **DONE 20 August 2026**

`selector-class-pattern` now admits `block__element`, widened once and centrally with the
reason carried in the rule's own `message` so the next reader sees it at the point of
failure. No suppressions remain. This was the same defect as **P2.3** from the other side:
the rule rejected the markup `docs/02_component-specs` mandates, so consolidating the
styling into classes was impossible without either widening the rule or scattering
suppressions — which is what the bullet objected to.

### P2.5 Reconcile shared-UI paths, exports, and documentation — **DONE 20 August 2026**

- **Exports: named only, no barrel.** Four components carried a redundant
  `export default` beside their named export and four did not; nothing imported a default,
  so the defaults are deleted rather than the convention being chosen by coin toss. No
  barrel was added, as the item instructs — a barrel in `shared/ui` would let a feature
  import the whole layer through one specifier and hide which primitives it actually
  depends on, which is the boundary `eslint-plugin-boundaries` exists to make visible.
- **Comments: the export surface was audited, not just the six named.** A script over every
  `export` in `shared/ui` and `entities/site` found exactly the six the item listed, and all
  six now carry a sentence that says something the signature does not (ADR 28).
- **File naming: the specs changed, not the files (20 August 2026).** The tree's
  camelCase convention is consistent; the component specs were the outlier and all eight
  implementation paths now read `shared/ui/freshnessLabel.tsx`-style. No file was renamed.

**One thing this audit turned up — since closed:** `entities/site` was the last invented
data in the console. ADR 34 closed it (`packages/FIXME.md` **F16**): the manifest carries
a `sites` directory, the snapshot serves it, and the console labels from the decoded
directory alone.

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

Existing suites cover contracts, all adapter boundary matrices, simulator behavior,
server HTTP/WebSocket integration and shutdown, shared UI, routing, fleet
filters/summary, robot capabilities/personas, and boundaries.
Landed 20 August 2026 under
[ADR 32](docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md):
disconnected freshness suppression, reconnect/restart recovery, live stale-transition
E2E, and keyboard workflows, all in real engines against the real stack, repeatable via
`pnpm test:e2e`. Remaining high-value coverage:

- screen-reader reading order (real assistive technology, not automation);
- both themes, responsive views, and forced colors.

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
gated at 720 kB raw / 300 kB gzip. Adapter coverage was deliberately left ungated; do not
add a threshold without a derivation.

**Client half done, 20 August 2026**
([ADR 32](docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md)):
`pnpm test:e2e:scale` reports client frame time, delta-to-paint latency, achieved frame
rate, heap, and row/link integrity at 500 robots under a live 10 Hz stream, reported not
gated. The server/stream-side numbers above remain owed.

**Server half done, 20 August 2026**, now that there is a listening server:

- **Per-request cost**, sequential: 892 µs at 50 robots, 926 µs at 500 — whole request,
  route to upsert. Transport dominates validation ~150×, confirming ADR 2's estimate and
  redirecting its staged mitigation to batch ingest rather than worker-pooled validation.
- **Throughput**, concurrent at 500 robots: 1,264 req/s at concurrency 1, 4,786 at 16,
  5,971 at 128 — about 2.4× ADR 2's 2,500 msg/s design scale.
- **Sweep lateness**: zero late ticks at every level, interval still running afterwards.
  This is the measurement that matters for correctness rather than speed, because ADR 3's
  failure under saturation is a sweep that stops firing and leaves stale robots reported as
  LIVE.
- Published in `README.md` § 10, ADR 2 and ADR 3, with the caveat that no degradation point
  was found — a statement about this machine and this offered load, not about the ceiling.

**Client half measured 20 August 2026 (ADR 32):** 500 robots at ten frames per second in
a real Chromium against the production build — 120/120 frames applied, delta-to-next-paint
p50 47.3 ms / p95 53.7 ms / max 74.5 ms, animation-frame interval p50 16.7 ms, 500 rows
and links retained. Virtualization stays deferred, now on that evidence rather than on its
absence (ADR 24 § Observed consequences). **Still owed, server/stream side:** fan-out
p50/p95, coalesced WebSocket rate under real load, and process memory over time.

### P3.3 Record WCAG 2.2 AA contrast evidence — **CONTRAST DONE 20 August 2026; forced-colors open**

Computed and **gated** rather than recorded, which is the difference that matters: a ratio
written into a document rots, and `scripts/checkTokens.mjs` fails CI instead. It checks text
tokens at 4.5:1 on both backgrounds and all six status tints at 3:1 as non-text UI
(WCAG 1.4.11), across both themes, and prints all eighteen ratios whether or not anything
fails (ADR 22's report-as-well-as-gate).

**It found a failure on its first run**: `--status-neutral` at 2.84:1 in dark, on a token
used for a freshness dot and a status chip. Lightened to `#767068` — 3.34:1 on `--surface`,
3.66:1 on `--bg` — with the reasoning beside it in authored `tokens.ts`.

**Still open: forced-colors.** It cannot be computed from tokens, because the whole point of
forced-colors mode is that the system replaces them. It needs a person in Windows
high-contrast or `forced-colors: active`, checking that the status chip's dashed border and
the freshness state word still carry meaning once `box-shadow` and background colours are
dropped — which `global.css` already anticipates in its `@media (forced-colors: active)`
block, untested.

Original text follows. Verify both themes for every pair in `DESIGN_SYSTEM.md` §6, all
status tints, muted ink on surface, and forced-colors status/freshness. Record
ratios/results in README.

### P3.4 Replace submission placeholders

**Done 21 August 2026.** README placeholders for shipped scope, AI usage, measurements,
and contrast are all replaced with author-provided or measured content: §8 carries the
author's own AI-usage account (working rules, enforcement, and the explicit absence of
a per-file ledger — still never to be invented), §11 carries the measured tables
including the gated contrast ratios, and the two formerly empty grids are gone.

## Priority 4 — maintainability gates if time permits

These are optional hardening after **P0.5** makes the existing CI baseline green. Each proposed gate
must identify the failure it prevents and cite an ADR when it mechanically enforces an
architecture decision; do not add arbitrary percentages or permanently noisy checks.

### P4.0 Reviewable-diff budget — **DONE 19 August 2026**

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

### P4.1 Dependency admission — **DONE 19 August 2026**

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
- floor-plan calibration (the map view itself is built — page spec 04, ADR 35; only the
  robot-map-to-building-drawing transform stays cut);
- commands/dispatch (requires authorization and requested-state transitions);
- auth, settings, and tenant administration UI;
- persisted history/database and horizontal broker scale;
- persona in the URL;
- alerting/escalation and schema-driven vendor configuration forms.

Virtualization is different: it is deferred on evidence, not permanently cut — and the deferral is a recorded decision rather than an omission ([ADR 24](docs/00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md), register D14). The 20 August 2026 measurement (ADR 32) showed the un-virtualized table absorbing the documented 500-robot workload with the frame budget intact, so the reopening condition was checked and not met.

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
