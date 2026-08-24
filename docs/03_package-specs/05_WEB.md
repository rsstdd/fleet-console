# 05 — `web`

- **Status:** implemented live console; named follow-ups remain in scoped TODOs
- **Package:** `packages/web`
- **Governing documents:** ADR 1 (capability-driven rendering), ADR 3 (freshness is
  displayed, never derived), ADR 4 (feature-sliced structure), ADR 5 (MUI with tokens
  only), ADR 7 (the resolver is part of the dependency rule), ADR 17 (build-time tenant
  configuration), ADR 21 (typed endpoints and Vite dev proxy), ADR 22 (first-load bundle
  gate), ADR 23 (connection state through shared lib), ADR 24 (unvirtualized table until
  measured churn), ADR 25 (contracts owns every decoded response), ADR 26 (demo-only raw
  diagnostics), ADR 31 (reconnect and session reconciliation), ADR 32 (browser evidence),
  ADR 33 (battery history), ADR 34 (site directory on the snapshot); Principles 1–15
  (see § 13 for the enforcement/evidence mapping)
- **Related specs:** `docs/01_page-specs/`, `docs/02_component-specs/`,
  `docs/DESIGN_SYSTEM.md`

## 1. Responsibility

`web` is the fleet operations console and the primary deliverable. It consumes canonical
telemetry envelopes, renders the fleet list and robot detail, drives robot-detail panels
from declared capabilities, and presents every value alongside how old it is.

It does **not**: derive freshness, normalize vendor data, hold domain rules in components,
branch on vendor, or authorize anything.

Two non-responsibilities are absolute:

- **It never derives freshness.** Not in a component, not in the data layers, not on a timer.
  Freshness arrives as a field on the envelope. `utils/robotSelectors` maps it onto
  presentation (`selectStatusPresentation`, `selectBatteryDisplay`) and holds no clock. A second
  derivation here is a second authority that can disagree with the server's (ADR 3).
- **It never authorizes.** The UI may hide or disable an action for clarity; the server
  authenticates and authorizes every protected operation (Principle 7).

## 2. Position in the dependency graph

Named `web`, not `@fleet/web`: it is a Vite application, not a workspace library. It has
no `exports` map and nothing imports it (ADR 9 § Constraints).

May import `@fleet/contracts`. May **not** import `@fleet/server` — the canonical
envelope arrives over the wire already decoded, and reaching for the server would mean the
console had started interpreting vendor data.

`@fleet/adapters` is a narrower case than a flat ban. It is a **devDependency**, banned
package-wide in production code by `no-restricted-imports`, with the ban lifted only for
test files that join a raw vendor fixture to the browser read model. Both the legal test
import and the illegal production import have enforcement fixtures under
`utils/__boundary-violation__/`.

ADR 12 ratifies this test-only dependency, and ADR 11 supplies its public
`@fleet/adapters/testing` fixture surface. The subpath loads under jsdom and is covered by
both a production-import rejection fixture and a legal test-import fixture. The joining
test exercises all three vendor adapters through the public dispatch and fixture surfaces;
ADR 11 and ADR 12 are implemented.

## 3. Public API

None. This package is an application; its entry point is `src/main.tsx` and its surface is
the rendered UI plus the routes in `src/app/appRouter.tsx`.

Routes today: `/` (fleet), `/map` (map, page spec 04 / ADR 35), `/robots/:id` (robot
detail), and the dev-only `/dev/ui` gallery.

Internal layer boundaries take the place of a public API, and they are enforced rather
than conventional — see § 7.

## 4. Internal structure

Feature-sliced (ADR 4). The dependency rule, stated exactly as
`eslint-plugin-boundaries` enforces it rather than as the informal summary:

| From         | May import                                                                              |
| ------------ | --------------------------------------------------------------------------------------- |
| `app`        | everything, plus external                                                               |
| `feature`    | **its own feature only**, hooks, stores, types, components, lib, context, utils, config |
| `hooks`      | hooks, stores, types, lib, utils, external                                              |
| `stores`     | stores, types, utils, external                                                          |
| `types`      | types, external                                                                         |
| `components` | components, external                                                                    |
| `lib`        | lib, context (one typed edge, see below), external                                      |
| `context`    | context, config, external                                                               |
| `utils`      | utils, types, external                                                                  |
| `config`     | config, external                                                                        |
| `test`       | setup files under `src/test/**`: everything, plus external                              |

Three consequences the informal "features over data layers" summary hides, each load-bearing:

- **The data layers (`hooks`, `stores`, `utils`, `types`) may not import `components`.**
  That is what keeps JSX and MUI out of the data code, which is in turn what lets the
  capability-to-panel mapping be tested as pure domain logic (ADR 4).
- **`lib → context` carries exactly one dependency**: the transport and its retry
  schedule import the `StreamConnectionState` type from `context/connectionContext`,
  the single authority on that union (ADR 23). `context → config` exists for
  `tenantConfigContext` (ADR 17).
- **The data layers may not import `config`.** A selector that read tenant configuration
  would make a domain rule vary by deployment.
- **Same-slice only.** `features/fleet` may not import `features/robot`; the `captured`
  matcher in the policy is what enforces it, so two features cannot grow a cycle.

The default is `disallow`, so a new layer is denied until someone writes its policy — the
opposite of a default-allow list where an omission silently permits.

Test files inherit the production layer containing them: unit tests are colocated beside
the sources they cover (`foo.test.tsx` next to `foo.tsx`, ADR 36), and the boundaries
patterns classify them as the layer of the directory they sit in. The `test` element in
the lint configuration names only `src/test/**` setup infrastructure; it is not a
universal escape from the layer direction. The robot-detail suites therefore
share `features/robot/robotDetailFixtures.ts` inside their own feature. Multiple imports
of that same-feature helper are reuse, not cross-layer duplication. Reconsider a narrowly
scoped fixture location only if fixture construction or data is copied across production
layers or feature directories.

| Directory            | Contents                                                                  | Forbidden                                  |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| `src/app`            | Providers, router, shell, theme bridge, dev gallery                       | Domain rules, presentational primitives    |
| `src/features/fleet` | Fleet table, site grouping, summary                                       | Robot-detail components, domain derivation |
| `src/features/robot` | Robot detail, capability panels, persona views, battery-history sparkline | Fleet components, domain derivation        |
| `src/features/map`   | Map page, site facet, and marker SVG canvas (page spec 04, ADR 35)        | Fleet components, domain derivation        |
| `src/hooks`          | Fleet/robot resource hooks, shared fetch lifecycle                        | JSX, MUI imports                           |
| `src/stores`         | Fleet store state machine and its context                                 | JSX, MUI imports                           |
| `src/types`          | Robot and site read-model types                                           | JSX, MUI imports, logic                    |
| `src/components`     | Pure presentational primitives                                            | Any domain reference                       |
| `src/lib`            | Transport client, wire decoding, retry schedule, cold start               | Domain rules, payload interpretation       |
| `src/context`        | Connection, stream-diagnostics, and tenant-config contexts                | Domain rules, JSX                          |
| `src/utils`          | Formatting helpers (`time`)                                               | Domain rules, payload interpretation       |
| `src/config`         | Tenant themes, feature flags, thresholds                                  | Logic of any kind                          |
| `src/styles`         | Authored config-data `tokens.ts`; generated CSS; global styles            | Raw values outside `tokens.ts`             |

Cross-layer movement is downward only. Shared behaviour between two features moves **down**
into the data layers (`hooks`, `stores`, `utils`, `types`), never sideways.

## 5. Contracts owned and consumed

**Consumed:** the canonical envelope and capability payload types from `@fleet/contracts`.
`src/types/robot.ts` mirrors the capability payload types as a read model, and
`src/utils/fromEnvelope.ts` maps envelope → read model at the boundary.

The read model keeps `vendor` as open as the contract keeps `vendorId` (ADR 1): there is
no closed `Vendor` union and no `VENDORS` constant. The fleet filter derives its vendor
options from the robots it was given, so a fourth vendor is an adapter change, never a
console change.

**Sites.** The snapshot's required `sites` directory (ADR 34) is the only source of a site
label. `types/site` holds no fixture table — `selectSiteLabel(siteId, sites)` resolves
against the decoded directory and falls back to the raw identifier only on surfaces that
render before the first snapshot has arrived. The contract's referential check guarantees
a decoded fleet always resolves.

**Owned — the selector layer.** Every rule that turns canonical data into something
displayable lives in `utils/robotSelectors.ts` and is tested as pure domain logic:

| Selector                   | Rule it owns                                                       |
| -------------------------- | ------------------------------------------------------------------ |
| `selectStatusPresentation` | Status + health severity → one chip variant and label              |
| `selectBatteryDisplay`     | Battery, qualified by freshness — em dash when not knowable        |
| `selectFreshnessSummary`   | Fleet-wide freshness counts, mutually exclusive, totalling exactly |
| `selectPositionDisplay`    | Position in its native map frame, never converted to geodetic      |
| `selectPanelCapabilities`  | Declared capabilities minus those carved out of the panel grid     |
| `selectClockDeltaDisplay`  | `reportedAt` vs `receivedAt` skew, for technicians                 |
| `selectSequenceGapDisplay` | Gap count, **or "not evaluated"** — never a false zero             |

`selectStatusPresentation` carries a rule ADR 1 did not originally supply. The fleet table
renders one chip per robot and has no health column, so the chip alone must carry both
status and health severity. Mapping only `degraded` left `critical` passing through to the
status colour — a critically unhealthy idle robot chipped as ordinary "Idle" while the
_lesser_ severity was visible. `critical` now maps to the existing `fault` variant. No
canonical value or token was added, and the label still names the status, so the two
fields are not collapsed into one word (ADR 1 § Observed consequences).

**Owned — capability panel registry.** `features/robot/capabilityPanels.tsx` is a
`Record<CapabilityName, PanelComponent>` iterated over the robot's declared keys — a
registry, **not a conditional chain**, so adding a capability is a registry entry plus a
contracts change rather than an edit to a chain of `if` statements a vendor conditional
could later hide inside. A declared capability with no registered panel renders nothing
and raises no error; a registered panel with no declaration is never reached.

## 6. Governing decisions

- **ADR 1** — capability-driven rendering is literally true here: robot detail renders
  exactly the panels its adapter declared, and absence is a first-class fact rather than an
  unpopulated optional field. `sequence` is carved out of the panel grid explicitly: it is
  a capability, but it is transport metadata rather than an operator-facing machine
  capability, and it renders under Diagnostics (page spec 03 § 6).
- **ADR 3** — freshness is displayed, never derived. **While the stream is down the console
  suppresses per-robot freshness labels** and lets the connection banner carry the
  connection-level state. It does not fall back to a client timer: a label sourced from a
  dead socket asserts a currency the client cannot support, and a client-side fallback
  degrading every row would blame the robots for the console's own blindness.
- **ADR 4** — feature-sliced structure; the data layers' ban on React and MUI imports
  exists so the capability-to-panel mapping is testable as pure domain logic.
- **ADR 5** — MUI plus the token layer. No second styling system: no Tailwind, no
  styled-components, no CSS modules.
- **ADR 7** — `eslint-import-resolver-typescript` is a _required_ dependency, not an
  optimization: `boundaries/dependencies` cannot classify a dependency it cannot resolve,
  and an unclassified dependency is skipped **in silence** rather than reported.
- **ADR 21** — resolves D13 as Option 2. Tenant profiles carry typed endpoint paths and
  Vite proxies `/api` and `/ws` to the server address selected by `FLEET_SERVER_HOST` and
  `FLEET_SERVER_PORT`, keeping development same-origin without exposing the target in the
  browser bundle.
- **Principle 13** — tenant branding, endpoints and flags live in typed configuration;
  per-tenant conditionals in components are defects.

## 7. Enforcement

| Rule                                                | Mechanism     | Where                                             |
| --------------------------------------------------- | ------------- | ------------------------------------------------- |
| Layer dependency rule                               | Static        | `eslint-plugin-boundaries`, `default: "disallow"` |
| No cross-feature import                             | Static        | boundaries `feature → feature` denied except self |
| Module resolution for the above                     | Static        | `eslint-import-resolver-typescript` (ADR 7)       |
| No raw visual literals outside authored `tokens.ts` | Static        | stylelint + ESLint token plugin                   |
| No `@fleet/adapters` or `@fleet/server` import      | Static        | `no-restricted-imports`                           |
| Accessibility                                       | Static + Test | a11y lint; component tests for name, role, state  |
| **The rules above still fire**                      | Test          | `__boundary-violation__` fixtures                 |

Boundaries are declared with `default: "disallow"`, so every allowance is explicit and a
new layer is denied until someone writes the rule for it — the opposite of a default-allow
list where an omission silently permits.

Three enforcement fixtures live in the source tree, excluded from the normal lint run and
reached by a test that constructs ESLint with `ignore: false`:

- `features/fleet/__boundary-violation__/violation.ts` — feature → feature import.
- `features/fleet/__boundary-violation__/legal.ts` — the control, violating nothing.
- `utils/__boundary-violation__/adapterImport.ts` — production → adapters import.

The cross-feature fixture imports the real `RobotDetailPage` export from
`features/robot/index.ts` — the actual public surface, not a placeholder — to prove the
rule rejects feature → feature against production code. Removing or renaming that export
would silently defeat the fixture. Do not repair or delete any of them.

## 8. State, lifecycle and configuration

State is separated by authority, lifetime and transition model (Principle 11):

| Kind           | Owner            | Notes                                                     |
| -------------- | ---------------- | --------------------------------------------------------- |
| Fleet resource | `stores`         | `FleetResourceState` union owned by the fleet store       |
| Observed live  | `stores`         | Delta stream, normalized by robot id                      |
| Requested      | `stores`         | Command acknowledgements, kept **separate** from observed |
| Workflow       | creating feature | In-progress user intent, short-lived                      |
| Local view     | features         | Filter inputs, selections, persona toggle                 |

**Resource-state ownership.** The fleet store is a state machine, not a bag
of rows: the app transport reports what happened — `snapshotStart`, `applySnapshot`,
`applyBatch`, `recoverableFailure`, `terminalFailure` — and the store owns what that means
for the fleet surface. `useFleetRobots()` returns the full `FleetResourceState` union:
`loading`, `ready`, `refreshing`, `recoverable-error` (the only state exposing `retry`),
and `terminal-error` carrying the decoder's issue paths and codes (ADR 20). Data-bearing
states retain robots, the site directory, the snapshot's `capturedAt`, and the latest
applied frame's `sentAt` — the decoded provenance the fleet footer renders (Principle 4).

**Live detail by reconciliation.** Robot detail fetches diagnostics and history once per
visit, then stays live by overlaying this robot's fleet row — via `useFleetRobot(id)` and
the pure `reconcileDetailWithRow` — onto the fetched detail. Core values and freshness
update from deltas; diagnostics and the retained raw payload are never refetched by a
delta, and frames naming other robots do not re-render the page (the store keeps
unrelated rows' identity, and the per-id snapshot bails out on it).

**Stream diagnostics.** The transport's session-wide rejected-frame count travels through
`StreamDiagnosticsContext` in `context` (the ADR 23 pattern) to the technician
Diagnostics section, which states its scope: console session, all robots. Whether a run
of rejections should escalate to a terminal state remains trigger-deferred (fleet TODO
A4).

**Observed and requested state are never collapsed into one value.** Acknowledgement is
not proof of physical state change (Principle 11, non-negotiable 4).

The store is normalized by robot id so subscriptions can be field-scoped and an unrelated
robot's update does not re-render the fleet. No denormalized lists.

`useRobotDetail` returns a `RobotDetailState` discriminated union rather than a bag of
loading and error booleans, which is what makes the state matrix in page spec 03
exhaustively checkable.

`useRobotHistory` is the same pattern for the battery-history resource (ADR 33): fetched
once per visit, its own discriminated state, never joined to the delta stream, and its
failure degrades the section inline rather than blanking valid robot detail. A future
"live sparkline" is a new decision, not a refetch interval added to this hook.

**Theme and tenant.** `data-theme="dark" | "light"` is set on `<html>` from tenant
configuration at boot. Dark and light are not a user preference — they are the two tenant
profiles (`docs/DESIGN_SYSTEM.md` § 1). There is no `localStorage` persistence and no
`prefers-color-scheme`, because a user preference store is a third kind of state that buys
nothing for the argument.

**Decision consequences.** One validated tenant profile is baked into each build and
`flags.lidarHealthPanel` gates the named panel without tenant branches; if the flag loses
an owner, remove the gate and claim ([ADR 17](../00_adr/17_BUILD_TIME_TENANT_CONFIGURATION.md)).
Tenant endpoints remain typed same-origin paths behind the Vite proxy; a split-origin
deployment requires an explicit allow-list and integration tests ([ADR 21](../00_adr/21_ENDPOINTS_FROM_THE_ENVIRONMENT_WITH_A_DEV_PROXY.md)).

`app/theme.ts` sets the attribute and builds the MUI theme from the same palette the token
layer uses. It deliberately does **not** write custom properties inline: an earlier version
set ten of them on `documentElement`, which beat `tokens.css` on specificity and left the
other twenty-six at their dark values on a light background — the light theme was broken
precisely because that file tried to help.

`styles/tokens.ts` is the one authored visual-value source. The MUI theme imports its
palette and numeric shape value directly; `scripts/generateWebTokens.mjs` produces the
committed `tokens.css`, and `pnpm check:tokens` fails when that artifact is stale.

**Personas.** Robot detail defaults to the operator summary; technician diagnostics — raw
payload, adapter version, sequence gaps — are behind an explicit toggle. There is no second
layout, route or role system; the toggle is the mechanism.

## 9. Failure behaviour

Every asynchronous surface defines its complete user-visible state (Principle 5): initial
loading, background refresh, empty, partial data, stale data, offline, recoverable error,
terminal error. Blank screens and indefinite spinners are defects, not edge cases.

The rules that matter most:

- **Never present stale data as current.** A non-`live` row uses an outline status chip
  labelled `(last known)` and an em dash in place of a battery number. The suffix matters
  more than the colour: a reader scanning the status column alone must not be misled.
- **Malformed payloads split by surface.** A malformed snapshot is **terminal**: the
  resource enters `terminal-error` with the decoder's issue paths and codes, no retry is
  offered, and retained rows stay on screen under the banner. A malformed stream frame is
  **dropped and counted**, surfaced in technician diagnostics — the next frame may be
  fine, where re-requesting the same snapshot cannot be.
- **Stream down** → connection banner appears, the table retains last-known data, and
  per-robot freshness labels are **suppressed**. A robot going silent and the console going
  blind are different failures, and deriving freshness server-side is what lets the console
  tell them apart. The fleet summary keeps its four counts but its heading gains the
  "· last known" qualification (ADR 23), so the aggregate makes the same honest claim the
  rows do.
- **Battery history is explicitly historical**, so it stays visible during stream loss:
  the section states its window and that times are server receipt times, which is what
  makes retention during an outage honest rather than stale-as-current. Its three empty
  shapes — no samples, samples without battery, one reading — render as prose, never as a
  chart of zero (ADR 33, Principle 4).
- **Missing capability** → panel omitted entirely. No disabled placeholder, because a
  disabled control implies the capability exists and is merely unavailable.
- **"0 gaps" for a robot that is not checked for gaps is a false statement to an
  operator.** Not-evaluated robots render distinctly from a zero count (ADR 1
  § Implications).

## 10. Verification matrix

| Concern                    | Check                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Selector rules             | Pure unit tests with injected time, no React                                                                               |
| Freshness display          | Never recomputed; label suppressed when the stream is down                                                                 |
| Capability rendering       | Fixture robot without a capability renders no panel                                                                        |
| Core/capability separation | Core fields never appear under the Capabilities section                                                                    |
| No vendor branches         | No vendor `if` anywhere in features; panels resolve through the registry                                                   |
| Accessibility              | Names, roles, state; keyboard flows; heading outline never skips a level                                                   |
| Boundaries                 | Every fixture violation is reported; the control stays silent                                                              |
| Tokens                     | No raw hex, px, rem, or numeric CSS dimensions outside authored `tokens.ts`                                                |
| Development endpoints      | Tenant paths match proxy keys; HTTP and WebSocket proxy end to end                                                         |
| First-load bundle          | JS + CSS stay within 720 kB raw and 300 kB gzip (`pnpm check:bundle`)                                                      |
| Large lists                | Fleet table usable at several hundred robots                                                                               |
| Battery history            | Section state matrix, sparkline coordinates and accessible name, and failure isolation from robot detail                   |
| Map                        | Projection selectors as pure geometry; state matrix; selected-site-only markers and one link per robot at 500 (`mapScale`) |

No snapshot tests — a snapshot asserts output did not change, which is not the same as
asserting it is correct. (Test counts are recorded in dated audit evidence, not here,
because they change with every addition.)

ADR 22 deliberately does not turn adapter coverage into a gate. CI reports it so a human
can notice a change, but the discarded 90% threshold had no derivation and therefore no
authority to block this package or any other.

The one end-to-end path that must exist: a row visibly transitions to stale, driven by
server deltas with no client timer involved.

## 11. Implementation status

**Substantially built.** App shell, router, theme bridge and tenant config; the fleet page;
robot detail with capability panels and the persona toggle; all eight `components`
primitives with their specs; the robot data layers (types, selectors, stores, hooks); the
full token layer; the boundary enforcement fixtures; and a development component gallery.

**Built, 20 August 2026.** The map view: `src/features/map` renders one site at a time
over client-derived extents per page spec 04 and ADR 35, verified by `mapPage.test.tsx`,
`mapScale.test.tsx`, and a smoke browser scenario.

**Wired to live data.** `useFleetRobots` subscribes to the decoded fleet store populated by
the app-owned socket-first, snapshot-second transport, and returns the complete resource
state (§ 8). Robot detail fetches and decodes the single-robot and health endpoints, then
stays live from the same delta stream by reconciliation. The running path is proven in
real browsers by the committed Playwright suite (ADR 32): rendering, streamed row updates,
live detail from deltas, manifest site labels and filters, first-load failure with a
working retry, a controlled malformed snapshot rendered terminally, freshness transitions,
suppression on stream loss, automatic restart recovery, and the tenant-B production
build — against the real server and simulator with the production bundle served by
`vite preview`.

The transport recovers automatically under
[ADR 31](../00_adr/31_JITTERED_RECONNECT_AND_SERVER_SESSION_RECONCILIATION.md): an
immediate first attempt, full-jitter exponential delays under a 30-second ceiling, a
three-attempt cap only while the socket has never opened, and a `serverSessionId`
comparison that re-joins a restarted server instead of discarding its deltas. The
published connection vocabulary is `connecting | connected | reconnecting | disconnected`
with a terminal cause (`handshake-exhausted`, `contract`, `session-mismatch`) carried for
the banner's copy; every non-connected state suppresses row freshness. Manual retry
remains, for the terminal states.

Virtualization of the fleet table is **deferred by decision**
([ADR 24](../00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md), register D14).
The table renders one row per robot and is asserted correct at 500 rows in
`features/fleet/fleetScale.test.tsx` — 500 rows, 500 activation links, fleet-wide counts, and a
filter that still narrows to one. No ceiling is claimed. ADR 32 captured the reopening
workload in committed browser automation: at 500 robots and ten frames per second,
120/120 frames applied with delta-to-next-paint p95 53.7 ms. ADR 24 records that this
evidence did not trigger virtualization. Nothing here should be read as an assumption that
the table is windowed; a test fails if it becomes so without revisiting that ADR.

The joining test in `utils/fromEnvelope.test.ts` now makes the test-only
`@fleet/adapters` dependency earn its keep for all three dialects (ADR 12). Tenant feature
flags and validated build-time selection are implemented (ADR 17).

## 12. Change rules

- A new capability is a `@fleet/contracts` change first, then an adapter declaration, then
  a panel registry entry here. Never the reverse order.
- A new shared primitive gets a component spec in `docs/02_component-specs/` in the same
  change; a feature must not redefine a primitive's API, token mapping or accessibility
  contract.
- Shared behaviour between two features moves **down** to the data layers. A
  cross-feature import is never the fix.
- A missing token is added to authored `tokens.ts` and `tokens.css` is regenerated; a raw literal is never the workaround.
- Changing `aria-pressed` to radio semantics on the persona toggle — or any equivalent
  change to what assistive technology announces — is a specification change, not an
  implementation detail.
- Stop and ask if a change introduces a vendor conditional, a new dependency, logic in
  `config`, a collapsed state type, or a cross-feature import.

## 13. Principles 1–15: enforcement and evidence

| Principle                              | Enforcement / evidence in this package                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1 — one authoritative implementation   | Selectors own display rules; contracts own decoding; `reconcileDeltaWithSnapshot` imported, not copied |
| 2 — validate at the boundary           | `lib/transportDecoding.ts` is the only decode site; everything downstream takes decoded values         |
| 3 — vendor differences as capabilities | Panel registry over declared keys; no vendor `if` in features; open vendor filter options              |
| 4 — freshness first-class              | Server-derived labels, suppression while disconnected, decoded footer provenance, no client timer      |
| 5 — complete async states              | `FleetResourceState`, `RobotDetailState`, history state unions; page tests drive every member          |
| 6 — accessibility                      | Roles/names asserted in component tests; keyboard smoke test in three engines                          |
| 7 — server authorizes                  | The console renders and never authorizes; ADR 26's demo-only exposure is stated on the surface         |
| 8 — one styling system                 | MUI + tokens; generated CSS plus stylelint/ESLint reject raw literals outside `tokens.ts`              |
| 9 — enforced boundaries                | `eslint-plugin-boundaries` default-disallow plus live `__boundary-violation__` fixtures                |
| 10 — test-first, verified in browser   | Focused unit suites plus the ADR 32 Playwright evidence against the real stack                         |
| 11 — state separated by authority      | Store transitions are explicit; observed and requested never collapse; view state stays in features    |
| 12 — usable at scale                   | 500-row correctness test plus the measured live-stream run (ADR 24 trigger unfired)                    |
| 13 — deployment in configuration       | Build-time tenant profiles; the tenant-B build is driven in CI, not reasoned about                     |
| 14 — documented coupling               | Doc comments on every export (ADR 28 lint); coupling named on both sides                               |
| 15 — proportionate enforcement         | Gates are derived (bundle budget, diff cap); reported-not-gated where no derivation exists (ADR 22)    |
