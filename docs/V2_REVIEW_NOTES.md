# v2 — What Changed Since the Reviewed Submission

**Reviewed version:** tag [`v1`](https://github.com/rsstdd/fleet-console/tree/v1) — commit `50b7afe`, the tree as sent on 21 August 2026.
**Diff:** https://github.com/rsstdd/fleet-console/compare/v1...main

At a glance: 143 files changed, 47 of them renames. No feature was added and no behavior
was intentionally changed; the work is structural, plus the defects that surfaced while
doing it. The unit suite is at 402 passing cases across 36 files (v1: 34 files), green at
every step.

> **TODO (Ross):** re-run the Playwright e2e suite and the ADR 22 bundle gate on the final
> v2 tree before sending, and state the result here. Do not claim a gate you have not run.

---

## 1. Feedback → change

> **TODO (Ross):** fill the left column with Dimitri's and Enrique's actual words from the
> 21 August session, one row each, and delete any row below that does not correspond to
> feedback they gave. Rows already carrying a quote are the ones recorded in the ADRs.

| What you said                                                                                                                      | What changed                                                                                                                                                                                                                                                                                                                        | Where to look                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The package was hard to navigate — FSD vocabulary (`entities/`, `shared/ui`, `shared/lib`) is not what a React developer looks for | `packages/web/src` re-expressed in the ecosystem's standard vocabulary: `features/`, `components/`, `hooks/`, `stores/`, `context/`, `lib/`, `utils/`, `types/`, `config/`. The one-directional dependency rules did not change — they are still mechanically enforced by `eslint-plugin-boundaries`, now over the renamed elements | [ADR 36](00_adr/36_CONVENTIONAL_REACT_FOLDER_VOCABULARY_IN_WEB.md), `packages/web/eslint.config.js` |
| _(feedback point)_                                                                                                                 | Page components decomposed into focused files: `fleetPage.tsx` 569 → 238 lines, `robotDetailPage.tsx` 552 → 184 across five section files, the dev gallery 592 → 155 with fixtures and sections extracted                                                                                                                           | `packages/web/src/features/robot/`, `features/fleet/`                                               |
| _(feedback point)_                                                                                                                 | Unit tests colocated as `foo.test.tsx` beside `foo.tsx` — where a reviewer looks first                                                                                                                                                                                                                                              | anywhere under `packages/web/src`                                                                   |
| _(feedback point)_                                                                                                                 | Two hooks that had each grown their own copy of the same per-id fetch lifecycle now share one, written test-first: `useFetchedResource` owns loading/retry/stale-answer-discard, and `useRobotDetail` / `useRobotHistory` own only their URLs and outcome mapping                                                                   | `packages/web/src/hooks/useFetchedResource.ts`                                                      |
| _(feedback point)_                                                                                                                 | Naming pass across the package, and a comment pass so comments carry rationale rather than narrating the line below them                                                                                                                                                                                                            | commits `8359901`, `d3c7212`                                                                        |

## 2. Defects the refactor surfaced

Restructuring is only worth the churn if it finds something. It found these:

- **A valid robot could not be filtered out.** The site/vendor "all" sentinel shared its
  value with a legal canonical id, so a real id colliding with it was unfilterable. The
  filter model now carries `null` for "no filter" and the `Select` boundary uses a
  non-identifier sentinel; the unsafe cast is gone. (`5dcb982`, 96 lines of new tests)
- **The scale probe measured the wrong thing.** Frame receipt was counted inside
  `requestAnimationFrame`, so an occluded page could starve the integrity poll and the run
  would still report success. Receipt is now counted synchronously in the message listener
  and rAF samples latency only; the final-frame render assertion carries the application
  evidence. The correction is recorded in ADR 32 rather than quietly fixed. (`fec53e5`)
- Dead exports removed, two time formatters collapsed into one, and tests added for the
  primitives that had none. (`15464b2`)

## 3. Changed on my own judgment, not on your feedback

- Docs corrected where they had drifted from the code — several governance claims were
  stale, and every path-bearing record (`docs/decisions.json` pins, package specs, agent
  guides, coupling comments) moved in the same commit as the files it names.
- Both structural migrations were recorded as ADRs before being executed, including the
  cost of doing a second migration two weeks after the first.

## 4. Deliberately not changed

> **TODO (Ross):** this section is the one most worth your own words. If you disagreed with
> a piece of feedback, say so here with the reasoning — that reads better than silent
> compliance. Candidates below; delete what does not apply.

- _(e.g. a suggested library or pattern you considered and declined, and why)_
- The React Compiler adoption (`docs/05_plans/REFACTOR_WEB_REACT_QUALITY.md`) is written up
  but still blocked on an open decision; it is deliberately not in this diff.

## 5. Reviewing the diff

- Whole change: `git diff v1..main`, or the compare link above.
- Renames dominate the file count; `git diff -M v1..main` collapses them and leaves the
  content edits.
- Commit-by-commit reads in order — each commit is one slice, and each was verified green
  (tests, lint, build) before the next.
