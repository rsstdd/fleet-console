# ADR 4 — Feature-Sliced Structure With an Enforced Dependency Rule

**Decision:** The `web` package is organized feature-sliced with a directed dependency rule enforced in lint.
**Status:** Decided · 2026-08-19 · Partial
**Group:** Presentation / structural.

## Issue

Two conditions govern this structure: a target scale of roughly four thousand files, and an expectation that an agent writes much of the code. A folder structure that is merely a convention — features organized by name, cross-imports left to reviewer discipline — survives neither condition, because a file count in the thousands makes ad hoc review infeasible and an agent has no memory of a convention that lives only in a document it was never shown.

The structure must be chosen before any feature code exists. Retrofitting a dependency rule onto code that already violates it is materially more expensive than enforcing it from the first commit.

## Assumptions

- The front end carries more structural scrutiny than the other packages, since the simulator and server exist to feed it.
- An agent, not only a human reviewer, will touch this codebase, and cannot be assumed to have read `PRINCIPLES.md` before editing a file. The rule must fail mechanically or it does not exist.
- The package will not approach four thousand files here. The structure is deliberately oversized relative to the current problem, justified against the target scale rather than the present one.
- Tooling versions (`eslint-plugin-boundaries` v7, TypeScript 6.0.3, ESLint 10.8.1) are newer than most existing documentation and community examples assume. Configuration syntax will likely require reading the plugin's own source or docs rather than following established patterns.

## Constraints

- Budget: roughly thirty minutes was allotted to wiring this rule. It consumed closer to ninety once version-mismatch debugging is included.
- The rule must be expressible in a single `eslint.config.js`. No second boundary-checking tool, per the no-dependency-without-an-ADR rule in `CLAUDE.md`, and to keep enforcement legible to a reviewer who opens one file.

## Decision

The `web` package is organized feature-sliced: `app`, `features/*`, `entities/*`, `shared/ui`, `shared/lib`, `config`. A directed dependency rule is enforced in lint rather than documented as a convention:

```
app       → may import anything
features  → may import entities and shared, and may import themselves, never a sibling feature
entities  → may import shared only; no React, no MUI, no router
shared-ui → imports nothing above it
shared-lib→ imports nothing above it
config    → imports nothing above it, and imports no React or MUI
```

Enforcement is `eslint-plugin-boundaries`, configured as a `boundaries/dependencies` policy list in `eslint.config.js`, with `boundaries/include` scoped to `src/**/*` and element types captured by path pattern. The `feature` and `entity` types capture their own name, so a feature may depend on itself but not on a sibling.

Two permanent fixtures are required to prove the rule runs. `src/features/fleet/__boundary-violation__/violation.ts` imports across the feature boundary; `src/entities/robot/__boundary-violation__/violation.ts` imports `@mui/material` across the external-dependency boundary. Each carries a test asserting that ESLint's Node API reports a `boundaries/dependencies` violation against it. The fixtures are not repaired and not deleted. A repository that otherwise passes, whose fixture tests would fail the moment the rule stopped working, is what makes principle 9 checkable rather than asserted.

As of this writing the first fixture exists and the second does not, and the rule itself reports nothing. See Observed consequences.

## Positions

1. **Convention only, documented in `PRINCIPLES.md` and `CLAUDE.md`.** Rejected outright: this is the "rule that lives only in a document is a suggestion" case principle 9 exists to prevent, and it gives an agent nothing to fail against.
2. **`dependency-cruiser`.** A mature, framework-agnostic dependency-graph tool configured via a rules file rather than embedded in ESLint. Viable, and held as the fallback if `eslint-plugin-boundaries` resisted configuration. Not chosen because it runs as a separate CLI step rather than surfacing as a lint error inline in an editor or a `pnpm lint` run, and because it would be a second tool with its own config file for a job `eslint-plugin-boundaries` already does inside the existing lint pass.
3. **A twenty-line custom ESLint rule using `no-restricted-imports` per-directory overrides.** Rejected as the primary mechanism: `no-restricted-imports` expresses simple deny-lists but cannot capture the self-referential case — a feature may import itself, never a sibling — without one override block per feature. That does not scale, and it reads as an enumeration rather than a rule.
4. **`eslint-plugin-boundaries`.** Chosen. Purpose-built for this shape of rule: element types by path pattern, directed allow/disallow policies, captured path segments for self-reference. It runs inside the same `eslint.config.js` and the same `pnpm lint` invocation as every other check in the package.

## Argument

`eslint-plugin-boundaries` was chosen because it is the only option that expresses "a feature may depend on itself but never a sibling" as a single declarative policy rather than an enumerated exception per feature. Enumeration does not scale past two features by hand.

Its cost turned out materially higher than estimated, entirely due to version churn rather than the underlying design. The v7 release renamed `element-types` to `dependencies`, renamed `rules` to `policies`, required every element and module selector to be wrapped in an object rather than a bare string, changed template interpolation from `${...}` to `{{...}}`, and moved external-package matching out of the deprecated `boundaries/external` rule into the same `dependencies` rule under a `{ to: { module: { origin: "external", source } } }` shape. That shape appears in almost no existing tutorial or training data for this package.

None of this reflects a defect in the tool. It reflects documentation and community examples lagging a current major version, which generalizes to any lint plugin adopted later in this project.

## Implications

- Every new feature directory inherits the dependency rule automatically via the `src/features/*/**` glob. No per-feature lint configuration is required.
- The violation fixtures and their tests are a permanent part of the tree. A future contributor or agent who finds a fixture and "cleans it up" by fixing the import silently disables the proof that principle 9 holds. That is the failure mode this ADR most wants named in advance.
- Any lint plugin adopted later should have its installed major version checked against whatever documentation or training data informs its configuration, rather than assuming the two agree.
- `boundaries/include` scoped to `src/**/*` means `.css` files under `src/styles` are technically in scope for element classification but are never linted by ESLint's file globs, so the boundary rule has no opinion about them. Token discipline for those files is carried by Stylelint (see ADR 5).

## Open questions

- Why does `eslint-plugin-boundaries` v7 classify no file as an element under the current `settings["boundaries/elements"]`?
  - *Current lean:* The element `pattern` values are not matching the paths the plugin actually tests them against. Probe 3 rules out the policy list, the `@/` alias, and the `ignores` entry as causes.
  - *Resolves on:* A probe configuration with `{ default: "disallow", policies: [] }` flagging every import in a source file. That is the gate; no policy work is meaningful before it passes.

## Observed consequences

- 19 August 2026, **retracted the same day**: an earlier version of this entry recorded that a second fixture had been added at `src/entities/robot/__boundary-violation__/violation.ts` to prove the external-dependency policies mechanically. No such file exists in the tree. The entry was written ahead of the work and the work did not land, so the record asserted a proof the repository does not contain. The three external-dependency policies — entity against `react-dom`/`@mui/*`/`react-router*`, `shared-ui` against `@fleet/contracts`, `config` against `react`/`@mui/*` — remain unexercised by any fixture.
- 19 August 2026: Initial `boundaries/dependencies` configuration was written against assumed v5/v6 selector syntax. `pnpm lint` produced eleven deprecation warnings rather than errors, so the rule was running in a degraded compatibility mode rather than failing outright. Corrected to v7 object-based selectors, `{{ }}` template syntax, and `policies` naming.
- 19 August 2026: External-module matching (`entity` and `config` may not import React, MUI, or the router; `shared-ui` may not import `@fleet/contracts`) was initially written as `{ to: { source: "..." } }`, which is not a recognized selector shape in v7. Corrected to `{ to: { module: { origin: "external", source } } }`, with `disallow` as a single object per the plugin's documentation rather than an array.
- 19 August 2026: The violation-fixture test initially reported zero errors against a genuinely violating file. The root cause was compound. First, the fixture path was included in `eslint.config.js`'s top-level `ignores`, which the Node `ESLint` API's `ignore: false` option does not override. Second, `tsconfig.app.json`'s `paths` alias was nested outside `compilerOptions` and therefore inert, which combined with a missing `eslint-import-resolver-typescript` entry meant `@/`-aliased imports could not be resolved to a file the plugin could classify. The `paths` alias has since been moved inside `compilerOptions` and is live. The `eslint-import-resolver-typescript` entry is still absent from `eslint.config.js`, and the rule still reports nothing — see the entry below, which supersedes the claim that this was resolved. The general lesson stands and is why it is recorded: an unresolvable import produces silence rather than an error, and silence looks identical to a rule that does not work.
- 19 August 2026, amendment: While building `features/fleet`, the entity external-dependency disallow list (`react`, `react-dom`, `@mui/*`, `react-router*`) turned out to contradict `packages/web/CLAUDE.md`'s own directory table, which lists hooks as legitimate content for `src/entities/robot`. A hook requires `react` for `useMemo` and `useSyncExternalStore` even though it produces no JSX and imports no MUI. The disallow list is narrowed to `react-dom`, `@mui/*`, and `react-router*`; bare `react` is now permitted in the entity layer. This is judged safe rather than a loophole, because JSX syntax requires a `.tsx` file extension, and a lint rule forbidding `.tsx` files under `entities/**` was added to `eslint.config.js`. That makes JSX a lint error independent of any convention. The framework-coupling risk this policy prevents is rendering and routing, not the `react` import specifier itself.
- 19 August 2026, **verified**: `boundaries/dependencies` reports no violations under any configuration tried, so this ADR's central enforcement claim is currently false. Three probes, in order of increasing generality:
  1. The feature-to-feature fixture linted directly, with the top-level `ignores` entry removed so the file is genuinely in scope — zero messages.
  2. The same violation rewritten as a relative import (`../../robot/index`), removing any dependence on the `@/` alias or a resolver — zero messages.
  3. The rule reduced to `{ default: "disallow", policies: [] }`, which must reject every import in any file the plugin classifies — zero messages.

  Probe 3 is conclusive. No file is being classified as an element, so no policy of any shape can fire, and the fault is in `settings["boundaries/elements"]` rather than in the policy list. `pnpm test` fails accordingly: the fixture test asserts that a violation is reported, and none is. Status is moved from Implemented to Partial. The directory structure exists and the policy list is written; the enforcement is not running, and until it is, principle 9 is asserted here rather than enforced. Classification reference: `https://www.jsboundaries.dev/docs/classification/`.
- 19 August 2026: The Decision section previously read "Two permanent fixtures prove the rule runs," which described a tree state that did not exist. Reworded to state the requirement. The decision itself is unchanged: two fixtures, neither repaired nor deleted.
- 19 August 2026: The component-set specification's code sample for the status-mapping selector (`import type { StatusVariant } from "@/shared/ui"`) contradicted both its own prose and this ADR's boundary rule, under which an entity may import `shared-lib` but never `shared-ui`. Resolved by declaring a structurally identical string-literal union locally in `entities/robot/selectors.ts`, never imported from `shared/ui`, relying on TypeScript structural typing for assignment compatibility at the feature layer where both types meet. The component-set code sample carried the wrong import until `packages/web/UI_PLAN.md` revision 5 (19 August 2026), which replaced it with the locally declared union and stated the reason inline, so the sample no longer teaches the violation.

## Related

ADR 1 — adapter boundary and canonical model; makes this ADR's entity-layer prohibition mechanical rather than aspirational.
ADR 5 — MUI plus token layer; keeps this ADR's structural boundary and ADR 5's token-layer boundary from silently overlapping.
ADR 6 — authored the same day under the same write-before-code discipline.
Principle 1 ("domain rules have one authoritative implementation") — the entity layer's framework-independence, enforced here by the external-dependency policies that keep React DOM, MUI and the router out of it.
Principle 9 ("boundaries are enforced in the build") — this ADR is its primary implementation, and the violation fixtures are its evidence. All three structural claims the dependency rule carries fall under it: presentational primitives import no domain model, no feature reaches into another, and the rule fails the build rather than a reviewer.
Principle 13 ("configuration expresses deployment policy; code expresses stable behavior") — `config`'s external-dependency restriction is what keeps tenant configuration from acquiring framework logic over time.
Artifact `packages/web/eslint.config.js` — the `boundaries/dependencies` policy list.
Artifact `packages/web/src/features/fleet/__boundary-violation__/violation.ts` and `violation.test.ts` — the feature-to-feature enforcement proof.
Artifact `packages/web/src/entities/robot/__boundary-violation__/violation.ts` and `violation.test.ts` — the external-dependency enforcement proof.
Artifact `packages/web/CLAUDE.md` — "Where code goes" table and dependency-rule diagram; must stay textually consistent with the policy list here.
Artifact `packages/web/tsconfig.app.json` — the `paths` alias that `eslint-import-resolver-typescript` reads so `boundaries/dependencies` can classify `@/`-aliased imports; a broken alias silently defeats the rule rather than erroring.

## Notes

- 19 August 2026: decision recorded and implemented the same day. The configuration history is in Observed consequences.
