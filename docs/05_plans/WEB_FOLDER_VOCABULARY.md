# Web Folder Vocabulary Migration

**Authority:** Planning only.
**Status:** Active
**Updated:** 2026-08-23

## Outcome

`packages/web/src` matches the layout ADR 36 decides — `features/`, `components/`,
`hooks/`, `stores/`, `context/`, `lib/`, `utils/`, `types/`, `config/`, with unit tests
colocated beside their sources and one exported component per feature file — with zero
behavior change, evidenced by `pnpm --filter web test && pnpm --filter web lint &&
pnpm --filter web build` green after every slice, an unchanged collected-test count
(35 files / 391 tests), and the e2e smoke suite passing after the final move slice.

## Scope

### In scope

1. Split `fleetPage.tsx` into one-component files (`fleetSummary`, `fleetFilters`,
   `fleetTable`).
2. Colocate all unit tests beside their sources, dissolving the `tests/` subdirectories;
   `robotDetailFixtures.ts` returns beside its consumers.
3. `shared/ui` → `components/`.
4. `shared/lib` → `lib/` (transport), `context/` (contexts, plus `app/tenantConfigContext`),
   `utils/` (`time`).
5. Dissolve `entities/`: hooks → `hooks/`, store + store context → `stores/`,
   `selectors.ts` → `utils/robotSelectors.ts`, `fromEnvelope.ts` → `utils/`,
   `model.ts` → `types/robot.ts`, `entities/site/model.ts` → `types/site.ts` +
   `utils/siteLabel.ts`. Relocate the adapter lint fixtures; retire the entity↛entity
   fixture (features↛features keeps its own).
6. Rewrite the boundaries configuration over the new element names, preserving every
   dependency rule and external ban (ADR 36 Decision table).
7. Doc sync: `05_WEB.md` §4/§7, web `AGENTS.md` and `CLAUDE.md`, `decisions.json` pins
   (ADR 23, 24, 31, 33, 35), path-bearing coupling comments, and a README
   "Navigating the code" folder map.

### Out of scope

- kebab-case filenames (declined in ADR 36).
- Any behavior, selector, transport, or state change; memoization (D27-gated).
- `app/dev` gallery relocation (ADR 36 open question; current lean: stays).
- Historical documents (`SIMULATOR.md` recipes, archived plans) — they record what was
  true when executed.

## Authorities and dependencies

- ADR 36 (this migration's decision), ADR 12 (adapters test-only; eslint config edited,
  rule preserved), ADR 22/24 (gates unaffected, verified), ADR 27 (diff gate; renames
  count ~0), ADR 28 (doc comments travel with code).
- `PRINCIPLES.md` and `packages/web/AGENTS.md` layer rules re-expressed, not weakened.
- PR order below; each slice depends on the previous except where noted. One branch,
  merged as a continuous series, so a reviewer never sees a half-renamed tree.

## Execution

1. **PR 0 (this change):** ADR 36, D28 registration, this plan.
2. **PR 1 — fleetPage split.** Extract `fleetSummary.tsx`, `fleetFilters.tsx`,
   `fleetTable.tsx` (mechanical, existing suite unchanged as evidence); dated note on
   `REFACTOR_WEB_REACT_QUALITY.md` F3. Run `pnpm test:e2e:scale` (ADR 24 surface).
3. **PR 2 — colocate tests in non-moving directories** (`app/`, `app/dev/`, `config/`,
   `features/*`): pure `git mv` + sibling-import rewrites; `robotDetailFixtures.ts` back
   beside its consumers. Same-PR doc sync: web `AGENTS.md` Tests bullet, `05_WEB.md` §4,
   `features/robot/TODO.md`, the fixtures placement comment, ADR 24 pin, and the path in
   `FLEET_REPORTING_STATUS_COPY.md`. Evidence: identical collected-test count.
4. **PR 3 — `shared/ui` → `components/`,** tests colocating in the same move; boundaries
   element rename; doc table rows.
5. **PR 4 — `shared/lib` → `lib/` + `context/` + `utils/`,** tests colocated; ADR 23 and
   31 pins.
6. **PR 5 — dissolve `entities/`** per ADR 36's table, tests colocated; adapter fixtures
   → `utils/__boundary-violation__/` with the fleet suite's `FIXTURES` array updated;
   boundaries config gains `hooks/stores/context/lib/utils/types` elements with the
   former entity/shared-lib bans; ADR 33 and 35 pins. Run `pnpm test:e2e` after.
7. **PR 6 — docs + README.** `05_WEB.md` §7 layer table, web `AGENTS.md` layer rules,
   web `CLAUDE.md` layer sentence, README "Navigating the code" map; ADR 36 status →
   Implemented; this plan's boxes checked.

## Acceptance criteria

- [x] Tree matches the ADR 36 Decision table; no `tests/` subdirectories remain
      (`src/test/setup.ts` and `__boundary-violation__/` excepted).
- [x] Every feature file exports one component; `fleetPage.tsx` composes
      summary/filters/table from sibling files (240 lines over four files).
- [x] Boundaries lint enforces the same edge set as before over the new element names
      (plus the two documented edges the code already carried: `lib → context`,
      `context → config`); the boundary-violation suite passes with relocated fixtures,
      having failed once mid-migration on the reworded message — the rule shown live.
- [x] All five moved `decisions.json` pins resolve, plus the TODO authority marker;
      `pnpm check:architecture-docs` green.
- [x] Collected-test count unchanged (35 files / 391 tests); test/lint/build green per
      slice; e2e smoke 24/24 (chromium + firefox) after PR 5.
- [x] Both READMEs carry the folder map; spec, agent guides, and coupling comments name
      only new paths.
- [x] Unverified items recorded honestly: webkit e2e cannot launch on the development
      WSL host (CI covers it); two pushed commits on the series hold pure renames whose
      content edits landed in (or must be amended into) their successors — see the
      Completion note.

## Documentation synchronization

Per-slice, in the same PR as the code it describes: `packages/web/AGENTS.md`,
`packages/web/CLAUDE.md`, `docs/03_package-specs/05_WEB.md` §4/§7, `docs/decisions.json`,
`packages/web/README.md` (or repo README — wherever the reviewer lands first),
`REFACTOR_WEB_REACT_QUALITY.md` F3 note, and ADR 36's status line at completion.

## Verification

- `pnpm --filter web test` (serial) · `pnpm --filter web lint` · `pnpm --filter web build`
- `pnpm check:diff-size` before each push
- `pnpm check:architecture-docs` on every slice that touches docs or pins (0, 2, 4, 5, 6)
- `pnpm test:e2e:scale` after PR 1; `pnpm test:e2e` after PR 5

## Completion

All slices implemented 2026-08-23 on `refactor/reorganize-web`; ADR 36 is marked
Implemented. Archive under `docs/04_archive/` once the branch merges, naming ADR 36 and
the PR series as replacement evidence. Note for the merge: commit `63b9fad` was pushed
holding only the entity-layer renames; its content edits ride in the following commit
(or an amended, force-pushed replacement) — squash-merge makes this moot.
