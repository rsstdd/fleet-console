# ADR 37 — A Doc Comment Is Mandatory Only on a Package's Public Surface

**Decision:** A one-sentence doc comment is required on every symbol reachable from a package's declared public entry point — its `exports` barrel, and in `packages/web` the surface one layer imports from another — and is optional elsewhere, where a comment is written only when it says something the declaration cannot.
**Status:** Decided · 2026-08-24 · Implemented
**Group:** Process / documentation quality (which half of ADR 28's bet is mandatory, and where).

## Issue

Two documented rules pull in opposite directions, and both are cited as authority.

The first is prose: "one-sentence doc comment on every exported class, function, type, and React component," in `AGENTS.md` and repeated in all five package `AGENTS.md`/`CLAUDE.md` files, `docs/03_package-specs/00_PACKAGE_SPECS.md` § 5 and `README.md` § 7. Every one of those sites cites **(Principle 14)**.

**Principle 14 does not contain that rule.** It is about the repository being operable by agents and auditable by people — one authoritative instruction file, reproducible checks, explicit acceptance criteria. The doc-comment mandate was attributed to it, never derived from it, and thirteen files now carry a provenance that does not hold.

The second is ADR 28, which is the opposite finding. Its Positions § 3 rejected `jsdoc/require-description` in terms that name this exact cost: it "would demand comments on trivial members and manufacture exactly the noise this ADR exists to prevent." ADR 28 shipped the ban on restatement and deliberately shipped no requirement to write anything. `packages/web/AGENTS.md` § Comments nevertheless reads "Export docs stay mandatory (ADR 28)", attributing to ADR 28 the very position it declined.

So the mandate is enforced by review alone against a rule ADR 28 argued against, and the two together produce the predictable outcome: on a trivial export the only sentence available restates the signature, which `jsdoc/informative-docs` then rejects at `error`. The author's remaining moves are to pad the sentence until the linter is satisfied or to delete the export's documentation entirely. Neither is the behaviour either rule wanted.

## Assumptions

- The comments that carry real reasoning here are on cross-package surfaces and on the non-obvious internals — effects, thresholds, decode boundaries — not on prop interfaces and presentational components. Relaxing the mandatory tier should therefore cost little that is being read.
- A reader who opens a package cold reads its entry point first. Documentation concentrated there is worth more per sentence than the same volume spread evenly across every file.
- Removing a mandate does not remove the comments already written. Existing informative docs on internal exports stay; this changes what a reviewer may demand, not what may exist.

## Constraints

- **ADR 28 is unchanged and stays `Decided`.** `jsdoc/informative-docs` remains at `error` in all five packages, and `pnpm check:doc-comments` remains in CI. Nothing here weakens the ban on restatement; this ADR narrows only the unenforced requirement to write.
- **No new mechanical rule.** ADR 28 measured the mechanical option and rejected it; `packages/web/AGENTS.md` requires an ADR and a `docs/decisions.json` `mechanicalRules` registration for any new mechanical comment rule. This ADR registers nothing, so the public-surface tier stays a review rule and says so.
- Principle 15: enforcement is proportionate. A rule that cannot be checked mechanically and is not worth checking mechanically should be scoped small enough that review can actually hold it.
- `packages/web` is a private application with no `exports` field. Any rule phrased purely in terms of a package barrel says nothing about the largest package in the repository.

## Decision

**Mandatory tier — the public surface.** Every symbol reachable from a package's declared public entry point carries one informative sentence:

| Package     | Public surface                                                 |
| ----------- | -------------------------------------------------------------- |
| `contracts` | `src/index.ts`                                                 |
| `adapters`  | `src/index.ts` and `src/testing/index.ts`                      |
| `server`    | `src/index.ts`                                                 |
| `simulator` | `src/index.ts`                                                 |
| `web`       | no barrel — the symbols one layer imports from another (below) |

`packages/web` has no consumer and therefore no barrel, and a barrel-only rule would leave it with an empty mandatory tier. Its seams are its layer boundaries, which `packages/web/AGENTS.md` already declares and ADR 4 already enforces mechanically: a symbol imported across a directory layer — `features` → `components`/`hooks`/`utils`/`types`/`lib`/`config`/`stores`/`context`, or anything the app shell composes — is on the public surface. A symbol used only inside its own module or feature slice is not.

**Optional tier — everything else.** Module-local exports, prop interfaces, presentational components, and internal helpers are documented when the sentence carries a contract, a constraint, an edge case, an ownership fact, or a historical failure, and left undocumented when it would not. Absence of a doc comment on an internal export is not a review finding; a restated one still is.

**Unchanged everywhere:** the ban on restatement (ADR 28), the effect/threshold/coupling comment rules in `packages/web/AGENTS.md` § Comments, and two-sided coupling documentation.

## Positions

1. **Mandatory on the public surface, optional inside.** Chosen.
2. **Keep "every export", add an explicit triviality exemption list** — presentational components, prop interfaces, plain literal unions, re-exports. Rejected: the exemption is a judgment call at every site with no observable boundary, so it would drift between reviewers and produce the same argument repeatedly. The barrel is greppable; "trivial" is not.
3. **Keep "every export" as written.** Rejected: it is the status quo whose failure this ADR opens with — a mandate with false provenance, in tension with ADR 28, unenforced, and pushing authors toward padded sentences on trivial symbols.
4. **Make it mechanical with `jsdoc/require-jsdoc` scoped to entry-point files.** Rejected for now, and deliberately left as an open question rather than a silent omission. ADR 28's measurement is the caution: a rule that demands a description is a rule that manufactures descriptions. Scoping it to four `index.ts` files would be defensible, but no evidence yet says review is failing to hold this tier.
5. **Drop the requirement entirely and rely on `informative-docs`.** Rejected: `informative-docs` only judges comments that exist. Nothing would then ask the one file a new reader opens to explain itself.

## Argument

The decisive fact is provenance. A rule stated in thirteen files under a principle that does not contain it is not a weak rule — it is an unowned one, and the repository has already paid for exactly that (ADR 7: a boundary rule inert for the project's whole life because nobody checked that its authority was real). Correcting the citation was unavoidable once noticed; the only question was what the corrected rule should say.

Given that it had to be restated, ADR 28's own reasoning decided the content. That ADR measured the cost of demanding comments on trivial members and declined to pay it, then shipped a linter that makes the cheapest way to satisfy a demand — restating the name — an error. Keeping a review mandate that ADR 28 rejected mechanically leaves authors between two rules, and the way out of that squeeze is padding, which is worse than either outcome the rules wanted.

The barrel is the right line because it is the only line here that is observable without judgment. `pnpm docs:decisions` and `check:architecture-docs` cannot check this, but a reviewer can: the file is named in `package.json`. And it concentrates the mandatory documentation where a cold reader and a cross-package consumer both start, which is the audit story Principle 14 actually tells.

The honest cost is that `packages/web`'s mapping is an interpretation rather than a declaration. There is no `exports` field to point at, so "crosses a layer" stands in for "crosses a package". That is defensible because the layers are already mechanically enforced (ADR 4) and already declared in the package's own `AGENTS.md` dependency table — but it is a rule with one more judgment in it than the other four packages have, and it is the first thing to revisit if web's comment quality drifts.

## Implications

- **Thirteen prose sites change in this change**: `AGENTS.md`; the five package `AGENTS.md` files; the five package `CLAUDE.md` routing lines; `docs/03_package-specs/00_PACKAGE_SPECS.md` § 5; `README.md` § 7. Each now cites **ADR 37** instead of Principle 14.
- **`packages/web/AGENTS.md` § Comments loses "(ADR 28)" from "Export docs stay mandatory".** The restatement ban keeps its ADR 28 citation; the mandate now cites this ADR and applies to the layer surface only.
- **Nothing is deleted from the codebase.** Existing doc comments on internal exports stay where they are. This is not a sweep, and a change that removed them would be churn against a green tree.
- **A reviewer may no longer require a doc comment on an internal export**, and may still require that any comment present says something the signature does not.
- **`jsdoc/informative-docs` is untouched** in all five packages, as is `pnpm check:doc-comments` and `scripts/informativeDocsRule.test.mjs`.
- **A new package inherits the tier through its `exports` field.** A package that declares no public entry point has no mandatory tier, and that is a signal worth noticing rather than a gap to paper over.
- **`docs/decisions.json` gains D29 → ADR 37.** No `mechanicalRules` entry: this ADR registers no mechanism, by decision rather than omission.

## Open questions

- **Should the mandatory tier become mechanical?** Lean no for now. `jsdoc/require-jsdoc` scoped to the four `index.ts` files is the obvious shape if it ever does. Resolution event: a review that lets an undocumented barrel export through, or a second reviewer disagreeing about the web layer boundary.
- **Is "crosses a layer" the right surface for `web`, or should it be a real barrel per layer?** Lean: leave it. Adding index files per layer to make the rule mechanical would reorganize a package that ADR 36 just reorganized. Resolution event: the web layer rule needing a judgment call twice.
- **Does ADR 28's alias list need words now that fewer sentences are forced?** Lean no — fewer forced sentences should mean fewer padded ones. Resolution event: a redundant comment reaching review, per ADR 28's stated process.

## Observed consequences

- 24 August 2026: adopted. The provenance error is the finding worth recording: the mandate had been restated across thirteen files for the repository's whole life, each citing a principle whose text was never checked against it, while an ADR arguing the opposite position sat in `docs/00_adr/`. Both were read in full for the first time in the same sitting, and neither said what the files citing it said.

## Related

- **ADR 28** (a doc comment must say something the signature does not) — unchanged and still `error` in five packages. This ADR removes the tension its Positions § 3 predicted, and corrects `packages/web/AGENTS.md`'s attribution of the mandate to it.
- **ADR 7** (module resolution for boundary enforcement) — the recorded precedent for a rule whose authority was assumed rather than verified.
- **ADR 4** (feature-sliced structure with an enforced dependency rule) — the directed layer rule, enforced in lint, that makes "crosses a layer" observable in `packages/web` rather than a matter of taste.
- **ADR 36** (conventional React folder vocabulary in web) — names the layers this ADR's web surface is defined over.
- **Principle 14** ("the repository is operable by agents and auditable by people") — the correct reading: documentation concentrated at entry points is what serves a cold reader and an auditor, and this ADR is the first rule here actually derived from that rather than attributed to it.
- **Principle 15** (enforcement is proportionate and tested) — why the mandatory tier is scoped to what review can hold, and why no mechanism is registered.
