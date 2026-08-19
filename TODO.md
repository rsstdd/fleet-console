# TODO — documentation / codebase alignment

**Audit date:** 19 August 2026
**Audited:** `PRINCIPLES.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/00_adr/*`, `docs/01_page-specs/*`, `docs/02_component-specs/*`, `docs/DESIGN_SYSTEM.md`, `docs/design-system.html`, `docs/WIREFRAMES.md`, `packages/web/CLAUDE.md`, `packages/web/UI_PLAN.md`, `packages/web/README.md`, and every file under `packages/web/src`.
**Scope:** whole repository. Items outside `packages/web` are marked `[repo]`.

## Verified state of the checks

Re-run 19 August 2026, in `packages/web`:

| Command | Result | Change since first audit |
| --- | --- | --- |
| `pnpm build` (`tsc -b && vite build`) | **fails** — 12 TypeScript errors | was 18 |
| `pnpm typecheck` (`tsc --noEmit`) | **passes, but checks nothing** — see **B12** | unchanged |
| `pnpm lint:js` | **fails** — 36 errors across 5 files | was 88 |
| `pnpm lint:css` | passes | unchanged |
| `pnpm test` | **fails** — 1 test, 1 failure | unchanged |
| CI | none exists | unchanged |

Remaining build errors, in full:

```
src/App.tsx(293,14) (348,14) (373,16)   MUI v9 Stack overloads        → B4
src/app/appRouter.tsx(3,33) (8,28)      missing module, undefined id  → B2
src/features/fleet/FleetPage.tsx(35,10) (35,17)  SITES/selectSiteLabel → B14
src/features/fleet/FleetPage.tsx(121,5)          Stack overload       → B4
src/features/fleet/FleetPage.tsx(147,19)         implicit any         → B7
src/shared/ui/freshnessLabel.tsx(65,16) (65,43)  process is undefined → B5
vite.config.ts(12,3)                             test key untyped     → B6
```

Lint errors by rule: `no-restricted-syntax` 18 (all `App.tsx`, **B8**), then
`no-unsafe-member-access` 5, `no-confusing-void-expression` 3,
`restrict-template-expressions` 3, `no-unsafe-call` 2, `no-unsafe-assignment` 2,
and one each of `no-misused-promises`, `no-unnecessary-condition`,
`no-redundant-type-constituents`. Most are downstream of **B14**.

**The dependency rule is still inert.** Re-probed after the `tsconfig` fix:

1. Feature-to-feature fixture linted directly, top-level `ignores` entry removed — zero messages.
2. Same violation as a relative import (`../../robot/index`), no alias involved — zero messages.
3. Rule reduced to `{ default: "disallow", policies: [] }`, which must reject every import in any classified file — zero messages.

Probe 3 is conclusive: no file is classified as an element, so no policy can fire, and the fault is in `settings["boundaries/elements"]`, not the policy list. `tsconfig.app.json`'s `paths` alias is now correctly inside `compilerOptions`; `eslint-import-resolver-typescript` is still not referenced from `eslint.config.js`. See **B11**.

## Cleared since the first audit

Removed from this list, verified done: the robot model moved to `entities/robot/model.ts` (**B1**), which also made `selectFreshnessSummary` provably total (**B3**); principle numbering unified against the rewritten `PRINCIPLES.md` (**D8**); the root README written (**A7**); root `.gitignore` (**A14**); the page-spec stray code fence (**A16**); `LICENSE` added.

All six ADRs are now written, correctly numbered and named, in template order. `docs/SUBMISSION_NOTES.md` holds the evaluation-facing material. `UI_PLAN.md` is at revision 5 with its wrong `@/shared/ui` import sample and its wrong ADR 6 citation both corrected. ADR 4 has been amended to `Partial` and now records the inert rule rather than claiming enforcement.

# Tier 0 — Blocking

Nothing else can be verified while these hold. Ordered so each item unblocks the next.

### B2. `src/app/appRouter.tsx` is not valid code

```tsx
import { Routes, Route } from "react-router";
import { FleetPage } from "@/features/fleet/FleetPage";
import { RobotDetailPage } from "@/features/robot/RobotDetailPage";  // does not exist

<Routes>                                    // bare expression statement, not a component
 <Route path="*" element={<NotFound />} />  // NotFound is undefined
</Routes>
```

There is no exported component, nothing imports this file, and `src/main.tsx` renders `App` directly. The router is dead code that breaks the build.

**Fix:** make it an exported component (`export function AppRouter()`), and either create the missing `RobotDetailPage` and `NotFound` or stub them with the `EmptyState` the page specs already require (`03_ROBOT_DETAIL.md` § 10 "Unknown id → EmptyState"; `01_APP_SHELL.md` § 8 "Unknown route: simple not-found inside main"). Depends on **T2** (app shell) to have somewhere to mount.

### B4. MUI v9 removed `flexWrap` / `alignItems` as direct `Stack` props

Four call sites: `src/App.tsx:293`, `:348`, `:373`, and `src/features/fleet/FleetPage.tsx:121`.

**Fix:** move them into `sx`. Related: **A9** — `packages/web/CLAUDE.md` still says MUI v5, which is why this breaking change was not anticipated.

### B5. `FreshnessLabel` reads `process.env` in browser code

`src/shared/ui/freshnessLabel.tsx:65` — `process` is not defined in the browser and is not in `tsconfig.app.json`'s `types`. Two TS errors plus a lint error.

**Fix:** use `import.meta.env.DEV`, which Vite defines and `vite/client` already types. This is also the correct signal — the spec's rule (`02_FRESHNESS_LABEL.md` § 10) is "throws in development", and `import.meta.env.DEV` is the dev flag, whereas `NODE_ENV === "development"` is never set in a Vite browser bundle, so the guard is currently dead in every environment.

### B6. `vite.config.ts` `test` key is not typed

`vite.config.ts:12` — `defineConfig` from `vite` has no `test` property.

**Fix:** import `defineConfig` from `vitest/config`, or add `/// <reference types="vitest/config" />`.

### B7. Implicit-`any` parameter in `FleetPage`

`src/features/fleet/FleetPage.tsx:147` (`site`). Downstream of **B14** — the import fails, so `SITES` is untyped. Recheck after B14 rather than annotating it.

### B8. `src/App.tsx` hardcodes the entire tenant palette as hex literals

`src/App.tsx:106–129` — `TENANT_PALETTE` duplicates the dark and light values from `src/styles/tokens.css` in JavaScript, then `applyTenantCssVariables` writes them back onto `documentElement` as inline custom properties at runtime. This produces all 18 `no-restricted-syntax` lint errors.

It is also a correctness bug independent of lint: the function sets only 10 of the ~35 custom properties a theme needs. `--surface-raised`, `--surface-sunken`, `--line-strong`, every `--status-*` and `--status-*-bg` / `--status-*-border`, `--header-bg`, `--row-hover`, `--overlay` and both shadows are never overridden, so switching to Tenant B leaves those at their dark values on top of a light background. `tokens.css` already defines the complete light set under `[data-theme="light"]`, and the inline properties written by `applyTenantCssVariables` have higher specificity than that block, so the code actively defeats the working implementation.

`docs/DESIGN_SYSTEM.md` § 7 states the intended mechanism: *"Single token set at `tokens.css` with a `[data-theme="light"]` override block."*

**Fix:** delete `TENANT_PALETTE` and `applyTenantCssVariables`. Set `data-theme` on `documentElement` and let `tokens.css` do the rest. `buildMuiTheme` must then read resolved token values (via `getComputedStyle` on `:root` at theme-switch time, or by keeping the MUI palette expressed as `var(--token)` strings where MUI accepts them, as the typography block already does). See **D5** for the open question this raises.

### B9. `main.tsx` mounts into `document.body`, not `#root`

`src/main.tsx:12` — `createRoot(document.body)` while `index.html:9` provides `<div id="root">`. React owning `<body>` conflicts with anything else that writes there, including MUI's portal containers for `Select` and `Tooltip`, both of which the fleet filters use.

**Fix:** mount into `#root`.

### B10. The boundary fixture test asserts the wrong thing and cannot run

Two independent defects in `src/features/fleet/__boundary-violation__/`:

1. The file is excluded from linting twice — `eslint.config.js` global `ignores`, and `--ignore-pattern` in the `lint:js` script. `new ESLint({ ignore: false })` does not defeat flat-config `ignores`, so the programmatic run sees nothing.
2. The assertion is `expect(result.messages.length).toBeGreaterThan(0)` — any lint message would satisfy it. `PRINCIPLES.md` § 15 requires custom rules be tested with valid and invalid fixtures; this tests neither specifically.

Two `console.log` calls remain from debugging, surviving only because the directory is unlinted.

**Fix (after B11):** assert on `ruleId === "boundaries/dependencies"`. Add the positive half — a legal import that must produce no boundaries message — so a disabled rule cannot pass by accident. Remove the `console.log`s. Keep the `ignores` entry so the fixture does not fail the normal lint run, but give the test's programmatic ESLint instance a config that does not ignore it.

**Also missing:** ADR 4 requires a second fixture at `src/entities/robot/__boundary-violation__/violation.ts` exercising the external-dependency policies. It does not exist. ADR 4 previously claimed it did; that entry is now retracted in its Observed consequences, and the three external-dependency policies remain unexercised.

### B11. `boundaries/dependencies` is inert — the dependency rule enforces nothing

The headline finding, re-verified after the `tsconfig` fix. Evidence and probes are in "Verified state of the checks" above.

**Fix:** get element classification working first. Probe 3 — `{ default: "disallow", policies: [] }` — must flag every import in a source file before any real policy is worth writing. That is the gate. Then re-add the policies and confirm each of the eight fires, including the three external-module policies (entity ⇸ `react-dom`/`@mui/*`/`react-router*`, shared-ui ⇸ `@fleet/contracts`, config ⇸ `react`/`@mui/*`), none of which has ever been exercised.

Two things to check while doing so:

- Policy `allow` values are arrays of selector objects; the plugin's own documentation shows `allow` as a single object using `types: { anyOf: [...] }`. Confirm the array form is supported in v7 rather than silently ignored.
- `eslint-import-resolver-typescript` is a repo-root devDependency but is not referenced from `eslint.config.js`. Relative imports fail too, so it is not the only cause, but it will matter once classification works.

Reference: `https://www.jsboundaries.dev/docs/classification/`

**Until this is fixed**, `README.md` § 7, `packages/web/CLAUDE.md`, and `PRINCIPLES.md` § 9's "Enforced by" all overstate what the repository does. ADR 4 has already been corrected; the others have not. See **A17**.

### B12. `pnpm typecheck` verifies nothing `[repo]`

`tsconfig.json` is solution-style (`"files": []`, two `references`). `tsc --noEmit` against it checks zero files and exits 0. The 18 real errors only appear under `tsc -b`.

This is the reason a repository with 18 type errors reported a green typecheck.

**Fix:** change the `typecheck` script to `tsc -b --noEmit` (or `tsc -b`). Then **B13**.

### B13. `strict` is not set in `tsconfig.app.json`

`tsconfig.app.json` sets `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `erasableSyntaxOnly` — but never `strict`. The project is currently relying on the toolchain default rather than a stated decision, in a repository whose `PRINCIPLES.md` § 3 and § 4 lean on the type system by name.

**Fix:** set `"strict": true` explicitly. Consider `noUncheckedIndexedAccess` too, given how much of the domain code indexes `Record<Enum, T>` lookup tables (`selectors.ts`, `statusChip.tsx`, `freshnessLabel.tsx`).

---

### B14. `FleetPage` imports site exports from the robot entity

`src/features/fleet/FleetPage.tsx:35` — `import { SITES, selectSiteLabel } from "@/entities/robot/model"`. Both live in `@/entities/site/model`. Two build errors, and the cause of **B7** plus most of the remaining `no-unsafe-*` lint errors.

Residue of **B1**'s fix: the robot model moved, and this import followed it to the wrong file. One line.

Note that once corrected this becomes a cross-entity import (`features/fleet` → two different entities), which is legal — a feature may import any entity. It is `entities/robot` importing `entities/site` that the rule forbids, and that does not happen here.

# Tier 1 — Decisions

Each of these is a contradiction between two documents, or between a document and the code, that cannot be fixed without choosing. Recommendations are given; the choice is the reader's.

### D1. `StatusChip` has two incompatible variant sets

| Source                                              | Variants                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `docs/02_component-specs/01_STATUS_CHIP.md` § 3     | `online`, `offline`, `degraded`, `critical`, `charging`, `maintenance`, `info` (7) |
| `docs/DESIGN_SYSTEM.md` § 2.3                       | `neutral`, `active`, `charging`, `degraded`, `fault`, `unknown` (6)                |
| `docs/02_component-specs/02_FRESHNESS_LABEL.md` § 6 | six variants, naming the design-system set                                         |
| `packages/web/UI_PLAN.md` § 3                       | the six-variant set                                                                |
| `src/styles/tokens.css`, `docs/design-system.html`  | the six-variant set                                                                |
| `src/shared/ui/statusChip.tsx`                      | the six-variant set                                                                |

`01_STATUS_CHIP.md` is the only holdout. It also references tokens that no longer exist (`--online` … `--info`, § 6), which `02_FRESHNESS_LABEL.md`'s revision-2 note explicitly calls out: *"the old `--online` / `--offline` family tokens no longer exist in the design profile."* And it is missing the `current` prop that the design system (§ 2.5), the wireframes (§ 2), `UI_PLAN.md` and the implementation all require.

Its § 12 change rule — *"New variants require a design-token addition and an update to this document in the same change"* — was not followed when the palette was cut from seven to six.

**Options:** (a) rewrite `01_STATUS_CHIP.md` to revision 2, matching everything else; (b) restore `maintenance` and `info` across the palette and the canonical model.

**Recommendation: (a).** `DESIGN_SYSTEM.md` § 0.2 states the governing rule — *"No token exists for a state the adapters cannot produce"* — and no adapter emits maintenance or info. (b) would require adding two states to the canonical status enum for the sake of a stale spec. Add a revision-2 header to `01_STATUS_CHIP.md` recording what changed and why, in the style the other revised specs use. Note that `src/shared/ui/statusChip.tsx`'s doc comment already claims it implements "revision 2" of a spec that has no revision-2 text — writing that revision retires the false citation as well.

### D2. `FreshnessLabel` in `compact` mode drops the age it declares mandatory

`02_FRESHNESS_LABEL.md` § 3 makes `asOf` required with the rationale *"Principle 7 admits no telemetry value without its age"* and § 11 verifies *"`asOf` is never omitted."* But § 3 also defines `compact` as "chip only vs chip + relative/absolute time", and `src/shared/ui/freshnessLabel.tsx:96` implements exactly that: `compact` computes no formatted time and renders none.

The fleet table uses `compact` on every row (`FleetPage.tsx:269`). So on the primary operator surface, the required-by-principle age is not displayed by this component at all. It is *coincidentally* still on screen, because the table has a separate "Last seen" column (`FleetPage.tsx:295`) — a different code path with a different formatter.

Worth noting that `PRINCIPLES.md` § 6 does not actually demand a per-value label: *"Do not require every telemetry value to render a separate LIVE, STALE, UNREACHABLE or UNKNOWN label. Show freshness at the smallest scope users need."* The component spec's absolutism is stricter than the principle it cites.

**Options:** (a) keep `compact` as is, and amend § 3 / § 11 to say the age may be carried by an adjacent column, naming the fleet table as that case; (b) make `compact` render a short relative age (`18s`), so the prop is always honoured; (c) drop the `compact` prop and let callers constrain width.

**Recommendation: (a) plus a caveat.** The wireframe (`WIREFRAMES.md` § 2) shows exactly one time per row, in the LAST SEEN column, so (b) would put two ages in one row and contradict the wireframe. But (a) must be paired with **D3**, because "the adjacent column carries it" is only honest if the adjacent column is honest.

### D3. A robot that has never reported is given a fabricated timestamp

`src/features/fleet/FleetPage.tsx:271–276`:

```tsx
{robot.lastSeenAt !== null
  ? <FreshnessLabel state={robot.freshness} asOf={robot.lastSeenAt} compact />
  : <FreshnessLabel state={robot.freshness} asOf={new Date(0).toISOString()} compact />}
```

For a robot with `freshness: "unknown"` and `lastSeenAt: null` — a case the fixture deliberately includes (`useFleetRobots.ts`, `R-233`, with the comment *"A robot with freshness 'unknown' has never reported — it cannot have a last-seen time"*) — the code invents `1970-01-01T00:00:00.000Z` to satisfy the required prop.

Today this is invisible because `compact` discards it (**D2**). Choose (b) or (c) in D2, or use the component in full mode anywhere, and the console displays 1 January 1970 as an observation time. The em dash in the adjacent Last seen column is correct; this is not.

This is the exact failure `PRINCIPLES.md` § 6 names: *"Preserve a distinction between unknown, never observed, stale and disconnected."* `02_FRESHNESS_LABEL.md` § 3 even anticipates it — *"A caller with no timestamp to show is a data problem to fix upstream, not a reason to silently omit the age"* — but the caller responded by fabricating one instead.

**Options:** (a) type it as `asOf: string | null` and have the component render the state word alone when null, documenting that null means never-observed; (b) keep `asOf: string` and add a separate `neverObserved?: boolean` prop; (c) leave the required string and have `FleetPage` render the state word without the component for this case.

**Recommendation: (a).** It models the real domain — `Robot.lastSeenAt` is already `string | null` for precisely this reason — and it keeps one component responsible for the freshness presentation. `null` is not "silently omitting the age"; it is stating that no observation exists, which is different information. Update `02_FRESHNESS_LABEL.md` § 3, § 4, § 10 and the `UI_PLAN.md` § 3 API block together.

### D4. Three styling systems are in use where the documents mandate one

`packages/web/CLAUDE.md` states: *"Never introduce a second styling system. Material UI with the token layer is the decision, recorded in ADR 5."* In practice there are three, and they disagree:

1. **Class-based CSS** in `src/styles/global.css` — `.status`, `.status--*`, `.freshness`, `.freshness--*`, `.data-plate`, `.section-label`.
2. **Inline `style` objects** in `src/shared/ui/freshnessLabel.tsx` (`ROOT_STYLE`, `STATE_STYLE`, `DOT_STYLE`, `DOT_STATE_STYLE`, `AS_OF_STYLE`) and `src/shared/ui/statusChip.tsx` (`SMALL_STYLE`).
3. **MUI `sx` / `createTheme`** in `App.tsx`, `FleetPage.tsx`, `personaToggle.tsx`.

They actively contradict each other. `global.css:243` renders unreachable freshness in `var(--status-fault)`; the inline `DOT_STATE_STYLE` and `STATE_STYLE` render it in `var(--ink-muted)`. `DESIGN_SYSTEM.md` § 2.5 and `02_FRESHNESS_LABEL.md` § 6 both say `--ink-muted` and both say freshness must never borrow the status palette — so the CSS file is wrong, and it loses only because the inline styles win the cascade. Change the markup and the wrong colour reappears.

Worse, the class names do not match the markup at all: `global.css:231` and `:236` style `.freshness .state` and `.freshness .age`, while the component emits `.freshness__label` and `.freshness__asOf`. Those rules have never applied to anything.

**Options:** (a) CSS classes are authoritative for `shared/ui`; delete the inline style objects and fix the class names; (b) inline styles / `sx` are authoritative; delete the dead CSS blocks; (c) move everything into the MUI theme's `components.styleOverrides`.

**Recommendation: (a).** The class approach is what every component spec's § 4 "Required output" specifies, character for character, and it is what `docs/design-system.html` demonstrates. It also keeps `shared/ui` free of the per-render object allocation the inline approach costs on a 500-row table. Blocked on **D9** (stylelint currently rejects the class names).

### D5. Tenant configuration has no home

`packages/web/CLAUDE.md` lists `src/config` in its directory table; `docs/01_page-specs/01_APP_SHELL.md` § 2 requires wordmark, theme and feature flags from `config.tenant`; `DESIGN_SYSTEM.md` § 1 requires a tenant switch to change all three at once; `eslint.config.js` defines a `config` element type with two policies.

**`src/config/` now exists and is empty.** `App.tsx` still hardcodes the tenant switch (**B8**).

Also unresolved: `01_APP_SHELL.md` § 8 requires a fallback — "Tenant config missing or fails to load: fall back to Tenant A defaults" — which implies config is loaded, not imported. `PRINCIPLES.md` § 13 requires typed, validated configuration and gives every runtime flag an owner, purpose, default, rollout policy and removal condition.

**Options:** (a) static typed module — `src/config/tenants.ts` exporting a frozen record, tenant chosen by env var at build time; (b) runtime-fetched JSON validated at boot, with the Tenant A fallback; (c) build-time env only, no runtime tenant switch.

**Recommendation: (a), shaped for (b).** The demo script never switches tenant at runtime, so (b)'s loader is unused work — but § 8's "fails to load" language and Principle 13's "validated" both point at (b) eventually. Define the `TenantConfig` type and a `parseTenantConfig` validator now, feed it a literal, and the later swap is one function. Record the choice in an ADR.

The flag inventory is still undecided: `DESIGN_SYSTEM.md` § 1 says Tenant B has "one panel disabled" without naming which, and Principle 13 requires an owner and removal condition per flag. Name the flag and its panel, or drop the claim.

### D6. `StatusChip`'s accessible name is specified three ways

- `DESIGN_SYSTEM.md` § 5: *"The accessible name carries the state and the age together, so a screen reader receives the same qualification a sighted reader receives."*
- `UI_PLAN.md` § 3: *"`StatusChip` composes its accessible name from label, currency and, when supplied by the caller through `aria-describedby`, the freshness age."*
- `01_STATUS_CHIP.md` § 4: required output is a bare `<span>` with **no** `role`, no `aria-*`, and no `aria-describedby` in the prop list.
- `02_FRESHNESS_LABEL.md` § 9: *"When paired, `StatusChip`'s own accessible name carries the '(last known)' qualification — `FreshnessLabel` does not duplicate it."*

The implementation follows `01_STATUS_CHIP.md` — a plain span whose accessible name is whatever text the caller passed. Because `selectStatusPresentation` appends `" (last known)"` to the label, the currency qualification *is* in the accessible name; the age is not.

**Options:** (a) accept the current behaviour — text-only, qualification in the label, age from the adjacent cell — and correct § 5 of the design system plus `UI_PLAN.md` § 3; (b) add an optional `describedById` prop to `StatusChip` and wire it to the freshness cell's id.

**Recommendation: (a).** In a table, a screen reader reads the row's cells in order, so the age arrives from the Last seen column immediately after the status. (b) adds an id-management burden across 500 rows to restate something already announced. This needs confirmation by actual assistive-technology testing (**T8**), not by reasoning — `PRINCIPLES.md` § 8 requires exactly that for critical workflows.

### D7. The fleet table row is a click target that is not keyboard operable

`docs/01_page-specs/02_FLEET.md` § 8 specifies *"Row click / Enter on focused row → detail route"*, and § 9 requires *"robot id is the primary cell name."*

`FleetPage.tsx` currently puts `onClick` on `TableRow` **and** a `<Link>` inside the first cell. The row is not focusable and has no key handler, so "Enter on focused row" does not work; only the link is reachable by keyboard. The row `onClick` also fires when the link is activated, so a click on the id navigates twice. `PRINCIPLES.md` § 8 makes keyboard operability a release requirement, and `jsx-a11y` does not catch this because the handler is on a MUI component it cannot resolve to an element.

**Options:** (a) link-only — drop the row `onClick`, make the id link fill its cell; (b) row-as-button — `tabIndex={0}`, `role="link"`, `onKeyDown` for Enter/Space on the row, and demote the id cell to plain text; (c) both, with the row handler ignoring events originating inside the link.

**Recommendation: (a).** It is the smallest correct thing, it satisfies § 9's "robot id is the primary cell name" for free, and it survives **X1** (virtualization) unchanged, whereas (b)'s roving focus does not. Amend § 8's "Enter on focused row" to "Enter on the focused robot id link", since that is a real behaviour change to the spec.

### D9. Stylelint forbids the class names every component spec requires

`.stylelintrc.json` sets `selector-class-pattern: "^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*(--[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*)?$"` — which permits a `--modifier` but **not** a `__element`. Verified: `.stat__value` is rejected.

Every component spec's "Required output" uses `__` elements: `.status__dot`, `.freshness__label`, `.freshness__asOf`, `.stat__value`, `.stat__label`, `.stat__hint`, `.empty-state__title`, `.empty-state__description`, `.empty-state__action`, `.connection-banner__message`. `lint:css` passes today only because none of those classes has ever been given a rule (**A2**).

**Options:** (a) extend the pattern to full BEM; (b) change every spec to hyphen-only names.

**Recommendation: (a).** The specs, the implementations and `docs/design-system.html` all use BEM already; (b) is a rename across eleven documents to satisfy a regex. Blocks **D4**.

### D10. `App.tsx` becomes a dev-only gallery route

*Decided.* The component gallery is kept, but it stops being the application.

Work implied:
- Move `src/App.tsx` to a dev-only surface — recommended `src/app/dev/ComponentGallery.tsx`, mounted at `/dev/ui` and excluded from the production bundle by an `import.meta.env.DEV` guard on the route.
- `src/main.tsx` renders the real shell (**T2**), not the gallery.
- Apply **B8** first — the gallery must consume `tokens.css`, not its own hex palette, or it stops being a truthful preview of the design system.
- Add an ESLint override for the gallery's path only if genuinely needed after B8; the expectation is that it needs none.
- The gallery lives under `src/app/**`, which may import anything, so it does not strain the dependency rule.
- Fix the missing `key` prop in the `FRESHNESS_STATES.map` at `src/App.tsx:327` while moving it.
- Give it a `ConnectionBanner` panel once **T3** exists, so the gallery covers all eight components rather than seven.

### D11. ADR directory name disagrees with every routing table `[repo]`

The ADR set itself is done — six ADRs, correctly numbered and named, in template order, with citations verified against canonical `PRINCIPLES.md`.

What remains is the path. `CLAUDE.md:62` and `AGENTS.md:53` both route "Architecture Decision Records" to `docs/adr/`. The directory is `docs/00_adr/`. An agent following either routing table finds nothing.

**Fix:** pick one and make both tables agree. `docs/00_adr/` matches the sibling `01_page-specs` / `02_component-specs` ordering convention, so changing the tables is the smaller edit.

### D12. Freshness derivation — RESOLVED 19 August 2026: server-side only

**Decision: ADR 3 as written — option (c).** Freshness is derived by the 500ms server sweep over `receivedAt`, travels as a field on the envelope, and is never computed in `packages/web`. Neither components nor `entities/robot` hold a freshness timer. The earlier recommendation here was (a), client-side derivation in `entities/robot`; it is overruled.

The objection recorded against (c) was correct as stated: a client with a dead socket receives no updates and therefore never degrades. It is answered by ADR 3's suppression rule rather than by a client timer. While the stream is down, per-robot freshness labels are suppressed and `ConnectionBanner` carries the connection-level state. A client timer would degrade every row to UNREACHABLE when the console's own socket died — attributing the console's blindness to the machines, and destroying the distinction between "this robot went silent" (three rows move, the rest do not) and "I cannot see any robot" (the banner). That distinction is the one an operator acts on, and it is why the derivation belongs where the robots are seen rather than where the page is rendered.

`PRINCIPLES.md`'s injected-clock requirement is satisfied: the pure state function — `receivedAt`, a clock reading, and the three thresholds in, one of four states out — lives in `packages/contracts` and is a framework-independent unit test against a controlled clock. Only the recurring interval that calls it lives in `packages/server`. The routing-table entry "freshness machine → `packages/contracts`" and ADR 3's "the sweep runs on the server" describe those two halves; both were made explicit rather than left to inference.

**Reconciled in the same change:** ADR 3 (`## Observed consequences`, and an Implications entry naming the two-package split); `docs/WIREFRAMES.md` § 0, § 6, § 8, § 9 step 5 (revision 3); `README.md` § 1, § 3 steps 4–6, § 6 § 4; `CLAUDE.md` routing table and freshness rules; `AGENTS.md`; `packages/web/CLAUDE.md` hard rules (two rules added); `docs/01_page-specs/02_FLEET.md` § 6 and § 11 (revision 4); `docs/01_page-specs/03_ROBOT_DETAIL.md` § 6 (revision 5); the `Freshness` doc comment in `entities/robot/model.ts`; the replacement note in `entities/robot/useFleetRobots.ts`. **T6** is rewritten accordingly.

`docs/02_component-specs/02_FRESHNESS_LABEL.md` needed no change: § 8 already carried the suppression rule and § 12 already pointed thresholds at ADR 3 and config.

**One consequence to carry forward.** The demo's kill-the-stream step no longer shows rows degrading. Step 4 (`--drop` against three robots, stream healthy) is unaffected and remains the step the documents call the submission; step 5 now demonstrates suppression instead. Anyone rehearsing the demo against the old narration will find it does not match.

### D13. Where the persona toggle's MUI override belongs

`src/shared/ui/personaToggle.tsx` carries a 12-line comment explaining that it overrides a global `MuiToggleButton` theme rule which gives `.Mui-selected` a filled accent background — a rule written for the tenant switch in `App.tsx`. A `shared/ui` primitive is compensating for a theme rule set by a demo component that **D10** is about to move.

`08_PERSONA_TOGGLE.md` § 6 states the requirement positively — *"Selected: subtle surface or gold text/border… No filled gold primary style"* — without reference to any override.

**Options:** (a) change the global `MuiToggleButton` default to the subtle treatment and let the tenant switch opt in to filled; (b) keep the local `sx` override and rewrite the comment once the gallery moves.

**Recommendation: (a).** The persona toggle is production UI; the tenant switch is a demo control. The default should serve the former. This also removes a `shared/ui` file's dependence on knowledge of a specific app-layer component, which is a boundary smell even though no import crosses.

### D14. Fleet summary counts the whole fleet while the docs are silent

`FleetPage.tsx` computes `selectFreshnessSummary(robots)` over the unfiltered fleet and carries a thoughtful comment defending it. `02_FLEET.md` § 2 requires the four counts be *"Mutually exclusive, totalling the fleet exactly"* — which is satisfied — but never says whether filters affect them, and § 3 lists the summary above the filters without comment. `WIREFRAMES.md` § 2 shows `44 / 4 / 2 / 0` against "of 50" with no filter applied, so it does not settle it either.

There is a visible inconsistency in the implementation regardless: only the Live stat receives `hint={`of ${robots.length}`}`. A reader sees "44 Live, of 50" then "4 Stale" with no denominator.

**Options:** (a) fleet-wide, as implemented — document it in § 2; (b) filtered, matching the table below it; (c) fleet-wide with a "filtered: N of M" line when a filter is active.

**Recommendation: (a), documented.** The comment's argument is sound and the wireframe's "of 50" hint reads as a fleet total. Add the sentence to `02_FLEET.md` § 2 so the next agent does not "fix" it. Separately, decide whether the hint belongs on all four stats or none.

### D15. Page-spec filenames are off by one from their titles `[repo]`

| File                 | Title inside          | Index (`00_PAGE_SPECS.md` § 2) |
| -------------------- | --------------------- | ------------------------------ |
| `01_APP_SHELL.md`    | `# 00 — App shell`    | § 00 App shell                 |
| `02_FLEET.md`        | `# 01 — Fleet`        | § 01 Fleet                     |
| `03_ROBOT_DETAIL.md` | `# 02 — Robot detail` | § 02 Robot detail              |

Component specs do not have this problem — `01_STATUS_CHIP.md` is titled `01 — StatusChip`. Cross-references say things like "component specs 01–07", which is unambiguous there and ambiguous here.

**Recommendation:** renumber the *titles* to match the filenames (App shell → 01), since the index and every cross-reference would otherwise need updating too, and `00_` is conventionally the index in both directories.

---

# Tier 2 — Alignment

Documented behaviour that the code does not implement, or vice versa. No decision required; these follow once Tier 0 and Tier 1 are settled.

### A1. `ConnectionBanner` does not exist

Specified in `docs/02_component-specs/07_CONNECTION_BANNER.md` (110 lines), required by `01_APP_SHELL.md` § 2 and § 3, listed in `00_PAGE_SPECS.md` § 4 (*"Connection integrity is visible in the shell when the stream is not healthy"*), in `UI_PLAN.md` § 2 and § 7 step 3, and in `WIREFRAMES.md` § 1, § 6 and the § 8 view inventory (marked **Required**). It is the eighth of the "eight components" every document counts.

There is no file. `App.tsx` demonstrates seven components and its own footer caption lists seven.

Its spec also conflicts with the wireframe (**A11**), so settle that before implementing.

### A2. `Stat` and `EmptyState` render completely unstyled

`src/styles/global.css` has rules for `.status*`, `.freshness*`, `.data-plate` and `.section-label` — and **nothing** for `.stat`, `.stat__value`, `.stat__label`, `.stat__hint`, `.stat--warning`, `.stat--critical`, `.empty-state`, `.empty-state__title`, `.empty-state__description`, `.empty-state__action`, or the `.empty-state__clear` button `FleetPage.tsx` renders.

Consequences: the `tone` prop on `Stat` has no visual effect at all, so `05_STAT.md` § 6's `--warning` / `--critical` mapping is unimplemented, and `FleetPage`'s `tone={summary.stale > 0 ? "warning" : "default"}` is a no-op. `EmptyState`'s `h2` inherits the global `h2` size, which is a page-section heading size, not the muted treatment `06_EMPTY_STATE.md` § 6 specifies.

Blocked on **D9**.

### A3. `utilities.css` references a token that no longer exists

`src/styles/utilities.css:18` — `.text-gold { color: var(--gold-text); }`. `tokens.css` defines `--accent-text`; `--gold-text` is from the pre-revision-2 palette. The declaration resolves to nothing.

Stylelint does not catch undefined custom properties. Consider adding a check, or at minimum grep for `--gold` across the repo — `DESIGN_SYSTEM.md` and the page specs still use the *word* "gold" in prose ("Gold is identity and primary action only") while the token is `--accent`, which is fine as prose but worth a glossary line.

### A4. `shared/ui` file naming and exports do not match `UI_PLAN.md`

`UI_PLAN.md` § 6 specifies PascalCase files plus a barrel; every component spec's "Implementation" line repeats the PascalCase path. Actual files are camelCase (`statusChip.tsx`, `freshnessLabel.tsx`, …) with **no `index.ts`**, so `FleetPage` imports five separate deep paths.

`UI_PLAN.md` revision 5 now records this drift explicitly rather than reading as though it were done, so the doc and the tree no longer contradict each other silently — but the rename has not happened.

The barrel is not cosmetic: `00_COMPONENT_SPECS.md` § 4 assumes `shared/ui` has a controlled public surface, and `eslint-plugin-boundaries` has an `entry-point` rule that can enforce it once **B11** is fixed.

Exports are also inconsistent — `statusChip`, `freshnessLabel` and `personaToggle` have both named and default exports; the other four are named-only. Pick named-only and apply it uniformly.

### A5. Missing doc comments on exported symbols

`CLAUDE.md` and `AGENTS.md` both require *"a one-sentence doc comment on every exported class, function, type, and React component."* Missing:

- `src/shared/ui/dataPlate.tsx` — `DataPlateProps`, `DataPlate`
- `src/shared/ui/sectionLabel.tsx` — `SectionLabelProps`, `SectionLabel`
- `src/shared/ui/statusChip.tsx` — `StatusChipSize`
- `src/shared/ui/freshnessLabel.tsx` — `FreshnessState`, `FreshnessLabelProps`
- `src/shared/ui/emptyState.tsx` — the doc comment sits on `EmptyStateProps` describing the component, then the component's own comment discusses an implementation choice; neither is a one-sentence statement of what the component is
- `src/entities/site/site.ts` — `selectSiteLabel`
- `src/features/fleet/FleetPage.tsx` — `Filters`, `matchesFilters` are internal, but the exported `FleetPage` default export is undocumented as a default

`shared/ui/stat.tsx` and `entities/robot/selectors.ts` are good examples of the intended style; imitate those.

### A6. `packages/web/README.md` is the unmodified Vite template

75 lines of "React + TypeScript + Vite… This template provides a minimal setup", including advice to adopt `recommendedTypeChecked` that `eslint.config.js` already exceeds (`strictTypeChecked`), and a suggestion to install `eslint-plugin-react-x` that no ADR covers.

`CLAUDE.md`'s routing table points at `README.md` for *"How to run, demo script, AI-usage note, measurements"*. None is present in either README.

### A8. No one-command local start `[repo]`

`CLAUDE.md`'s quality bar: *"One-command local start must continue to work."* The root `package.json` contains only a `devDependencies` block — **no `scripts` at all**. `pnpm dev` works inside `packages/web` and starts the console against a server that does not exist.

Add root scripts (`dev`, `lint`, `test`, `build`) that fan out across the workspace, and state the one command in the README.

### A9. `packages/web/CLAUDE.md` misstates the stack, the fixture path, and the enforcement

- "React 18 … MUI v5" — `package.json` pins `react ^19.2.8` and `@mui/material ^9.3.1`. Not pedantry: **B4** is a v9 breaking change the version claim would have predicted.
- "The fixture in `src/__boundary-violation__`" — it is at `src/features/fleet/__boundary-violation__`. The stated path would not even be classified as a feature.
- "Lint enforces this (build fails on violation)" — **false**, per **B11**. ADR 4 has been amended to say so; this file has not.
- `src/config` in the directory table — the directory exists but is empty (**D5**).
- "`pnpm lint` must pass pre-commit" — nothing enforces it (**A12**).

### A10. Component-spec implementation paths are wrong in the index

`docs/02_component-specs/00_COMPONENT_SPECS.md` § 2 lists eight implementation paths as `shared/ui/StatusChip.tsx` etc. Seven exist under different names (**A4**) and one does not exist at all (**A1**). Update after A4 lands so the table is checkable by `ls`.

### A11. `ConnectionBanner`'s spec and the wireframes disagree on its content

`07_CONNECTION_BANNER.md` § 3 props: `state`, `lastEventAt`, `onRetry`, `className`. § 5 message patterns: *"Reconnecting to stream"* + optional last event time.

`WIREFRAMES.md` § 1 and § 6 show: `⚠ Reconnecting to stream · attempt 2 · last event 09:41:02Z [Retry now]` — an **attempt counter** and a button labelled **"Retry now"**, with the annotation *"`Retry now` forces an immediate attempt and increments the visible attempt counter. A control that does nothing is the same lie this project argues against."*

`UI_PLAN.md` § 3 sides with the wireframe: it lists `attempt?: number` and comments that `onRetry` *"must force an immediate attempt and surface it."*

So two of three sources require an attempt counter the component spec has no prop for, and the button label differs ("Retry" vs "Retry now"). Reconcile before **A1** is implemented — this is a spec fix, not a decision, since the spec is simply behind.

### A12. `simple-git-hooks` is installed and does nothing

`packages/web/package.json:45` lists it as a devDependency; `pnpm-workspace.yaml` sets `allowBuilds: simple-git-hooks: false`, which prevents its install script from running; and no `simple-git-hooks` config block exists in any `package.json`. `packages/web/CLAUDE.md` § Commands nonetheless asserts *"`pnpm lint` must pass before any commit."*

Either configure the hook and allow its build, or remove the dependency and the claim. Given **A13**, CI is the more durable place for the gate.

### A13. No CI `[repo]`

No `.github/workflows`, no CI config of any kind. `PRINCIPLES.md` § 14 requires *"continuous-integration Test and protected-branch policy"*; § 15 requires custom lint rules be tested so *"a configuration regression cannot silently disable them"* — which is precisely what happened in **B11**, undetected.

A workflow running `lint`, `typecheck`, `test` and `build` would have caught every Tier 0 item.

### A15. Almost the whole repository is untracked in git `[repo]`

Only `00_TEMPLATE.md` is tracked under `docs/00_adr/`. Untracked as of this audit: all six ADRs, `REMEDIATION_LOG.md`, `docs/SUBMISSION_NOTES.md`, `docs/01_page-specs/`, `docs/02_component-specs/`, `TODO.md`, `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.editorconfig`, `.gitignore`, and the entire `packages/` tree.

A clone of the current branch contains almost none of this work.

The filename half of this item is resolved: `02_FEATURE_SLICE_STRUCT_WITH_ENFORCED_DEP.md`, which held ADR 2's transport decision, is now `02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md`.

**Care when staging.** `git add -A` on the `docs` branch pulls in a `packages/` tree that fails build, lint and test. Stage docs and code separately, or land the code explicitly as work in progress rather than behind a README that says the enforcement works (**A17**).

### A17. `README.md` § 7 asserts enforcement that ADR 4 now denies

Section 7 states that the dependency rule is enforced in lint and CI and that the enforcement is itself tested. ADR 4 was amended to `Partial` and now records the opposite, with probe evidence. The two documents contradict each other, and the README is the one an evaluator reads first.

This is the repository's strongest claim and the most cheaply falsified — `pnpm test` fails on the fixture that is supposed to prove it.

**Options:** (a) fix **B11** and leave the README as written; (b) soften § 7 to describe the rule as configured-but-not-yet-firing until B11 lands.

**Recommendation: (a).** The claim is worth making and the fix is bounded. If B11 will not land before the README is read, (b) is mandatory rather than optional — `PRINCIPLES.md` § "Architecture Decision Records" forbids claiming a control exists when it does not, and § 15 says not to claim all principles are enforced in the build.

### A18. `README.md` has three empty tables

The Scope status table (§ 5) and both measurement tables (§ 10 — throughput/latency, and contrast verification) are present with empty cells. They are honest as placeholders and dishonest as a deliverable.

Scope depends on what actually ships. Measurements depend on **T9**. Contrast depends on **T10**. None can be filled by editing the README alone.

# Tier 3 — Missing scaffold

Work the documents commit to that has no code at all. Ordered as a build sequence; this is the same order `UI_PLAN.md` § 7 proposes, with the corrections above folded in.

### T1. Fix enforcement first

**B11** → **B10**. Nothing below can claim to respect the dependency rule until the rule works. Add the positive-case test at the same time.

### T2. App shell

`docs/01_page-specs/01_APP_SHELL.md`, complete. Providers, router (**B2**), theme bridge, skip link to `#main`, sticky header, wordmark from config (**D5**), `ConnectionBanner` slot (**A1**), `<main id="main">` outlet, not-found route.

Verification items from § 9 that need real tests: banner hidden when connected; skip link is the first focusable control; no domain imports in `src/app` (needs **B11**); a grep for literal brand strings in `src/app` finding none; tenant switch changing wordmark, theme and one flag together.

### T3. `ConnectionBanner`

**A1**, after **A11** reconciles the spec with the wireframes.

### T4. Robot detail

`docs/01_page-specs/03_ROBOT_DETAIL.md`, complete. `src/features/robot/` currently contains only `index.ts` exporting the string `"placeholder"`, which exists solely as a target for the boundary fixture.

Needed: header identity block, `PersonaToggle` wiring, Section 01 Summary (core fields only), Section 02 capability panels (declared non-core capabilities only, no panel when absent, **no vendor conditionals**), technician-only Diagnostics and Raw payload sections, `DataPlate` footer, `EmptyState` for an unknown id.

Blocked on the capability model, which lives in `packages/contracts` (**T7**). Until then the capability set has to come from a fixture in `entities/robot`, mirroring `useFleetRobots`.

Keep the fixture honest about the demonstration `WIREFRAMES.md` § 3–4 depends on: Vendors A and B declare `dock` + `lidarHealth`; Vendor C declares `dock` + `waterLevel` and omits `lidarHealth`.

### T5. Transport client and the live store

`packages/web/CLAUDE.md` § State requires a normalised store keyed by robot id, deltas applied on a scheduled frame, and field-scoped subscriptions. `CLAUDE.md`'s routing table promises `shared/lib` contains the "transport client". `shared/lib` contains one file, `time.ts`.

`useFleetRobots.ts` documents the intended replacement precisely — `useSyncExternalStore` against a store keyed by robot id, with the `readonly Robot[]` signature unchanged. Follow it.

Also required by `PRINCIPLES.md` § 7: the complete user-visible state matrix for this surface — initial loading, background refresh, empty, partial, stale, offline, recoverable error, terminal error. `02_FLEET.md` § 10 covers four of those; the rest are undefined. And § 4 requires the error shape (code, explanation, what remains valid, next steps, correlation id) — no error type exists anywhere in the package.

### T6. Freshness machine `[repo]`

Per **D12**, resolved server-side, so this is not web-package work at all. Two halves in two packages:

- `packages/contracts` — the pure state function. `receivedAt`, a clock reading, and `liveThresholdMs` / `staleThresholdMs` in; LIVE | STALE | UNREACHABLE | UNKNOWN out. Framework-independent, unit-tested against an injected clock at the threshold boundaries (**T8**). Thresholds come from `config/freshness.json`, never hardcoded (ADR 3, Principle 13).
- `packages/server` — the 500ms interval that calls it over the current-state map, plus the late-tick detection ADR 3's Implications require on the health endpoint. A freshness-only change must be treated as a real change by ADR 2's fan-out coalescing, or the transition never reaches the client.

UNKNOWN needs the fleet manifest (`config/fleet-manifest.json`) to have a population on cold start; without it a never-seen robot does not exist rather than reading UNKNOWN.

`packages/web` gets no timer. What it needs instead is the suppression path: when the transport reports the stream down, per-robot `FreshnessLabel` rendering stops and `ConnectionBanner` carries the state (**T3**, **T5**).

This is what makes `WIREFRAMES.md` § 9 step 4 — the demo the document calls "the submission" — actually work.

### T7. Contracts, adapters, server, simulator `[repo]`

`packages/contracts`, `packages/adapters`, `packages/server`, `packages/simulator` are **empty directories**. No `package.json`, no `src`. `@fleet/contracts` is referenced by `eslint.config.js`'s shared-ui policy and by `UI_PLAN.md` § 1, and cannot resolve.

Out of scope for a web-package TODO to plan, but every one of them blocks something above, and ADR 6 § Status already notes *"the server package is still an empty directory as of this writing."*

### T8. Tests

Currently: one test, failing. `packages/web/CLAUDE.md` § Testing names three required kinds; `PRINCIPLES.md` § 11 adds more.

Missing:
- Selector tests for `selectStatusPresentation` (including the degraded-overrides-status branch), `selectBatteryDisplay`, `selectFreshnessSummary` (must total N for a fixture of N).
- Freshness state function with an injected clock, asserting boundary times. Lives with the function in `packages/contracts`, not here (**T6**, **D12**).
- Suppression: with the transport reporting disconnected, no per-robot `FreshnessLabel` renders and the banner does (**D12**, ADR 3).
- One end-to-end path in which a row visibly transitions to stale (`packages/web/CLAUDE.md` § Testing names this specifically; `WIREFRAMES.md` § 9 step 4 is the scenario).
- The boundary fixture, both halves (**B10**).
- Fleet filter tests: vendor filter with ≥2 vendors, site filter with ≥2 sites (`02_FLEET.md` § 11).
- Capability omission: a fixture robot without a capability produces no panel (`03_ROBOT_DETAIL.md` § 11).
- Capability/core separation: core fields never appear under Section 02 (same).
- Persona: technician shows diagnostics and raw payload, operator does not (same).
- `ConnectionBanner` renders `null` when connected (`07_CONNECTION_BANNER.md` § 11).
- Accessibility tests where status is rendered (`PRINCIPLES.md` § 6, § 8).

Explicitly forbidden by `packages/web/CLAUDE.md` § Testing: component snapshot tests. Do not add them.

### T9. Measurements

Committed to in at least four places: `CLAUDE.md`'s quality bar, `02_FLEET.md` § 11 ("Measurement harness at 50 and 500 robots"), `UI_PLAN.md` § 4, and ADR 2's Assumptions and Constraints.

`PRINCIPLES.md` § 12 requires explicit budgets. `packages/web/CLAUDE.md` requires the numbers in the README and says a change claiming a performance benefit without a measurement does not land.

The README tables now exist and are empty (**A18**). No harness, no numbers. ADR 2's Observed consequences is a dash awaiting the same measurement, and the virtualization deferral in `UI_PLAN.md` § 4 is gated on it.

### T10. Contrast verification

`DESIGN_SYSTEM.md` § 6 lists four specific checks and says *"Verify before Friday and record the result in the README."* `PRINCIPLES.md` § 8 makes WCAG 2.2 AA a release requirement, and § 9 requires visual-regression tests on status surfaces including forced-colors.

`--ink-muted` on `--surface` is called out by name as the one that must be re-checked, because the last-known treatment depends on it. Worth doing early: if it fails, `.status--last-known` (`global.css:208`) and three of the four freshness states change colour, and that ripples through `DESIGN_SYSTEM.md` § 2.5 and `02_FRESHNESS_LABEL.md` § 6.

---

# Tier 4 — Deliberate deferrals

Recorded so they are not mistaken for oversights. Each is already documented as a cut; the action is to keep saying so in the README's "not built" table, which now exists as § 9.

| Item                                    | Documented at                                                 | Note                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **X1.** Table virtualization            | `UI_PLAN.md` § 4                                              | Deferred behind the 500-robot measurement (**T9**). `CLAUDE.md`'s quality bar says "virtualize large lists" flatly, so if the measurement passes unvirtualized, amend the quality bar rather than leaving the two in conflict. `UI_PLAN.md` § 4 correctly notes virtualization inside a semantic MUI `Table` is not a drop-in — settle **D7** first, since (a) survives it and (b) does not. |
| **X2.** Map route                       | `00_PAGE_SPECS.md` § "Out of scope", `WIREFRAMES.md` § 7, § 8 | "First to cut." No contract until scheduled.                                                                                                                                                                                                                                                                                                                                                 |
| **X3.** Commands / dispatch             | `03_ROBOT_DETAIL.md` § 2, § 12; `UI_PLAN.md` § 8              | Requires a new ADR. Note that `PRINCIPLES.md` § 3 requires observed and requested state stay separate *even though no command surface exists*; `Robot` currently models observed state only, which is correct — do not add a `requested` field speculatively, but do not collapse them when commands arrive.                                                                                 |
| **X4.** Auth, settings, tenant admin UI | `00_PAGE_SPECS.md` § "Out of scope"                           | Config only. `PRINCIPLES.md` § 13: tenant config covers theming and feature availability, never authorisation — state that distinction in the README as `01_APP_SHELL.md` and `packages/web/CLAUDE.md` both require.                                                                                                                                                                         |
| **X5.** Persisted history / database    | `docs/00_adr/02_…md` (ADR 6)                                  | Decided against, with the revisit condition named. The README "not built" table is supposed to carry this entry with the ADR as its reference; it does not yet.                                                                                                                                                                                                                              |
| **X6.** Persona in the URL (`?view=`)   | `03_ROBOT_DETAIL.md` § 8                                      | Optional, post-MVP.                                                                                                                                                                                                                                                                                                                                                                          |
| **X7.** Discovery / commissioning       | `00_PAGE_SPECS.md` § "Out of scope"                           | Named cut in the project outline.                                                                                                                                                                                                                                                                                                                                                            |

---

# Suggested order

1. **B14** — one line, and it clears **B7** plus most of the remaining lint noise. Do it first for the signal.
2. **B12**, **B13** — make `typecheck` real and `strict` explicit, so everything below is measurable.
3. **B2**, **B4**, **B5**, **B6**, **B9** — get `tsc -b` to zero.
4. **B11** → **B10** — get the dependency rule firing and prove it both ways. Probe 3 is the gate; nothing else in this step matters until it flags.
5. **A17** — once B11 lands, § 7 of the README is true and needs no edit. If B11 will not land in time, soften § 7 instead. Do not leave it as-is.
6. **D9**, then **B8** + **D10** — unblock BEM in stylelint, kill the duplicate palette, move the gallery to a dev route.
7. **A13**, **A8**, **A15** — CI, one-command start, and get the tree actually committed, so nothing regresses past this point.
8. **D1**, **D11**, **D15**, **A9**, **A10**, **A11** — documentation-only reconciliations. Cheap, and they stop the next agent inheriting the same contradictions. **A9** and **D11** are the two an agent reads first.
9. ~~**D12**~~ resolved — server-side derivation, ADR 3 unchanged and the dependent documents reconciled. **D5** — decide tenant config, then amend ADR 5 to match.
10. **T2** → **T3** → **T5** → **T6** — the vertical path: shell, connection integrity, transport, freshness.
11. **D2**, **D3**, **D4**, **D6**, **D7**, **D13**, **D14**, **A2**–**A5** — the fleet surface, correct and styled.
12. **T4** — robot detail, with the capability contrast `WIREFRAMES.md` § 9 calls the point of the submission.
13. **T8**, **T9**, **T10**, **A6**, **A18** — tests, measurements, contrast, and the documents that record all three.

## Standing rule while working through this

`PRINCIPLES.md` § "Architecture Decision Records": *"The repository must never claim that an ADR describes reality when the implementation has diverged."*

Several items above exist because a document was written ahead of code and never reconciled when the code arrived — or arrived differently. When resolving any Tier 1 decision, update the document **in the same commit as the code**, which is what `00_PAGE_SPECS.md` § "Change protocol" and every component spec's § 12 already require. The alternative is a second audit.
