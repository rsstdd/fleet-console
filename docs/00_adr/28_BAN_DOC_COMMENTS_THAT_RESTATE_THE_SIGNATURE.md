# ADR 28 — A Doc Comment Must Say Something the Signature Does Not

**Decision:** All five packages enable `jsdoc/informative-docs` as an error, with a tuned alias and useless-word list shared from `config/eslint/informativeDocs.js`, and a root-level test proves the rule still fires in each package.
**Group:** Tooling / documentation quality (making a house style mechanical).
**Status:** Decided · 2026-08-19 · Implemented

## Issue

This repository bets on prose. The architecture audit counts roughly **8,400 lines of documentation against 7,500 lines of source**, and § 4.6 records that every defect found so far has been in the prose rather than the code. That bet only pays while the prose carries reasoning the code cannot express.

A comment that restates its own signature — `/** Sets the user name. */` above `setUserName` — costs a reader exactly as much as one explaining a coupling, and returns nothing. Worse, it is contagious: a file where half the comments are noise teaches the reader to skim all of them, including the one recording why two packages must agree.

Every package's `AGENTS.md` already says to document the _why_ and the non-obvious coupling. That rule was enforced by review alone, which is the same position ADR 7 records for `boundaries/dependencies` before anyone noticed it had been inert for the repository's whole life.

## Assumptions

- The existing comments are overwhelmingly informative. If the rule turned out to flag hundreds of them, the finding would be about this codebase's comments rather than about the rule, and the answer would be different.
- A linter can only catch the mechanical case: a description whose words are the name's words. It cannot judge whether a paragraph is _worth_ reading. This closes the cheap failure, not the expensive one.
- `eslint-plugin-jsdoc` is a development dependency with no runtime footprint. It cannot reach a bundle, a server process, or a vendor payload.

## Constraints

- **Dependencies need decision work** (`packages/web/AGENTS.md`, ADR 5's "never add dependencies without an ADR"). This ADR is that work.
- **Each package states its own lint policy.** The five configs share no base by design, and this ADR does not introduce one.
- Enforcement must itself be tested (Principle 15), and ADR 7 records what an untested rule is worth.
- Lint failure is a principle violation, not a style nit (`packages/web/CLAUDE.md`), so anything added at `error` must be clean on adoption.

## Decision

**`jsdoc/informative-docs`, at `error`, in all five packages.**

**The rule's defaults are not enough, and that was measured rather than assumed.** Against six deliberately redundant fixtures, the default configuration caught **one**: it flags a restated noun (`/** The robot id. */` on `robotId`) and **misses the canonical case in the request that prompted this ADR** — `/** Sets the user name. */` on `setUserName` — because "sets" and "set" are different strings to it. A tuned `aliases` map closes that gap for the verb forms this codebase actually writes: set/get, build/create, decode/parse, encode/serialize, is/whether, to/convert.

**Only the word lists are shared**, from `config/eslint/informativeDocs.js`. They are tuned data rather than policy, and five copies of a tuned word list is five things that drift (Principle 1). The plugin itself is imported by each package's config, so the shared module needs no dependency of its own and the per-package "each config states its own policy" convention survives intact.

**Severity is `error`, with no baseline file**, because the rule reports **zero findings across every package's `src/`** — measured before adoption, with both the default and the tuned options. Nothing was grandfathered, so there is nothing to rot.

**`scripts/informativeDocsRule.test.mjs` proves it fires**, per package, in both directions: a redundant comment is an error, an informative one is not. It runs in CI as `pnpm check:doc-comments`, beside the existing `check:type-safety` and `check:architecture-docs` config guards.

## Positions

1. **`jsdoc/informative-docs`, tuned, at error.** Chosen.
2. **The same rule at its defaults.** Rejected: it misses the exact case this was adopted for. It would have looked like a working guard while catching a quarter of what was asked.
3. **`jsdoc/require-description` and friends** — require _a_ description everywhere. Rejected as the opposite problem: it would demand comments on trivial members and manufacture exactly the noise this ADR exists to prevent.
4. **A custom `no-restricted-syntax` pattern.** Rejected. Comparing a description's words against an identifier's words is not a syntax match, and a hand-rolled approximation would need the alias and stop-word handling the plugin already has.
5. **Leave it to review.** Rejected — that is the status quo whose failure mode ADR 7 documents.

## Argument

The measurement is what decided the shape. Had the rule flagged hundreds of existing comments, the right answer would have been to fix the comments first and adopt the rule after, or to run it as a warning with a shrinking baseline. It flagged none, which makes `error` free and makes the rule purely preventative — its whole value is that the pattern never arrives.

That property is also the risk, and it is why the enforcement test is not optional here. A rule with zero findings is indistinguishable from a rule that failed to load, was mis-keyed in one package's config, or had its alias list quietly emptied. That is precisely ADR 7's recorded failure, and the only defence is a test that supplies a violation and insists on seeing it rejected.

The test lints a **string**, not files on disk, and that is deliberate. Every existing enforcement suite here lints the live tree, and all three of them flake under parallel load — `packages/FIXME.md` **F14**, observed five times in one day. Nothing about this rule needs a real file, so it takes no share of that problem.

The honest limit is worth stating plainly: this catches lazy comments, not wrong ones. A comment that confidently describes behaviour the function no longer has passes cleanly, and that is the more dangerous defect. Nothing here helps with it.

## Implications

- **Adding a package means adding this rule**, or it lints without the ban. The enforcement test names the five packages explicitly and a sixth would not be covered until it is listed — deliberately, so the omission fails loudly rather than silently.
- **The alias list will need words added**, and the process is: a redundant comment gets through review, the word that let it through goes in the list. Adding words pre-emptively makes the rule stricter against comments nobody has written yet, which is how a useful rule becomes one people disable.
- **Do not add domain words to `uselessWords`.** "value" and "given" are empty on their own; "vendor", "raw" and "freshness" are not, and adding one would start flagging comments doing real work. The list's own comment says so.
- **Supplying `aliases` replaces the plugin's default rather than merging**, so the `a: ["an", "our"]` entry is load-bearing. Dropping it silently weakens every comparison; a test asserts it.
- **`eslint` is now a root devDependency**, so the cross-package test can run from the repository root. The plugin itself stays package-local.
- **`.tsx` is covered in `packages/web`** through its own file glob, and the test's web probe anchors on `main.tsx` for that reason.
- **This does not lower the bar for prose.** The audit's § 4.6 finding — that documentation is growing faster than it is verified — is untouched by a rule about comment redundancy. This removes one cheap failure mode; it is not an answer to that finding.

## Open questions

- **Should `excludedTags` be configured?** No tag is excluded today. If a `@param`-heavy style ever arrives, `@category`-style tags would be the first candidates.
- **Does this belong on test files too?** It currently applies to every `.ts`/`.tsx`, tests included. Test names carry a lot of this codebase's reasoning, and no test comment was flagged, so the wider scope costs nothing today.
- **Is there a rule for the more dangerous case** — a comment that is informative and _wrong_? Not mechanically. The nearest thing this repository has is the coupling convention: document a coupling on both sides, so a stale claim has a second place to contradict.

## Observed consequences

- 19 August 2026: adopted. `eslint-plugin-jsdoc` added to the catalog and all five packages; `config/eslint/informativeDocs.js` created; the rule wired into five configs; `scripts/informativeDocsRule.test.mjs` (11 assertions) added and wired into CI as `pnpm check:doc-comments`.
- **Zero findings across the codebase, with defaults and with the tuned options.** The rule was adopted against a tree already in the state it enforces.
- **The defaults' gap was found by probing rather than by reading the documentation.** Six redundant fixtures, one caught. Every one of the four the tuned list added is a verb form this codebase writes constantly.
- **The first version of the enforcement test failed for an unrelated reason**, and the reason is worth recording: these packages lint with type-aware rules, whose project service rejects a `filePath` it has never seen with a fatal parsing error rather than a rule result. Linting a string still works, but the path has to name a file the TypeScript project already covers. A test that filtered only for its own rule id — as the first draft did — would have read that fatal error as "no findings" and passed vacuously once the assertion was inverted. It now asserts no fatal message before it counts anything.
- ADR number 27 was claimed by a concurrent session mid-work; this is 28, and the references in seven files were updated together.

## Related

- **ADR 7** (module resolution for boundary enforcement) — records the inert-rule failure this ADR's enforcement test exists to prevent, and is the reason a zero-finding rule gets a test at all.
- **ADR 5** (Material UI with tokens only) — the source of the "never add dependencies without an ADR" constraint this ADR satisfies.
- **`packages/FIXME.md` F14** — the flaking enforcement suites, and the reason this test lints a string rather than the tree.
- **`docs/ARCHITECTURE_AUDIT.md` § 4.6** — the documentation-to-source ratio that makes comment quality a real concern here rather than a preference.
- **Principle 1** (one authoritative implementation) — the reason the tuned word lists are shared rather than copied five times.
- **Principle 15** (enforcement is proportionate and tested) — one rule, one shared options module, one test that supplies a violation and requires it to be rejected.
