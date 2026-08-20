# 05 — `web`

- **Status:** implemented live console; named follow-ups remain in scoped TODOs
- **Package:** `packages/web`
- **Governing documents:** ADR 1 (capability-driven rendering), ADR 3 (freshness is
  displayed, never derived), ADR 4 (feature-sliced structure), ADR 5 (MUI with tokens
  only), ADR 7 (the resolver is part of the dependency rule), ADR 17 (build-time tenant
  configuration), ADR 21 (typed endpoints and Vite dev proxy), ADR 22 (first-load bundle
  gate); Principles 1, 4, 5, 6, 8, 9, 11, 12, 13
- **Related specs:** `docs/01_page-specs/`, `docs/02_component-specs/`,
  `docs/DESIGN_SYSTEM.md`

## 1. Responsibility

`web` is the fleet operations console and the primary deliverable. It consumes canonical
telemetry envelopes, renders the fleet list and robot detail, drives robot-detail panels
from declared capabilities, and presents every value alongside how old it is.

It does **not**: derive freshness, normalize vendor data, hold domain rules in components,
branch on vendor, or authorize anything.

Two non-responsibilities are absolute:

- **It never derives freshness.** Not in a component, not in `entities`, not on a timer.
  Freshness arrives as a field on the envelope. The entity layer maps it onto presentation
  (`selectStatusPresentation`, `selectBatteryDisplay`) and holds no clock. A second
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
`entities/robot/__boundary-violation__/`.

ADR 12 ratifies this test-only dependency, and ADR 11 supplies its public
`@fleet/adapters/testing` fixture surface. The subpath loads under jsdom and is covered by
both a production-import rejection fixture and a legal test-import fixture. The joining
test exercises all three vendor adapters through the public dispatch and fixture surfaces;
ADR 11 and ADR 12 are implemented.

## 3. Public API

None. This package is an application; its entry point is `src/main.tsx` and its surface is
the rendered UI plus the routes in `src/app/appRouter.tsx`.

Internal layer boundaries take the place of a public API, and they are enforced rather
than conventional — see § 7.

## 4. Internal structure

Feature-sliced (ADR 4). The dependency rule, stated exactly as
`eslint-plugin-boundaries` enforces it rather than as the informal summary:

| From         | May import                                                      |
| ------------ | --------------------------------------------------------------- |
| `app`        | everything, plus external                                       |
| `feature`    | **its own feature only**, entity, shared-ui, shared-lib, config |
| `entity`     | **its own entity only**, **shared-lib only**, external          |
| `shared-ui`  | shared-ui, external                                             |
| `shared-lib` | shared-lib, external                                            |
| `config`     | config, external                                                |
| `test`       | everything, plus external                                       |

Three consequences the informal "entities → shared" summary hides, each load-bearing:

- **`entity` may import `shared-lib` but not `shared-ui`.** That is what keeps JSX and MUI
  out of the entity layer, which is in turn what lets the capability-to-panel mapping be
  tested as pure domain logic (ADR 4).
- **`entity` may not import `config`.** A selector that read tenant configuration would
  make a domain rule vary by deployment.
- **Same-slice only.** `features/fleet` may not import `features/robot`, and
  `entities/robot` may not import `entities/site`. The `captured` matcher in the policy is
  what makes the second half of that true; a rule allowing `entity → entity` generally
  would let the two entities grow a cycle.

The default is `disallow`, so a new layer is denied until someone writes its policy — the
opposite of a default-allow list where an omission silently permits.

Test files inherit the production layer containing them. The `test` element in the lint
configuration names only `src/test/**` setup infrastructure; it is not a universal escape
from feature/entity/shared direction. The two sibling robot-detail suites therefore share
`features/robot/robotDetailFixtures.ts` inside their own feature. Multiple imports of that
same-feature helper are reuse, not cross-layer duplication. Reconsider a narrowly scoped
fixture location only if fixture construction or data is copied across production layers
or feature directories.

| Directory            | Contents                                                                  | Forbidden                                  |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| `src/app`            | Providers, router, shell, theme bridge, dev gallery                       | Domain rules, presentational primitives    |
| `src/features/fleet` | Fleet table, site grouping, summary                                       | Robot-detail components, domain derivation |
| `src/features/robot` | Robot detail, capability panels, persona views, battery-history sparkline | Fleet components, domain derivation        |
| `src/entities/robot` | Robot read model, selectors, hooks                                        | JSX, MUI imports                           |
| `src/entities/site`  | Site model, grouping                                                      | JSX, MUI imports                           |
| `src/shared/ui`      | Pure presentational primitives                                            | Any domain reference                       |
| `src/shared/lib`     | Formatting, time helpers, transport client                                | Domain rules, payload interpretation       |
| `src/config`         | Tenant themes, feature flags, thresholds                                  | Logic of any kind                          |
| `src/styles`         | `tokens.css`, `global.css`, `utilities.css`                               | Component-level hex or raw px              |

Cross-layer movement is downward only. Shared behaviour between two features moves **down**
into `entities` or `shared`, never sideways.

## 5. Contracts owned and consumed

**Consumed:** the canonical envelope and capability payload types from `@fleet/contracts`.
`src/entities/robot/model.ts` mirrors the capability payload types as a read model, and
`src/entities/robot/fromEnvelope.ts` maps envelope → read model at the boundary.

The read model deliberately narrows where the contract is deliberately open: `Vendor` is a
closed union of `"A" | "B" | "C"` here because it is a read model for three known
fixtures, while `vendorId` in contracts stays an open identifier so a fourth vendor is
never a contracts change (ADR 1 § Observed consequences).

**Owned — the selector layer.** Every rule that turns canonical data into something
displayable lives in `entities/robot/selectors.ts` and is tested as pure domain logic:

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
- **ADR 4** — feature-sliced structure; the entity layer's ban on React and MUI imports
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

| Rule                                             | Mechanism     | Where                                             |
| ------------------------------------------------ | ------------- | ------------------------------------------------- |
| Layer dependency rule                            | Static        | `eslint-plugin-boundaries`, `default: "disallow"` |
| No cross-feature import                          | Static        | boundaries `feature → feature` denied except self |
| Module resolution for the above                  | Static        | `eslint-import-resolver-typescript` (ADR 7)       |
| No raw hex / px outside `shared/ui` and `config` | Static        | stylelint + eslint                                |
| No `@fleet/adapters` or `@fleet/server` import   | Static        | `no-restricted-imports`                           |
| Accessibility                                    | Static + Test | a11y lint; component tests for name, role, state  |
| **The rules above still fire**                   | Test          | `__boundary-violation__` fixtures                 |

Boundaries are declared with `default: "disallow"`, so every allowance is explicit and a
new layer is denied until someone writes the rule for it — the opposite of a default-allow
list where an omission silently permits.

Three enforcement fixtures live in the source tree, excluded from the normal lint run and
reached by a test that constructs ESLint with `ignore: false`:

- `features/fleet/__boundary-violation__/violation.ts` — feature → feature import.
- `features/fleet/__boundary-violation__/legal.ts` — the control, violating nothing.
- `entities/robot/__boundary-violation__/adapterImport.ts` — entity → adapters import.

`features/robot/index.ts` exports a placeholder named `RobotDetail` **deliberately**: the
cross-feature fixture imports that name to prove the rule rejects it. Renaming it would
silently defeat the fixture. Do not repair or delete any of them.

## 8. State, lifecycle and configuration

State is separated by authority, lifetime and transition model (Principle 11):

| Kind            | Owner            | Notes                                                     |
| --------------- | ---------------- | --------------------------------------------------------- |
| Remote resource | `entities`       | Fetched records, loaded or refreshed once                 |
| Observed live   | `entities/robot` | Delta stream, normalized by robot id                      |
| Requested       | `entities/robot` | Command acknowledgements, kept **separate** from observed |
| Workflow        | creating feature | In-progress user intent, short-lived                      |
| Local view      | features         | Filter inputs, selections, persona toggle                 |

**Observed and requested state are never collapsed into one value.** Acknowledgement is
not proof of physical state change (Principle 11, non-negotiable 4).

The store is normalized by robot id so subscriptions can be field-scoped and an unrelated
robot's update does not re-render the fleet. No denormalized lists.

`useRobotDetail` returns a `RobotDetailState` discriminated union rather than a bag of
loading and error booleans, which is what makes the state matrix in page spec 03
exhaustively checkable.

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
- **Stream down** → connection banner appears, the table retains last-known data, and
  per-robot freshness labels are **suppressed**. A robot going silent and the console going
  blind are different failures, and deriving freshness server-side is what lets the console
  tell them apart.
- **Missing capability** → panel omitted entirely. No disabled placeholder, because a
  disabled control implies the capability exists and is merely unavailable.
- **"0 gaps" for a robot that is not checked for gaps is a false statement to an
  operator.** Not-evaluated robots render distinctly from a zero count (ADR 1
  § Implications).

## 10. Verification matrix

| Concern                    | Check                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| Selector rules             | Pure unit tests with injected time, no React                             |
| Freshness display          | Never recomputed; label suppressed when the stream is down               |
| Capability rendering       | Fixture robot without a capability renders no panel                      |
| Core/capability separation | Core fields never appear under the Capabilities section                  |
| No vendor branches         | No vendor `if` anywhere in features; panels resolve through the registry |
| Accessibility              | Names, roles, state; keyboard flows; heading outline never skips a level |
| Boundaries                 | Every fixture violation is reported; the control stays silent            |
| Tokens                     | No raw hex or px outside `shared/ui` and `config`                        |
| Development endpoints      | Tenant paths match proxy keys; HTTP and WebSocket proxy end to end       |
| First-load bundle          | JS + CSS stay within 720 kB raw and 300 kB gzip (`pnpm check:bundle`)    |
| Large lists                | Fleet table usable at several hundred robots                             |

265 tests across 29 files. No snapshot tests — a snapshot asserts output did not change,
which is not the same as asserting it is correct.

ADR 22 deliberately does not turn adapter coverage into a gate. CI reports it so a human
can notice a change, but the discarded 90% threshold had no derivation and therefore no
authority to block this package or any other.

The one end-to-end path that must exist: a row visibly transitions to stale, driven by
server deltas with no client timer involved.

## 11. Implementation status

**Substantially built.** App shell, router, theme bridge and tenant config; the fleet page;
robot detail with capability panels and the persona toggle; all eight `shared/ui`
primitives with their specs; the robot and site entity layers with selectors and hooks; the
full token layer; the boundary enforcement fixtures; and a development component gallery.

**Wired to live data.** `useFleetRobots` subscribes to the decoded fleet store populated by
the app-owned socket-first, snapshot-second transport. Robot detail fetches and decodes the
single-robot and health endpoints. The running path has been observed rendering freshness
transitions and suppressing row labels on stream loss; committed browser automation remains
open decision D23.

The transport connects on demand and exposes a manual retry, but it does not schedule
automatic recovery. Retry policy and server-restart sequence reconciliation remain open
decision D22.

Virtualization of the fleet table is **deferred by decision**
([ADR 24](../00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md), register D14).
The table renders one row per robot and is asserted correct at 500 rows in
`features/fleet/fleetScale.test.tsx` — 500 rows, 500 activation links, fleet-wide counts, and a
filter that still narrows to one. What is not claimed is a ceiling: the workload that decides
whether windowing helps is delta churn at 500 robots, not a static render, and has not yet been
captured by committed browser automation. Nothing here should be read as an assumption that the table
is windowed; a test fails if it becomes so without revisiting that ADR.

The joining test in `entities/robot/fromEnvelope.test.ts` now makes the test-only
`@fleet/adapters` dependency earn its keep for all three dialects (ADR 12). Tenant feature
flags and validated build-time selection are implemented (ADR 17).

## 12. Change rules

- A new capability is a `@fleet/contracts` change first, then an adapter declaration, then
  a panel registry entry here. Never the reverse order.
- A new shared primitive gets a component spec in `docs/02_component-specs/` in the same
  change; a feature must not redefine a primitive's API, token mapping or accessibility
  contract.
- Shared behaviour between two features moves **down** to `entities` or `shared`. A
  cross-feature import is never the fix.
- A missing token is added to `tokens.css`; a raw literal is never the workaround.
- Changing `aria-pressed` to radio semantics on the persona toggle — or any equivalent
  change to what assistive technology announces — is a specification change, not an
  implementation detail.
- Stop and ask if a change introduces a vendor conditional, a new dependency, logic in
  `config`, a collapsed state type, or a cross-feature import.
