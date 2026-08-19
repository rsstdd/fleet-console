# ADR 7 — A module resolver is part of the dependency rule, not an optimization

**Decision:** `eslint-import-resolver-typescript` is a required dependency of `packages/web`, configured as `settings["import/resolver"]` in `eslint.config.js`, because `boundaries/dependencies` cannot classify a dependency it cannot resolve to a file, and an unclassified dependency is skipped in silence rather than reported.
**Status:** Decided · 2026-08-19 · Implemented
**Group:** Presentation / structural (the enforcement half of ADR 4).

## Issue

ADR 4 decided the dependency rule and wrote the policy list. For roughly the whole life of the repository the rule reported nothing — not for the deliberate fixture, not for any probe, not under `{ default: "disallow", policies: [] }`. `pnpm test` failed on the fixture that asserts a violation is caught, and Principle 9's "enforced in the build" was a claim the build did not support.

ADR 4's Observed consequences concluded from probe 3 that no file was being classified as an element. That inference was wrong, and it sent the remediation in the wrong direction: the settings under suspicion were `boundaries/elements`, which were correct all along.

## Assumptions

- A lint rule that cannot evaluate an import reports nothing, and nothing is indistinguishable from a passing check. Silence is the failure mode to design against, here as much as in ADR 3.
- Adding a dev-time dependency to make an existing rule function is a smaller change than replacing the rule or hand-rolling boundary checks.

## Constraints

- `packages/web/CLAUDE.md` requires an ADR before any dependency is added. This document is that ADR.
- The alias `@/*` is already load-bearing across the source tree; removing it to sidestep resolution is not on the table.
- `eslint-plugin-boundaries` v7 defaults `checkUnknownLocals` to `false`. This is not configurable away without also opting into reports for genuinely unclassifiable imports.

## Decision

`eslint-import-resolver-typescript` is a devDependency of `packages/web`, and `eslint.config.js` configures it against both `tsconfig.app.json` and `tsconfig.node.json`. The dependency rule is treated as having two halves: the policy list, which was already correct, and the resolver, without which the policy list is inert.

Two mechanical consequences follow, both verified rather than assumed:

- External-module policies live in `boundaries/dependencies` with `checkAllOrigins: true`, and every layer carries an explicit `{ to: { module: { origin: "external" } } }` allowance that the specific bans then narrow. `boundaries/external` would express this more directly but is deprecated in v7.
- Disallowed sources are written as a plain array, not `{ anyOf: [...] }`. The `anyOf` form throws `template.replaceAll is not a function` inside `@boundaries/elements@3.1.1` when the origin is external, and the rule then matches nothing — the same silent failure this ADR exists to eliminate.

## Positions

1. **Leave the rule inert and rely on review.** Rejected. PRINCIPLES.md's enforcement vocabulary ranks review last and states that review-only is convention rather than guarantee. Principle 9 specifically says "enforced in the build."
2. **Drop the `@/` alias and use relative imports so the default node resolver copes.** Rejected on evidence: the relative-import probe (`../robot/index`) also reported nothing, because the default resolver does not follow `.ts` extensions either. This would have cost a tree-wide import rewrite and fixed nothing.
3. **Replace `eslint-plugin-boundaries` with a hand-written rule.** Rejected. Principle 15 requires enforcement be proportionate and tested; a bespoke rule is more code to test than a resolver entry is to configure.
4. **Add the resolver and keep the existing policy list.** Chosen.

## Argument

The decisive evidence was two rules the earlier investigation had not run. `boundaries/no-unknown-files` passes on a probe file, proving files _are_ classified as elements. `boundaries/no-unknown-dependencies` errors on the same file, proving the _dependency_ is not. Probe 3's zero-message result was consistent with both explanations, so it could not distinguish them; the conclusion drawn from it was unsupported by the evidence available.

Cost is one dev-time dependency already present in the lockfile. The alternative positions cost either a tree-wide rewrite that the relative-import probe shows would not have worked, or a bespoke rule with its own test burden.

## Implications

- Principle 9 moves from asserted to enforced. ADR 4's status moves from Partial to Implemented.
- The fifteen-case probe covering every policy — seven internal, three external, five legal imports that must stay clean — is the artifact that proves it. Two of those cases are now permanent fixtures; the rest were run once and are recorded here rather than kept as code.
- The dependency rule now has a runtime cost proportional to import resolution. It is a lint-time cost only and does not reach the bundle.
- Any future change to `tsconfig` paths must be mirrored in the resolver's `project` list or the rule silently degrades to its former state. This coupling is commented in both files.

## Open questions

- **Does `@boundaries/elements` fix the `anyOf` crash, letting the source lists collapse back to one selector per layer?**
  _Current lean:_ Report it upstream and keep the array form, which is equivalent and does not crash.
  _Resolves on:_ A released version whose changelog names the fix.
- ~~**Should `checkUnknownLocals` be enabled so an unresolvable import becomes an error rather than a skip?**~~
  **Closed 19 August 2026: enabled.** The survey this question was waiting on was run and the set is empty. See Observed consequences.

## Observed consequences

- 2026-08-19: `checkUnknownLocals` is enabled. The survey the open question deferred on was run by setting the flag and linting the tree: **zero** messages, so the feared population of legitimately-unclassifiable imports does not exist here. The flag now converts this ADR's whole subject — an import the rule cannot resolve being skipped in silence — into a build error. Turning it on while the cost is zero is strictly cheaper than turning it on after unclassifiable imports have accumulated and each one needs a judgment call.
- 2026-08-19: With the resolver configured, the live rule reports zero violations against the existing source tree. The architecture already complied; only the proof was missing.

## Related

- `ADR 4 — feature-sliced structure; this ADR supplies the enforcement its Decision assumed and its Observed consequences could not obtain.`
- `Principle 9 ("Boundaries are enforced in the build") — this ADR is what makes that sentence true.`
- `Principle 15 ("Enforcement is proportionate and tested") — the fixtures under src/**/__boundary-violation__/ are the test half.`
- `TODO B10, B11 — the findings this ADR closes.`

## Notes

The three external policies had never fired once since they were written. They were the last three cases in the probe to go green, and they failed for a different reason than the internal ones: not resolution, but `boundaries/dependencies` declining to inspect external origins at all unless asked.
