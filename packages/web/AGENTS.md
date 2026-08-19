# AGENTS.md

This package is the React fleet operations console: a Vite application using Material UI
and repository design tokens, organized into app, feature, entity, shared, and config
layers.

The repository-level [`AGENTS.md`](../../AGENTS.md), [`PRINCIPLES.md`](../../PRINCIPLES.md),
and accepted ADRs remain binding. This file adds web-specific instructions; it does not
replace them.

## Package responsibilities

- Render the fleet list, robot detail, capability-driven panels, connection state, and
  complete asynchronous states from canonical data.
- Map canonical contracts into a browser read model at the entity boundary; never decode
  vendor dialects or reproduce server rules.
- Present freshness received from the server without deriving it or owning a freshness
  timer (ADR 3).
- Keep operator content primary and technician diagnostics behind the explicit persona
  toggle.
- Source tenant branding, endpoints, and feature availability from typed configuration.

This package does not normalize vendor input, derive freshness, authorize commands, or own
server state. Those responsibilities belong to adapters, contracts, and server.

## Dependency and placement rules

The enforced downward dependency graph is:

```text
app       → feature, entity, shared-ui, shared-lib, config
feature   → its own feature, entity, shared-ui, shared-lib, config
entity    → its own entity, shared-lib
shared-ui → shared-ui
shared-lib→ shared-lib
config    → config
```

- Features never import other features; entities never import other entities.
- `shared/ui` is domain-free presentation. Robot, site, vendor, capability, and freshness
  rules belong in entities.
- `entities` contains domain mapping and selectors, not JSX or Material UI.
- Components compose already-derived values; inline domain calculations move to selectors.
- Production code may import `@fleet/contracts`, never `@fleet/server` or
  `@fleet/adapters`. The adapters dependency is allowed in tests only (ADR 12).
- If code does not fit a layer, stop and resolve ownership instead of bypassing lint.

## Freshness, state, and capabilities

- Never derive freshness in web. Display the envelope field; hold no clock or fallback
  timer.
- While the stream is down, suppress per-robot freshness labels and let
  `ConnectionBanner` carry the connection-level truth (ADR 3, ADR 23).
- Keep remote resource, observed live, requested, workflow, and local-view state separate.
  An acknowledgement is not observed robot state (Principle 11).
- Normalize observed state by robot id; do not maintain denormalized fleet copies.
- Never branch on vendor in entities, features, or shared code. Render declared operator
  capabilities through the exhaustive panel registry (ADR 1, ADR 19).
- A missing capability means no panel, not a disabled placeholder.

## UI, accessibility, and configuration

- Every asynchronous surface covers loading, empty, partial/stale, offline, recoverable
  error, and terminal error states as applicable.
- Target WCAG 2.2 AA with semantic HTML, keyboard operation, accessible names, and visible
  logical focus.
- Use Material UI and existing tokens only. Do not introduce another styling system or raw
  visual literals outside the locations lint permits (ADR 5).
- Tenant identity, theme, flags, and endpoints travel together through typed config. Never
  branch on tenant identity in a component (ADR 17, ADR 21).
- UI may hide or disable actions for clarity; it never authorizes them.

## Performance

- Keep subscriptions field-scoped and apply streamed deltas on scheduled frames.
- Decimate history before rendering charts and measure before optimizing.
- The fleet table deliberately renders all rows and is tested at 500 robots. Do not add
  windowing until ADR 24's live delta-churn measurement triggers reconsideration.
- Changes affecting first-load code must remain within ADR 22's bundle budget.

## Tests

- Prefer a focused failing test before changing behavior.
- Test selectors as pure functions and components by accessible role, name, and state.
- Do not add snapshot tests; assert the behavior that matters.
- User-facing changes require a running-browser check or the documented equivalent.
- Keep lint-enforcement fixtures intact. They are test inputs, not code to repair.

## Change rules

- Add one-sentence doc comments to every exported function, type, and React component. Lint rejects a comment that only restates its signature, so the sentence has to earn its place (ADR 28).
- Document non-trivial cross-file and cross-package coupling on both sides.
- Do not add dependencies without the decision work required by repository policy.
- Keep diffs focused; do not combine behavior changes with unrelated restructuring.
- Stop and surface conflicts with a principle or ADR instead of silently diverging.

## Verification

Run the narrowest focused test first, then before handoff:

```bash
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web build
```

Run `pnpm check:architecture-docs` after changing a package spec, decision-linked
mechanical rule, audit, TODO, or decision mapping.

## Task routing

Read one matching row, then its narrow follow-up; do not preload all web source, page
specs, component specs, or ADRs.

| Task                                          | Start here                               | Then narrow to                                                                        |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Package status, ownership, or layer policy    | `docs/03_package-specs/05_WEB.md`        | `packages/web/eslint.config.js` only for enforced imports                             |
| Application entry, providers, or routes       | `src/main.tsx`                           | `src/app/appRouter.tsx` or `appShell.tsx`; `docs/01_page-specs/01_APP_SHELL.md`       |
| Fleet page, filtering, grouping, or scale     | `src/features/fleet/fleetPage.tsx`       | `src/entities/{robot,site}/`; `docs/01_page-specs/02_FLEET.md`                        |
| Robot detail, persona, or capability panels   | `src/features/robot/robotDetailPage.tsx` | `capabilityPanels.tsx`, `panelVisibility.ts`; `docs/01_page-specs/03_ROBOT_DETAIL.md` |
| Canonical envelope to browser read model      | `src/entities/robot/fromEnvelope.ts`     | `model.ts`, `selectors.ts`; `packages/contracts/src/index.ts`                         |
| Fleet or robot resource state                 | `src/entities/robot/useFleetRobots.ts`   | `useRobotDetail.ts`; relevant feature consumer                                        |
| Connection state or future transport utility  | `src/shared/lib/connectionContext.ts`    | ADR 23; keep domain interpretation in entities                                        |
| Presentational primitive                      | Matching `docs/02_component-specs/` file | Same-named module in `src/shared/ui/`                                                 |
| Tenant, theme, flags, endpoints, or dev proxy | `src/config/tenant.ts`                   | `tenantTheme.ts`, `tenantSelection.ts`, `devServerTarget.ts`, or `vite.config.ts`     |
| Tokens or global styling                      | `docs/DESIGN_SYSTEM.md`                  | `src/styles/` and `src/app/theme.ts`                                                  |
| Boundary, accessibility, or style enforcement | `eslint.config.js`                       | `src/**/__boundary-violation__/` or `.stylelintrc.json`                               |
| Bundle size or production build               | `vite.config.ts`                         | `scripts/checkBundleBudget.mjs`; ADR 22                                               |
