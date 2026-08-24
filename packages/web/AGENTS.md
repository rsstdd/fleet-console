# AGENTS.md

Vite + MUI fleet ops console. Layers: app, features, components, hooks, stores, context, lib, utils, types, config.

Repo [`AGENTS.md`](../../AGENTS.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs bind. This file is web-only; it does not replace them.

## Responsibilities

- Render fleet list, robot detail, capability panels, connection state, and all async states from canonical data.
- Map canonical contracts → browser read model at the data boundary (`utils/fromEnvelope`). Never decode vendor dialects or reproduce server rules.
- Present server freshness; do not derive it or own a timer (ADR 3).
- Operator content primary; technician diagnostics behind persona toggle.
- Tenant branding, endpoints, flags from typed config.

Does **not**: normalize vendor input, derive freshness, authorize commands, own server state. Those live in adapters, contracts, server.

## Layers

```
app        → feature, hooks, stores, types, components, lib, context, utils, config
feature    → own feature, hooks, stores, types, components, lib, context, utils, config
hooks      → hooks, stores, types, lib, utils
stores     → stores, types, utils
types      → types
components → components
lib        → lib, context
context    → context, config
utils      → utils
config     → config
```

- Features ↛ features.
- `components` = domain-free presentation. Robot/site/vendor/capability/freshness → the data layers.
- `hooks`/`stores`/`utils`/`types` = the data layers: resource hooks, the fleet store, mapping + selectors, read-model types. No JSX/MUI.
- Components consume derived values. Domain calc → selectors.
- Prod: `@fleet/contracts` only. Never `@fleet/server` or `@fleet/adapters` (adapters in tests only, ADR 12).
- If it doesn’t fit a layer, stop. Don’t bypass lint.

## Freshness, state, capabilities

- Display envelope freshness. No clock, no fallback timer.
- Stream down → hide per-robot freshness; `ConnectionBanner` is connection truth (ADR 3, 23).
- Keep separate: remote resource, observed live, requested, workflow, local-view. Ack ≠ observed robot state (P11).
- Normalize observed state by robot id. No denormalized fleet copies.
- Never branch on vendor in any layer. Render declared capabilities via exhaustive panel registry (ADR 1, 19).
- Missing capability → no panel, not a disabled placeholder.

## React (Rules of React)

StrictMode + react-hooks + React Compiler lints. Violations = bugs.

**Purity**

- Same props/state/context → same output.
- No side effects in render (fetch, subscribe, mutate, I/O, `Date.now`, `Math.random`).
- Never mutate props, state, hook args, or values after they enter JSX.
- Components via JSX only. Never pass hooks as values.

**Hooks**

- Top-level only. Never in loops, conditions, nested fns, handlers, try/catch, after early return.
- Only from function components or custom hooks.
- `useEffect` = last resort (sockets, 3p, DOM, storage). Not for fetch, derived state, or events.
- Derive in render. Don’t store derived data in state.
- `useRef` = mutable, no re-render. `useReducer` = complex related local state.
- Prefer `use()`, `useOptimistic`, `useActionState`, `useTransition`, `useDeferredValue`.

**Compiler / JSX**

- React Compiler: required, but **not enabled — gated on open decision D27** (`docs/decisions.json`: dependency spike, then ADR 22 bundle and ADR 24 scale evidence; maintainer decides). Do not enable it, or remove the manual memoization on the measured fleet surfaces, outside that decision. Otherwise don’t sprinkle `memo` / `useMemo` / `useCallback` — keep only for compiler-unsafe or effect-dep stability. `"use no memo"` rare.
- Keys: stable IDs, never index.
- No anonymous fns or object/array literals in props.
- Functions only. One job. Split >~150–200 lines or mixed concerns.
- Logic in hooks/selectors; UI stays dumb.

**State**

- Local first; lift only when needed.
- Server state ≠ client state. Fetch at the hooks boundary or query layer — not `useEffect`.
- Context only for low-churn. Split state vs actions; never inline context value objects.
- Destructure `useState` as `[value, setValue]` with an exact setter name whenever the
  value may transition. An identity-critical resource created lazily for the lifetime of
  one mount may destructure `[value]` alone: exposing an unused setter would falsely imply
  that replacing the resource is supported.

## UI, a11y, config

- Every async surface: loading, empty, partial/stale, offline, recoverable error, terminal error as applicable.
- WCAG 2.2 AA: semantic HTML, keyboard, accessible names, visible logical focus.
- MUI + existing tokens only. `styles/tokens.ts` authors repeated colour and size decisions and generates `tokens.css`; lint rejects raw hex and `px`/`rem` literals plus numeric width/height-family values elsewhere (ADR 5).
- Tenant identity, theme, flags, endpoints travel together via typed config. Never branch on tenant in a component (ADR 17, 21).
- UI may hide/disable actions; it never authorizes them.
- No `dangerouslySetInnerHTML`. No secrets in client env. No sensitive data in localStorage.

## Performance

- Field-scoped subscriptions; apply streamed deltas on scheduled frames.
- Decimate history before charts. Measure before optimizing.
- Fleet table renders all rows; tested at 500 robots. No windowing until ADR 24 live delta-churn says so.
- First-load changes stay within ADR 22 bundle budget.

## Tests

- Focused failing test before behavior change.
- Unit tests are colocated beside their sources (`foo.test.tsx` next to `foo.tsx`) and
  inherit the layer of the directory they sit in (ADR 36). `src/test/` holds setup
  infrastructure only; `__boundary-violation__` enforcement suites stay with their
  fixtures.
- Selectors as pure fns. Components by role, name, state.
- No snapshots. No module mocks for adapters unless test-only import (ADR 12).
- User-facing → running-browser check or documented equivalent.
- Lint-enforcement fixtures are inputs, not code to “fix”.

## Comments

Comment policy for this package lives here and nowhere else; `CLAUDE.md` routes to it
rather than restating it.

- Default to no comment. If naming or structure can carry the idea, change those first.
- A comment explains rationale, constraint, edge case, ownership, or a historical
  failure. It never explains the next statement.
- Export docs are mandatory on this package's public surface (ADR 37): one informative
  sentence on every function, type, and component that another layer imports — `features`
  reaching into `components`/`hooks`/`utils`/`types`/`lib`/`config`/`stores`/`context`, or
  anything the app shell composes. A self-documenting declaration is not an exemption —
  make the summary explain the contract, the constraint, the edge case, or the reason.
- Inside a module or feature slice, document an export only where the sentence carries a
  contract, constraint, edge case, ownership fact, or historical failure. Absence is not a
  review finding there; a restated comment is one everywhere (ADR 28).
- Add `@param` / `@returns` only where the contract is complex or ambiguous: outcome
  unions with different retry semantics, identity guarantees a caller depends on,
  injected ports, units, ranges, ordering requirements. Never to raise tag coverage on
  a simple selector, a trivial component, or an obvious prop.
- Member JSDoc on props and interface fields only where nullability, units, range,
  ownership, or behaviour is ambiguous.
- Every `useEffect` comment names the external system being synchronized and why the
  dependencies and the cleanup are correct.
- Name and justify every timeout, threshold, non-obvious dimension, and complex regex.
  Where there is no defensible provenance, say so and name the operational constraint
  the value represents — an unresolved choice recorded as one beats an invented
  derivation (ADR 22).
- Cite the owning spec and section. Do not copy a spec's revision number into code:
  it is mutable metadata that goes stale silently. Keep one only where the comment is
  explaining historical provenance.
- JSX comments are for complex structure, non-obvious conditional triggers, and
  intentional accessibility behaviour — never for naming the markup below them.
- Tests describe WHAT in the test name and the `test.step` name. A comment there says
  why this evidence prevents a realistic regression.
- Never retain commented-out code.
- Update or delete nearby comments in the same change. After renaming an identifier or
  a file, search the comments for the old spelling.
- A suppression comment states why the rule cannot apply here and what keeps the
  exception safe.
- Debt syntax, exactly: `TODO(user): action` or `FIXME: immediate bug to address`.
  References to `TODO.md` / `FIXME.md` are cross-references, not debt markers.
- No blanket `jsdoc/require-param` or `jsdoc/require-returns`: complexity is semantic,
  and mechanical enforcement buys low-value comments. Any new mechanical comment rule
  needs an ADR and a `docs/decisions.json` `mechanicalRules` registration.
- Lint-enforcement fixtures keep the comments explaining why they must not be repaired
  or collected; do not change them in a way that alters what the rule reports.

## Change rules

- Comments follow **Comments** above; lint rejects a doc that restates its signature (ADR 28).
- Document non-trivial cross-file / cross-package coupling on both sides.
- No new deps without repo decision work.
- Focused diffs. Don’t mix behavior with unrelated restructure.
- Conflict with a principle/ADR → surface it; don’t silently diverge.

## Verification

Narrowest test first, then:

```bash
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

After package spec / decision-linked rule / audit / TODO / decision mapping: `pnpm check:architecture-docs`.

## Task routing

Read one matching row, then its narrow follow-up. Do not preload all web source, page specs, component specs, or ADRs.

| Task                                   | Start                                    | Then                                                                                    |
| -------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Status, ownership, layer policy        | `docs/03_package-specs/05_WEB.md`        | `packages/web/eslint.config.js` (imports)                                               |
| Entry, providers, routes               | `src/main.tsx`                           | `src/app/appRouter.tsx` or `appShell.tsx`; `docs/01_page-specs/01_APP_SHELL.md`         |
| Fleet page, filter, group, scale       | `src/features/fleet/fleetPage.tsx`       | `src/hooks/`, `src/utils/robotSelectors.ts`; `docs/01_page-specs/02_FLEET.md`           |
| Robot detail, persona, panels          | `src/features/robot/robotDetailPage.tsx` | `capabilityPanels.tsx`, `panelVisibility.ts`; `docs/01_page-specs/03_ROBOT_DETAIL.md`   |
| Map, site facet, markers               | `src/features/map/mapPage.tsx`           | `src/utils/robotSelectors.ts`; `docs/01_page-specs/04_MAP.md`; ADR 35                   |
| Envelope → browser model               | `src/utils/fromEnvelope.ts`              | `types/robot.ts`, `utils/robotSelectors.ts`; `packages/contracts/src/index.ts`          |
| Fleet/robot resource state             | `src/hooks/useFleetRobots.ts`            | `useRobotDetail.ts`; feature consumer                                                   |
| Connection / transport util            | `src/context/connectionContext.ts`       | ADR 23; domain interpretation stays in the data layers                                  |
| Presentational primitive               | matching `docs/02_component-specs/`      | same-named module in `src/components/`                                                  |
| Tenant, theme, flags, endpoints, proxy | `src/config/tenant.ts`                   | `tenantTheme.ts`, `tenantSelection.ts`, `devServerTarget.ts`, or `vite.config.ts`       |
| Tokens / global style                  | `docs/DESIGN_SYSTEM.md`                  | `src/styles/tokens.ts`, generated CSS, `src/styles/global.css`, then `src/app/theme.ts` |
| Boundary / a11y / style lint           | `eslint.config.js`                       | `src/**/__boundary-violation__/` or `.stylelintrc.json`                                 |
| Bundle / prod build                    | `vite.config.ts`                         | `scripts/checkBundleBudget.mjs`; ADR 22                                                 |
