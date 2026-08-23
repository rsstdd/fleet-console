# Web React Quality Audit and Refactor

**Authority:** Planning only.
**Status:** Active
**Updated:** 2026-08-21

## Outcome

`packages/web` conforms to the Rules-of-React refactoring checklist (purity, hooks
discipline, derived-not-stored state, memoization policy, structural size, prop-ref
stability, complete async states, layer imports) with **zero behavior change**, evidenced
by `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build` staying
green and the e2e smoke and scale suites passing unchanged.

## Audit result (2026-08-21)

Findings are ordered by the checklist. Anything not listed was audited and found
conforming; conforming areas are named below so this plan does not invite churn.

### Already conforming — do not touch

- **Purity / Rules of Hooks**: no render-phase side effects anywhere in product code.
  `Date.now` / `Math.random` appear only in `robotDetailFixtures.ts` (test/gallery data),
  `fleetTransport.ts` (non-render transport code, injectable), and the dev-only gallery.
  StrictMode is on (`src/main.tsx`); `eslint-plugin-react-hooks` v7 recommended rules run
  in lint. All hooks are top-level, from components or custom hooks.
- **Fetch boundary**: `useEffect`-driven fetching exists only inside the entity resource
  hooks (`useRobotDetail.ts`, `useRobotHistory.ts`) — the sanctioned query boundary in a
  package with no query library. Features never fetch. Migrating these to `use()` +
  Suspense would change loading/retained-data semantics (behavior), so it is out of scope.
- **Derived state**: computed in render throughout. `mapPage.tsx`'s render-phase
  `setState` for site extents is the documented ADR 35 monotonic-extents pattern, not a
  violation. `useRobotDetail`'s `loading` is derived from `{forId, value}`, not stored.
- **Async states**: complete exhaustive unions (`FleetResourceState`, `RobotDetailState`,
  `RobotHistoryState`) with `switch-exhaustiveness-check` enforced; no invented loading
  layers over connection truth.
- **Keys**: stable ids everywhere; no index keys in the package.
- **Layer imports**: mechanically enforced by `eslint-plugin-boundaries` with
  `checkUnknownLocals` on; no violations found. No vendor branches; capability panels go
  through the exhaustive registry. No freshness derivation or timers.
- **Context**: low-churn only; `appRouter.tsx` memoizes the `StreamDiagnosticsContext`
  value (keep — context-value stability is a sanctioned `useMemo` use).
- **`useFleetRobots.ts` `useCallback`s**: keep — they stabilize `useSyncExternalStore`
  read functions (effect-dep/subscription stability, the sanctioned category).

### F1 — Identity-critical resources held in `useMemo` (highest priority)

`src/app/useFleetTransport.ts:103` holds the fleet store and `:109` the transport (which
owns the console's one socket) in `useMemo`. React does not guarantee `useMemo` cache
retention; a discarded cache silently recreates the store (losing all fleet state) and
rebuilds the transport (dropping the open socket and restarting the join sequence) — the
exact failure the in-code comment forbids. The guaranteed-identity idiom is a lazy
`useState` initializer. The fix also retires the
`eslint-disable-next-line react-hooks/exhaustive-deps` escape at `:160`, and should
stabilize the returned `retry` closure (currently a fresh function per render).

### F2 — React Compiler is mandated but not installed (conflict to surface, not work around)

`packages/web/AGENTS.md` says "Enable React Compiler", and the refactoring checklist
assumes it is on ("remove redundant `React.memo` / `useMemo` / `useCallback`"). In fact
`babel-plugin-react-compiler` is not a dependency and `vite.config.ts` passes no babel
config to `@vitejs/plugin-react` — only the compiler-_lint_ rules run. Enabling it is a
new dependency ("no new deps without repo decision work") and touches two measured gates:
the ADR 22 bundle budget and the ADR 24 fleet-table scale evidence.

**Recommendation** (a plan cannot ratify): register a D-id — "Enable the React Compiler
build transform in `packages/web`" — and decide it with bundle-size and scale-run
evidence. **Registered as open stub D27 (2026-08-21)** in `docs/decisions.json`. **Checklist item 4 (remove redundant memoization) is gated on that decision**:
without the compiler, the `useMemo`s in `fleetPage.tsx:133–147` and
`robotDetailPage.tsx:475` are load-bearing on a surface measured at 500 robots × 10 Hz,
and removing them now would be a perf behavior change on a gated surface. Until decided,
the manual memoization stays.

### F3 — `FleetPage` exceeds the one-job/size rule

`src/features/fleet/fleetPage.tsx:120–497` is one ~380-line component mixing the summary
strip, the filter bar, the table, and four resource banners. Decompose **within the same
file** (no new module, no layer change, no export surface change) into `FleetSummary`,
`FleetFilters`, and `FleetTable` components consuming already-derived props. Existing
role/name-based tests must pass unchanged — that is the behavior-preservation evidence.
`robotDetailPage.tsx` is 552 lines but already decomposed into one-job components; leave
it alone.

### F4 — Duplicated resource-banner JSX between fleet and map pages (defer)

`fleetPage.tsx:177–245` and `mapPage.tsx:99–156` duplicate the terminal-error,
recoverable-error, loading, and refreshing blocks (~70 lines each). Features may not
import features; the only legal shared home is `shared/ui`, which is banned from
`@fleet/contracts` types, so issues would need pre-formatting to presentational strings,
and a new `shared/ui` primitive requires a component spec under `docs/02_component-specs/`.
Two call sites do not earn that machinery. **Defer** until a third fleet-resource surface
appears; keep the duplication deliberate and documented (this plan is the record).

### F5 — Prop-ref stability on the hot row path

- `fleetPage.tsx:341`: anonymous `onChange` on the search `TextField`, inconsistent with
  the named handlers beside it — name it `handleSearchChange`.
- `fleetPage.tsx:415` and `src/features/map/robotList.tsx:40`: inline `style` object
  literals on per-row `Link`s — a fresh object per row per render on the 500-row × 10 Hz
  measured path. Hoist to module constants.

### F6 — Duplicated domain predicates inline in map feature

`mapPage.tsx:65–66` filters `siteRobots` / `unpositioned` inline, and `robotList.tsx:25`
re-implements the "positioned" predicate — the same domain calc now lives in two feature
files while `entities/robot/selectors.ts` owns its siblings
(`selectPlottableRobots`, `selectPositionedSummary`). Add `selectSiteRobots` and
`selectUnpositionedRobots` selectors (pure, unit-tested first) and consume them from the
feature, restoring one authoritative implementation (Principle 1).

### Out-of-scope note — dev gallery

`src/app/dev/componentGallery.tsx` (592 lines, module-level `new Date()` at `:33`) is a
DEV-only route tree-shaken from production. The ruleset targets product surfaces; the
gallery is excluded from this plan's scope.

## Scope

### In scope

- F1 transport/store identity fix in `src/app/useFleetTransport.ts`.
- F5 prop-ref stability fixes in `fleetPage.tsx` and `robotList.tsx`.
- F6 selector extraction into `entities/robot/selectors.ts` plus feature consumption.
- F3 in-file decomposition of `FleetPage`.
- F2 surfaced as a recommended decision (registration only if the maintainer agrees).

### Out of scope

- Removing manual memoization (gated on the F2 decision).
- F4 shared banner primitive (deferred until a third consumer exists).
- Any change to entity mapping, transport policy, freshness handling, async state
  vocabulary, or the dev gallery.
- Migrating entity fetch hooks to `use()`/Suspense (behavior change).

## Authorities and dependencies

- `PRINCIPLES.md` 1, 4, 5, 6, 9, 11, 12; `packages/web/AGENTS.md` (React, layers, tests);
  ADR 3 (freshness), ADR 22 (bundle), ADR 23 (connection context), ADR 24 (scale),
  ADR 35 (map selectors); page specs 02 and 04.
- Slices are independent except that memo removal depends on the F2 decision.
- Each slice stays within the ~300-modified-line PR cap; F3 is the largest and ships
  alone.

## Execution

1. **F1**: add a focused test to `src/app/useFleetTransport.test.ts` asserting store and
   transport identity across re-renders, then swap `useMemo` → lazy `useState`
   initializers, stabilize `retry`, delete the `exhaustive-deps` disable.
2. **F5 + F6**: write selector unit tests in `selectors.test.ts` first; add the two
   selectors; consume them in `mapPage.tsx` / `robotList.tsx`; hoist the link style
   constants; name the search handler.
3. **F3**: decompose `FleetPage` in place; existing `fleetPage.test.tsx` and
   `fleetScale.test.tsx` pass unchanged; run `pnpm test:e2e:scale` (ADR 24 surface
   touched).
4. **F2**: present the decision recommendation; if accepted, follow the decision
   algorithm in `docs/DOCUMENT_LIFECYCLES.md` (D-id, ADR, evidence), then execute the
   memo-removal sweep as its own slice.

## Acceptance criteria

- [x] Store/transport identity is guaranteed by construction (F1) with a test.
      Merged via PR #23.
- [x] No inline object/function literals on the fleet-row or map-row render paths (F5).
      Merged via PR #24. 2026-08-23: found reintroduced on both row links (origin
      unclear from history); re-hoisted to module constants during the ADR 36 final
      audit, with the rationale now commented at each constant so the next
      reintroduction is visible in review.
- [x] Site/positioned filtering has one authoritative implementation in selectors (F6).
      Merged via PR #24. 2026-08-23: found reintroduced inline in `mapPage.tsx` (the
      selectors survived, tested but unconsumed); re-wired during the ADR 36 final
      audit — same reintroduction event as the F5 note above.
- [x] No component in the fleet feature exceeds ~200 lines or mixes concerns (F3).
      Merged via PRs #25/#26 (FleetSummary 27 / FleetFilters 87 / FleetTable 122 /
      FleetPage 185 lines). 2026-08-23: ADR 36 extended F3's in-file decomposition to
      one-component-per-file (`fleetSummary.tsx` / `fleetFilters.tsx` / `fleetTable.tsx`);
      the components themselves are unchanged.
- [x] The F2 compiler conflict is recorded as a decision recommendation, not silently
      worked around; memoization untouched until it is decided. Open stub D27.
- [x] `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build` green
      after every slice; `pnpm test:e2e` after F3 (user-facing surface), plus
      `pnpm test:e2e:scale` (120/120 frames applied at 9.76 Hz, delta→paint p95 50.9 ms).
- [ ] Unverified items recorded here honestly at completion. Known so far: the e2e
      webkit project cannot launch on the development WSL host (missing system
      libraries); smoke evidence covers chromium and firefox only.

## Documentation synchronization

- This plan (status/date on every scope or evidence change).
- If F2 is accepted: `docs/decisions.json`, the new ADR, regenerated pending index.
- New selector exports get one-sentence doc comments (ADR 28); no spec changes required —
  no public API or route behavior moves.

## Verification

- `pnpm --filter web test`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm test:e2e` and `pnpm test:e2e:scale` after F3
- `pnpm check:architecture-docs` after this plan file and any F2 decision work

## Completion

Archive under `docs/04_archive/` once F1, F3, F5, F6 are merged and F2 is either decided
(with its own ADR as replacement evidence) or explicitly declined; name the merged
commits and the ADR as the replacement evidence.
