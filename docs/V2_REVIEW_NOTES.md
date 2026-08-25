# v2 — What Changed Since the Reviewed Submission

**Reviewed version:** tag [`v1`](https://github.com/rsstdd/fleet-console/tree/v1) — commit `50b7afe`, the tree as sent on 21 August 2026.
**Diff:** https://github.com/rsstdd/fleet-console/compare/v1...main

At a glance: 200 files changed, 44 of them renames. No feature was added and no behavior
was intentionally changed; the work is structural, plus the defects that surfaced while
doing it. The final tree has 406 passing unit tests across 37 files (v1: 34 files). The
decomposed orchestrators are 238 lines for `fleetPage.tsx`, 199 for
`robotDetailPage.tsx`, and 151 for `componentGallery.tsx`.

Final-tree verification on 25 August 2026: `pnpm test:e2e` passed Chromium 13/13 and
Firefox 13/13. WebKit could not launch locally because the host lacks its GTK,
GStreamer, and GLES libraries. `pnpm check:bundle` passed at 608.53 kB raw and
183.27 kB gzip against ADR 22's 720/300 kB budgets.

---

## 1. Feedback → change

| What you said                                                                                                                      | What changed                                                                                                                                                                                                                                                                                                                        | Where to look                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The package was hard to navigate — FSD vocabulary (`entities/`, `shared/ui`, `shared/lib`) is not what a React developer looks for | `packages/web/src` re-expressed in the ecosystem's standard vocabulary: `features/`, `components/`, `hooks/`, `stores/`, `context/`, `lib/`, `utils/`, `types/`, `config/`. The one-directional dependency rules did not change — they are still mechanically enforced by `eslint-plugin-boundaries`, now over the renamed elements | [ADR 36](00_adr/36_CONVENTIONAL_REACT_FOLDER_VOCABULARY_IN_WEB.md), `packages/web/eslint.config.js` |

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
