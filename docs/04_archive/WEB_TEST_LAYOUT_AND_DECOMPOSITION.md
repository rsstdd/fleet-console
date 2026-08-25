# Web test layout, page decomposition, and fetch-hook dedupe

**Authority:** Historical only. The current implementation, specifications, and ADR 36 govern.
**Status:** Done
**Archived:** 2026-08-25
**Superseded by:** the implementation merged through PRs #31–#37, including commit `6bb879c`;
[ADR 36](../00_adr/36_CONVENTIONAL_REACT_FOLDER_VOCABULARY_IN_WEB.md) and PR #38
(`394d6c8`) subsequently replaced its test-directory convention with colocated tests.

## Outcome

`packages/web` has one test-placement convention (a `tests/` subdirectory beside the
sources it covers, in every source directory), no source file whose size hides mixed
concerns (`robotDetailPage.tsx`, `componentGallery.tsx` decomposed), and one
implementation of the per-id fetch lifecycle — with zero behavior change, evidenced by
`pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build` green after
every slice and the e2e smoke suite passing unchanged after the user-facing slices.

## Code quality standard

Code is clean if a developer other than its author can read, change, and extend it. This
plan applies the Clean Code ruleset (meaningful names, one-job functions, intent-only
comments, boundary-condition encapsulation, no needless repetition), with three
reconciliations where it meets binding repository authority:

1. **Polymorphism over switch is overridden for state unions.** The repository idiom is
   an exhaustive `switch` over discriminated unions, mechanically enforced by
   `switch-exhaustiveness-check` (Principles 5, 11). `renderState` and the selectors stay
   switches; polymorphism already lives where it belongs — the capability-panel registry
   instead of vendor branches (ADR 1, 19).
2. **"One assert per test" is adopted as one behavior per test.** Existing suites are the
   behavior-preservation evidence for the decomposition slices and stay untouched; new
   tests are written one-behavior-per-test.
3. **The boy-scout rule is bounded by the diff-size gate (ADR 27)** and "don't mix
   behavior with unrelated restructure": the campground is the files a slice already
   touches; anything further goes on this plan's follow-up list, not into the diff.

## Scope

### In scope

1. Repair the broken robot-detail working-tree edit by validating the route id before
   any data hook runs (root cause: id validation lived inside the hooks' signatures).
2. Move all unit tests into per-directory `tests/` subdirectories; document the
   convention in `packages/web/AGENTS.md`.
3. Relocate `robotDetailFixtures.ts` into `features/robot/tests/`, reconciling
   `docs/03_package-specs/05_WEB.md` §4 and the feature `TODO.md` in the same change.
4. Split `robotDetailPage.tsx` into section files, resolving the
   `BatteryHistorySection`/`BatteryHistoryContent` naming collision.
5. Extract a shared per-id fetch-resource hook under `entities/robot`;
   `useRobotDetail`/`useRobotHistory` become thin facades at their existing paths.
6. Hygiene: delete three unused default exports; unify `toIso` into a widened
   `formatTimeUtc`; add missing `dataPlate` and `time` tests.
7. Split the DEV-only `componentGallery.tsx` into fixtures + section files.

### Out of scope

- `__boundary-violation__` directory layout (enforcement fixtures are inputs; their
  suites stay colocated with their fixtures — the one deliberate exception to the
  `tests/` convention).
- `features/robot/index.ts` barrel: kept — it exists as the import target of the
  feature→feature lint fixture, whose test makes that coupling executable without
  mirrored comments (ADR 39).
- `entities/site`: checked, not vestigial (`selectSiteLabel` feeds all three pages);
  roster selectors correctly live in `entities/robot`.
- Resource-banner dedupe across fleet/map (deferred by `REFACTOR_WEB_REACT_QUALITY.md`
  F4 until a third consumer exists).
- Memoization removal (gated on open decision D27, React Compiler).
- Migrating fetch hooks to `use()`/Suspense (behavior change).

## Authorities and dependencies

- Principles 1, 4, 5, 6, 9, 10, 11, 14; `packages/web/AGENTS.md` (layers, React, tests);
  ADR 3 (freshness), ADR 12 (adapters in tests only), ADR 26 (raw-payload notice),
  ADR 27 (diff gate), ADR 28 (doc comments), ADR 33 (history resource).
- `docs/decisions.json` `mechanicalRules` pins `entities/robot/useRobotHistory.ts` and
  `features/robot/batteryHistorySection.tsx`: both paths survive with their ADR 33
  citations.
- Slice order: 1 → 2 → 3 → 4 → (5, 7 independent) → 6; each slice is one PR under the
  ADR 27 cap (pure renames count ~0; extraction slices that overrun use the
  `Oversized-diff:` trailer with the behavior-held-by-suite rationale).

## Execution

1. **Repair (slice 1):** failing test first — `RobotDetailPage` rendered on a route
   without an id shows "That address does not name a robot." synchronously and never
   fetches. Then: outer page validates `useParams` id (`isAddressedRobot`), inner
   `ResolvedRobotDetail({ id: string })` holds all data hooks unconditionally;
   `useFleetRobot(robotId: string)` narrowing kept; typo and formatting restored.
2. **Test moves (slice 2):** mechanically pure `git mv` of the 25 remaining colocated
   suites + sibling-import rewrites; evidence is the identical collected-test count.
   `AGENTS.md` Tests section gains the convention in the same change.
3. **Fixture move (slice 3):** `robotDetailFixtures.ts` → `features/robot/tests/`;
   rewrite its placement comment, `05_WEB.md` §4, and the feature TODO together.
4. **Detail-page split (slices 4a–4c):** `detailSection` + `summarySection` +
   battery-wrapper co-location; then `detailHeader` + `capabilitiesSection`; then
   `diagnosticsSection` + `rawPayloadSection` (ADR 26 comment verbatim) +
   `detailSkeleton`. Existing suite unchanged throughout.
5. **Fetch dedupe (slice 5):** `useFetchedResource` test first; hooks become facades;
   `useRobotDetail` narrows to `id: string`, dead guards deleted.
6. **Hygiene (slice 6):** default exports deleted; `formatTimeUtc` widened (test
   first); `dataPlate` test added.
7. **Gallery split (slice 7):** initially split into fixtures plus static and interactive
   section groups. A 2026-08-25 follow-up moved it to
   `features/component-gallery`, gave every section one export, and localized section
   state; the route remains DEV-gated.

## Acceptance criteria

- [x] Robot detail validates the route id at the boundary; every data hook takes
      `string`; the undefined-id path has a test.
- [x] The move into per-directory `tests/` folders was completed and documented; ADR 36
      later reversed that convention. The final tree has 37 collected files / 406 tests
      (24 files moved — the survey's 25 overcounted `shared/lib` by one).
- [x] Fixture location and the three documents that describe it agree.
- [x] The two scoped oversized files are decomposed: `robotDetailPage.tsx` retains
      only the route entry, body, and `renderState` (199 lines, from 552) over five
      section files; the component gallery's later feature move leaves its orchestrator
      with only gallery-wide tenant selection and one export per section module.
      `fleetPage.tsx` is 238 lines; its in-file
      decomposition was settled by `REFACTOR_WEB_REACT_QUALITY.md` F3 and is out of
      scope here.
- [x] One fetch-lifecycle implementation (`useFetchedResource`, 4 behavior tests
      written first); facades keep their pinned paths and ADR 33 citations
      (`pnpm check:architecture-docs` green).
- [x] `pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build`
      green after every slice. On the final tree, `pnpm test:e2e` passed 26/26 across
      Chromium and Firefox (13 per engine); WebKit could not launch on the development
      host because its GTK, GStreamer, and GLES libraries are missing.
- [x] Unverified item recorded honestly: commit `6bb879c` on `refactor-web` holds the
      25 pure renames without the import rewrites and does not build standalone; it was
      already pushed, so it was completed by the following commit rather than amended.

## Documentation synchronization

- `packages/web/AGENTS.md` Tests section (slice 2).
- `docs/03_package-specs/05_WEB.md` §4 and `packages/web/src/features/robot/TODO.md`
  "Settled test placement" (slice 3).
- This plan's status/date on every scope or evidence change.

## Verification

- `pnpm --filter web test` (serial)
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm check:diff-size` before each push
- `pnpm check:architecture-docs` after slices touching docs or pinned files (0, 3, 5)
- `pnpm test:e2e` after slices 1 and 4c

## Completion

All slices are implemented on `refactor-web` (2026-08-23). Archive under
`docs/04_archive/` once the branch merges; name the merged PR and the commit series
(`6bb879c`…hygiene) as the replacement evidence.
