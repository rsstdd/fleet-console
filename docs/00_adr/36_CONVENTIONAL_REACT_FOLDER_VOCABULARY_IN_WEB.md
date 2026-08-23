# ADR 36 — Conventional React Folder Vocabulary in Web

**Decision:** `packages/web/src` adopts the community-standard React folder vocabulary — `features/`, `components/`, `hooks/`, `stores/`, `context/`, `lib/`, `utils/`, `types/`, `config/` — with unit tests colocated beside their sources, while the existing one-directional dependency rules stay mechanically enforced over the renamed elements.
**Status:** Decided · 2026-08-23 · Implemented
**Group:** Presentation / code organization (what an external React reviewer finds when they open the package cold).

## Issue

The web package is organized in Feature-Sliced-Design vocabulary: `entities/`, `shared/ui`,
`shared/lib`. The layering it expresses is sound and mechanically enforced
(`eslint-plugin-boundaries`, registered under ADR 12's mechanical rule for
`packages/web/eslint.config.js`), but the _names_ are FSD jargon. An external reviewer
reported the package hard to navigate — and this repository's primary audience is exactly
that reviewer, reading it cold. A React developer looking for data fetching does not guess
"entities"; one looking for shared UI does not guess "shared/ui" before "components".

Separately, unit tests were recently moved into per-directory `tests/` subdirectories
(`WEB_TEST_LAYOUT_AND_DECOMPOSITION.md`). That convention optimized for tidy directory
listings, but it is also non-standard: the ecosystem's dominant convention is
`foo.test.tsx` beside `foo.tsx`, which is where a reviewer looks first.

The question this ADR answers: does the package keep its internally consistent but
unfamiliar vocabulary, or re-express the same architecture in the names the ecosystem
standardized on?

## Assumptions

- The reviewer-facing purpose of this repository outweighs the cost of a second
  structural migration in two weeks, provided the decision is recorded rather than silent.
- The dependency rules, not the folder names, are what carry the architecture. Renaming
  elements in the boundaries configuration preserves enforcement exactly.
- git rename detection preserves file history through `git mv`, so blame continuity
  survives the moves in practice.

## Constraints

- Docs are authoritative over code: every path-bearing record — `docs/decisions.json`
  `mechanicalRules` pins, `docs/03_package-specs/05_WEB.md` §4/§7, both web agent guides,
  coupling comments — must move in the same change as the files they name.
- `__boundary-violation__` enforcement fixtures are inputs; their suite lints the tree on
  disk and its `FIXTURES` paths must track any relocation.
- The ADR 22 bundle gate and ADR 24 scale evidence must be unaffected (moves only, no
  behavior).
- Diff-size gate (ADR 27): pure renames count ~0; import-line rewrites and doc updates
  carry the cost.

## Decision

Re-express the existing architecture in standard vocabulary, changing no dependency rule:

| Current                                           | New           | Contents                                                                    |
| ------------------------------------------------- | ------------- | --------------------------------------------------------------------------- |
| `features/`                                       | `features/`   | unchanged; fleet page split to one component per file                       |
| `shared/ui`                                       | `components/` | domain-free presentational primitives (rule unchanged)                      |
| `entities/robot` hooks                            | `hooks/`      | `useFleetRobots`, `useRobotDetail`, `useRobotHistory`, `useFetchedResource` |
| `entities/robot` store                            | `stores/`     | `fleetStore`, `fleetStoreContext`                                           |
| `shared/lib` contexts + `app/tenantConfigContext` | `context/`    | `connectionContext`, `streamDiagnosticsContext`, `tenantConfigContext`      |
| `shared/lib` transport                            | `lib/`        | `fleetTransport`, `transportDecoding`, `streamLifecycle`, `coldStart`       |
| `shared/lib/time` + entity mapping/selectors      | `utils/`      | `time`, `robotSelectors`, `fromEnvelope`, `siteLabel`                       |
| entity models                                     | `types/`      | `robot.ts`, `site.ts` (pure type modules)                                   |
| `config/`                                         | `config/`     | unchanged                                                                   |

Unit tests colocate beside their sources (`fooPage.test.tsx` beside `fooPage.tsx`),
reversing the `tests/` subdirectory convention. `src/test/setup.ts` (infrastructure) and
`__boundary-violation__/` directories are the two exceptions and keep their homes.
Filenames stay camelCase; kebab-case was considered and declined (churn without a
navigability gain — folder names carry the familiarity).

The boundaries configuration renames its elements and keeps every rule: features do not
import features; `components/` stays domain-free (no `@fleet/contracts`); the non-JSX
layers (`hooks/`, `stores/`, `context/`, `lib/`, `utils/`, `types/`) keep the former
entity/shared-lib bans on `react-dom`, `@mui/*`, and `react-router*`; `@fleet/adapters`
stays test-only package-wide (ADR 12); `config/` keeps its restrictions.

## Positions

1. **Keep FSD names, add a README folder map.** Cheapest; but the map explains an
   unfamiliar thing rather than removing the unfamiliarity, and the reviewer's first
   impression is unchanged.
2. **Rename `shared/` only.** Halves the churn but keeps `entities/` — the name most
   likely to have caused the feedback.
3. **Full standard vocabulary, colocated tests** (chosen).
4. **Also kebab-case filenames** (declined; see Decision).

## Argument

The package's differentiator is mechanical enforcement of a one-directional dependency
graph — that survives any renaming untouched. The FSD names were serving internal
consistency, but the package's audience is external reviewers, and for them the standard
vocabulary is free navigation: `components/`, `hooks/`, `stores/` need no legend. The
test-placement reversal follows the same principle: colocation is where the ecosystem
looks. Recording the reversal here is what distinguishes a deliberate change of
optimization target (the audience changed) from thrash.

## Implications

- `docs/decisions.json` pins move with their files: ADR 23 (`connectionContext`),
  ADR 31 (`streamLifecycle`), ADR 33 (`useRobotHistory`), ADR 35 (`selectors` →
  `utils/robotSelectors.ts`), ADR 24 (`fleetScale.test.tsx` back beside its page).
- `docs/03_package-specs/05_WEB.md` §4 and §7, `packages/web/AGENTS.md`, and
  `packages/web/CLAUDE.md` are rewritten in the new vocabulary; the README gains a
  "Navigating the code" folder map.
- The entity↛entity lint rule retires with the entities layer (its isolation concern
  survives as features↛features, which keeps its fixture); the adapter-import fixtures
  relocate to `utils/__boundary-violation__/`.
- `entities/site/model.ts` splits: its type to `types/site.ts`, `selectSiteLabel` to
  `utils/siteLabel.ts`.
- Execution is sequenced in `docs/05_plans/WEB_FOLDER_VOCABULARY.md`.

## Open questions

- Whether `app/dev` (the gallery) should become a feature under `features/dev-gallery/`.
  Current lean: no — it is app-wired, DEV-gated tooling, not a product feature. Resolves
  if the gallery ever gains a product surface.

## Observed consequences

- 2026-08-23 — Implemented across six slices on `refactor/reorganize-web` with the
  collected suite identical throughout (35 files / 391 tests), lint/build green per
  slice, and e2e smoke 24/24 on chromium + firefox after the final move. The
  boundary-violation suite failed once mid-migration on the reworded ban message and
  passed after the assertion followed it — the enforcement rule demonstrated live.

## Related

- ADR 12 — adapters-in-tests-only ban; its mechanical rule (`packages/web/eslint.config.js`) is edited, not weakened.
- ADR 22, ADR 24 — measured gates; unaffected by moves, verified per slice.
- ADR 27 — diff-size gate; pure renames make the migration affordable.
- ADR 23, 31, 33, 35 — pinned web paths that move with this decision.
- Plan `docs/05_plans/WEB_FOLDER_VOCABULARY.md` — execution sequence.
- Plan `docs/05_plans/WEB_TEST_LAYOUT_AND_DECOMPOSITION.md` — established the `tests/`
  convention this ADR reverses; its layering and decomposition outcomes stand.

## Notes

The immediate prompt was reviewer feedback that the package was hard to navigate. The
structure was not wrong; it was foreign. This ADR trades a vocabulary only this
repository speaks for the one every React reviewer already knows.
