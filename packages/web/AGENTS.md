# AGENTS.md

Vite + MUI fleet ops console. Layers: app, feature, entity, shared, config.

Repo [`AGENTS.md`](../../AGENTS.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs bind. This file is web-only; it does not replace them.

## Responsibilities

- Render fleet list, robot detail, capability panels, connection state, and all async states from canonical data.
- Map canonical contracts → browser read model at the entity boundary. Never decode vendor dialects or reproduce server rules.
- Present server freshness; do not derive it or own a timer (ADR 3).
- Operator content primary; technician diagnostics behind persona toggle.
- Tenant branding, endpoints, flags from typed config.

Does **not**: normalize vendor input, derive freshness, authorize commands, own server state. Those live in adapters, contracts, server.

## Layers

```
app        → feature, entity, shared-ui, shared-lib, config
feature    → own feature, entity, shared-ui, shared-lib, config
entity     → own entity, shared-lib
shared-ui  → shared-ui
shared-lib → shared-lib
config     → config
```

- Features ↛ features. Entities ↛ entities.
- `shared/ui` = domain-free presentation. Robot/site/vendor/capability/freshness → entities.
- `entities` = mapping + selectors. No JSX/MUI.
- Components consume derived values. Domain calc → selectors.
- Prod: `@fleet/contracts` only. Never `@fleet/server` or `@fleet/adapters` (adapters in tests only, ADR 12).
- If it doesn’t fit a layer, stop. Don’t bypass lint.

## Freshness, state, capabilities

- Display envelope freshness. No clock, no fallback timer.
- Stream down → hide per-robot freshness; `ConnectionBanner` is connection truth (ADR 3, 23).
- Keep separate: remote resource, observed live, requested, workflow, local-view. Ack ≠ observed robot state (P11).
- Normalize observed state by robot id. No denormalized fleet copies.
- Never branch on vendor in entity/feature/shared. Render declared capabilities via exhaustive panel registry (ADR 1, 19).
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

- Enable React Compiler. Don’t sprinkle `memo` / `useMemo` / `useCallback`. Keep only for compiler-unsafe or effect-dep stability. `"use no memo"` rare.
- Keys: stable IDs, never index.
- No anonymous fns or object/array literals in props.
- Functions only. One job. Split >~150–200 lines or mixed concerns.
- Logic in hooks/selectors; UI stays dumb.

**State**

- Local first; lift only when needed.
- Server state ≠ client state. Fetch at entity/RSC-equivalent boundary or query layer — not `useEffect`.
- Context only for low-churn. Split state vs actions; never inline context value objects.

## UI, a11y, config

- Every async surface: loading, empty, partial/stale, offline, recoverable error, terminal error as applicable.
- WCAG 2.2 AA: semantic HTML, keyboard, accessible names, visible logical focus.
- MUI + existing tokens only. No second styling system; no raw visual literals except lint-permitted spots (ADR 5).
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
- Unit tests live in a `tests/` subdirectory beside the sources they cover; they inherit
  the layer of their parent directory. `__boundary-violation__` enforcement suites stay
  with their fixtures.
- Selectors as pure fns. Components by role, name, state.
- No snapshots. No module mocks for adapters unless test-only import (ADR 12).
- User-facing → running-browser check or documented equivalent.
- Lint-enforcement fixtures are inputs, not code to “fix”.

## Change rules

- One-sentence doc comment on every exported fn, type, and component. Lint rejects restating the signature (ADR 28).
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

| Task                                   | Start                                    | Then                                                                                  |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Status, ownership, layer policy        | `docs/03_package-specs/05_WEB.md`        | `packages/web/eslint.config.js` (imports)                                             |
| Entry, providers, routes               | `src/main.tsx`                           | `src/app/appRouter.tsx` or `appShell.tsx`; `docs/01_page-specs/01_APP_SHELL.md`       |
| Fleet page, filter, group, scale       | `src/features/fleet/fleetPage.tsx`       | `src/entities/{robot,site}/`; `docs/01_page-specs/02_FLEET.md`                        |
| Robot detail, persona, panels          | `src/features/robot/robotDetailPage.tsx` | `capabilityPanels.tsx`, `panelVisibility.ts`; `docs/01_page-specs/03_ROBOT_DETAIL.md` |
| Map, site facet, markers               | `src/features/map/mapPage.tsx`           | `src/entities/robot/selectors.ts`; `docs/01_page-specs/04_MAP.md`; ADR 35             |
| Envelope → browser model               | `src/entities/robot/fromEnvelope.ts`     | `model.ts`, `selectors.ts`; `packages/contracts/src/index.ts`                         |
| Fleet/robot resource state             | `src/entities/robot/useFleetRobots.ts`   | `useRobotDetail.ts`; feature consumer                                                 |
| Connection / transport util            | `src/shared/lib/connectionContext.ts`    | ADR 23; domain interpretation stays in entities                                       |
| Presentational primitive               | matching `docs/02_component-specs/`      | same-named module in `src/shared/ui/`                                                 |
| Tenant, theme, flags, endpoints, proxy | `src/config/tenant.ts`                   | `tenantTheme.ts`, `tenantSelection.ts`, `devServerTarget.ts`, or `vite.config.ts`     |
| Tokens / global style                  | `docs/DESIGN_SYSTEM.md`                  | `src/styles/`, `src/app/theme.ts`                                                     |
| Boundary / a11y / style lint           | `eslint.config.js`                       | `src/**/__boundary-violation__/` or `.stylelintrc.json`                               |
| Bundle / prod build                    | `vite.config.ts`                         | `scripts/checkBundleBudget.mjs`; ADR 22                                               |
