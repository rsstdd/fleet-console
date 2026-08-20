# ADR 29 — Third-Party Packages Are Admitted by a Reasoned Allow-List, Behind a Release-Age Quarantine

**Decision:** Every third-party package this workspace declares must appear in the allow-list in `scripts/checkDependencies.mjs` with a one-line reason, the same check rejects a declared dependency nothing imports and an import nothing declares, `pnpm-workspace.yaml` quarantines any version published in the last seven days, and CI fails on a known high-severity advisory.
**Status:** Decided · 2026-08-19 · Implemented
**Group:** Process / supply chain (what may enter the dependency tree, and on whose say-so)

## Issue

This repository's supply-chain rules were all deny-lists. `packages/server/eslint.config.js` names nine storage and broker packages ADR 2 and ADR 6 decided against. Each package's `no-restricted-imports` names the workspace siblings it may not reach. `pnpm-workspace.yaml` names the one postinstall script that may run.

A deny-list answers _did you add the thing we already thought of_. It cannot answer _did you add a single-use package for something the standard library already does_, because that package's name was never on anyone's list. `packages/adapters/eslint.config.js` had already written the argument against this shape for workspace imports — "naming the three current siblings instead would admit a fourth package by omission, which is the failure mode ADR 7 records: a rule that permits by silence is not a rule" — and then npm was governed by exactly that kind of rule.

The gap was measured rather than assumed. A probe file in `packages/adapters` importing an installed-but-unvetted package **passed `pnpm lint` with exit 0**. The same file importing an _undeclared_ package failed, with `TS2307` from `tsc` — so pnpm's isolated `node_modules` plus the compiler already covered phantom imports, and the uncovered case was precisely the properly declared dependency. That is the form in which an agent adds one.

Two further facts made this urgent rather than theoretical. `pnpm-workspace.yaml` carried a `minimumReleaseAgeExclude` list of nine versions while `minimumReleaseAge` itself was never set — `pnpm config get minimumReleaseAge` returned `undefined` — so the exceptions were live and the rule they excepted was not. And `packages/web` was carrying `@mui/icons-material` and `simple-git-hooks`, neither imported nor configured anywhere; the second was already recorded as `TODO.md` § P2.6, unactioned.

## Assumptions

- Additions to `package.json` are the least-reviewed diff line in a pull request. A dependency arrives with a plausible name and a green build, and the reviewer's attention is on the code that uses it.
- The failure worth preventing is ordinary, not exotic: a package pulled in for one function that `Array.prototype`, `Intl`, `node:crypto`, or an existing module in this repository already provides. Typosquats and compromised releases are the same event with worse consequences, not a different problem.
- A malicious or typosquatted version is most often discovered and pulled within days of publication, so delay is a real filter and not merely friction.
- `pnpm audit` reflects a database that changes without this repository changing. That is a genuine cost, not an oversight.

## Constraints

- **No new dependency may be added to police dependencies.** A tool adopted for this purpose would be self-refuting, and would be exempt from the rule it enforces.
- Principle 15: the rule is enforced by tooling, not by review memory. `.github/pull_request_template.md` already asked "No new dependency. If there is one, the ADR justifying it is linked here" — a checkbox, which is review memory with a box drawn round it.
- Principle 1: one authoritative implementation. The workspace import graph is already enforced by each package's ESLint config, so this check must not restate it.
- `TODO.md` § Priority 4 binds any gate added here: it must identify the failure it prevents, and must avoid "permanently noisy checks" and gates "whose result can change without a repository change".

## Decision

**An allow-list, in the file that enforces it.** `scripts/checkDependencies.mjs` holds every permitted package name against a `kind` and a `why`. A dependency absent from it fails CI with a message naming the judgment the reviewer has to make: whether a native API or an existing repository helper would have done instead. Workspace packages are deliberately absent — `workspace:*` specifiers are skipped, because their direction is already law elsewhere.

**Four kinds, because only one of them can be proven.** `import` is verified mechanically: the package declaring it must import it somewhere. `tool`, `types`, and `peer` name the reason no import exists — a command, the compiler, another package's runtime requirement. The limit is stated in the file: an unused `tool` entry survives this check, held only by its one-line reason. That is accepted against the false positives a heuristic for "is this CLI still run" would produce.

**The unused and phantom halves come free.** The same scan rejects a declared dependency nothing imports, and an import nothing declares. The first is what caught the two dead packages; the second duplicates a guarantee `tsc` already gives, cheaply, and holds it in one place where a future non-TypeScript file cannot slip past.

**A seven-day quarantine.** `minimumReleaseAge: 10080` in `pnpm-workspace.yaml`, in minutes, so a version published this week does not install. `scripts/checkDependencies.mjs` asserts the setting is present and positive, because the failure it repairs was a quarantine silently set to zero. Exclusions stay pinned to an exact version, so an exception expires when the version moves.

**Vulnerabilities gate at `high`.** `pnpm audit --audit-level=high --ignore-registry-errors` in CI. Not `low`: the useful signal is a known exploitable path in this tree, not a moderate advisory in a transitive dev tool that nobody can act on.

**No tool adopted.** `depcheck` and `knip` do the unused half well and neither does the vetting half. The scan is roughly eighty lines against a five-package workspace.

## Positions

1. **Allow-list with reasons, hand-written, plus quarantine and audit.** Chosen. It is the only option that makes admitting a package a reviewable act rather than a diff line.
2. **Extend the existing deny-lists.** Rejected. It fails against every name not yet thought of, which is the entire population of packages an agent might reach for.
3. **Adopt `knip` or `depcheck`.** Rejected as the primary mechanism, though better than nothing at the unused half. It would add a dependency to police dependencies, and would still leave the vetting question unanswered.
4. **Keep the PR-template checkbox and rely on review.** Rejected by Principle 15 and by evidence: the checkbox existed, and two unused packages sat in `packages/web` anyway.
5. **Quarantine only, no allow-list.** Rejected. Delay filters a compromised release; it does nothing about a perfectly legitimate package that should never have been added.
6. **`pnpm audit` at `low`, or `--prod` only.** Rejected in both directions. `low` is the permanently noisy check `TODO.md` warns against; `--prod` would exempt the toolchain, which is where an agent's additions actually land.

## Argument

The decisive question was not "which tool" but "what does the rule permit by silence". Everything already in place permits by silence, and one probe was enough to show it: exit 0 on an unvetted import. Once the rule is an allow-list, the reviewer is handed the one question they are qualified to answer — is this package doing something the platform does not — and the check does not need to be clever to force it.

The reason for a required `why` rather than a bare name list is the same reason `scripts/checkBundleBudget.mjs` carries its derivation: an entry with no argument behind it is one that gets copied. The reason is written for the reviewer of the _next_ addition, who reads the neighbouring lines to calibrate what a good justification looks like.

The audit step accepts the exact cost `TODO.md` § Priority 4 named. That is deliberate. A newly disclosed high-severity advisory in a shipped dependency is news, and the alternative is learning about it at the next unrelated bump. The mitigations are that the threshold is high, `--ignore-registry-errors` keeps an outage from reddening a build, and an advisory judged not to apply is recorded under `pnpm.auditConfig.ignoreGhsas` with its reasoning rather than worked around in the workflow.

The cost that is not mitigated is friction, and it is the intended product. Seven days means a genuinely needed patch may be blocked, and the first install under the policy proved the point immediately by rejecting ten entries. The escape hatch is a pinned, commented exception — visible, expiring, and arguable.

## Implications

- **Adding a package is now a two-file change**: `package.json` and the allow-list, with a sentence a reviewer can disagree with. That is the friction this ADR buys.
- **`packages/web` lost `@mui/icons-material` and `simple-git-hooks`.** The first was never imported; the second is `TODO.md` § P2.6, now closed by removal rather than configuration. `simple-git-hooks: false` also left `allowBuilds`, since the entry described a package that is gone.
- **`pnpm install` now verifies the committed lockfile against the quarantine**, not just new resolutions. A lockfile that bypassed the policy locally fails on the next install, which is stronger than intended and worth keeping.
- **`minimumReleaseAgeExclude` gained ten grandfathered entries**, dated and explained in place.
- **The allow-list must not become an inventory.** An entry with no dependency behind it pre-approves a future addition nobody reviewed, so the check rejects that too.
- **A fourth workspace package needs no entry here**, and a fourth vendor still needs no contracts change (ADR 1). This gate is about npm only.
- **`scripts/` is scanned as the root package's source**, which means a script that fabricates import syntax reports itself. The test does its fixtures by assembly for that reason, with the incident recorded in a comment.

## Open questions

- **Should `tool` entries get a mechanical usage proof?** A binary-name-in-scripts check would cover `typescript` and `vite` and would not cover `@vitest/coverage-v8`, which is loaded by a flag. Current lean: no, until an unused `tool` entry is actually observed surviving review.
- **Should the quarantine be seven days?** Chosen against published takedown timelines rather than a measurement in this repository. The event that would resolve it is a real security patch blocked by the window; nothing has been yet.
- **Should the audit gate move to a scheduled run instead of every pull request?** That would answer the "changes without a repository change" objection more completely, at the cost of learning later. Not taken now, because there is one workflow and adding a second is a bigger change than the problem currently justifies.
- **Does the allow-list belong in a data file rather than in the script?** It is in the script so the reasons can sit next to the check that reads them, matching `checkBundleBudget.mjs`. If a second consumer ever needs the list, that answer changes.

## Observed consequences

- **20 August 2026 — the list admitted its first post-adoption dependency through the front door (ADR 32).** `@playwright/test` entered with its reason written in the allow-list, at 1.62.1 — a release old enough to clear the seven-day quarantine, chosen over newer ones because of it. The check's skip list gained Playwright's generated `playwright-report/` and `test-results/` directories, which is the gate learning about a new tool's exhaust rather than being weakened by it.
- 19 August 2026: implemented. `pnpm check:dependencies` passes with 35 allow-list entries, all declared and all used; four tests, including a fixture workspace that carries one instance of each violation.
- **The gate caught a live addition on its first run.** `eslint-plugin-jsdoc` had been added to all five packages by the concurrent ADR 28 work and was not on the list. It is legitimate and was allow-listed; the point is that the check found it in the same run that found the two dead packages, without anyone knowing to look.
- **The first install under `minimumReleaseAge` failed**, rejecting ten lockfile entries younger than seven days — nine of them the dependency closure of that same `eslint-plugin-jsdoc@64.2.1`, published two days earlier. They are excepted by pinned version rather than reverted: the quarantine governs what enters next, and reverting another workstream's ratified tooling to satisfy a policy added after it is not that rule's job.
- **`pnpm audit --audit-level=high` reports no known vulnerabilities** against the current tree, so the step is green on adoption and its first red will be information rather than backlog.
- **The unused check reported its own test file** before the fixtures were assembled rather than written literally. The checker was right and the test was wrong, which is the better way round.

## Related

- **ADR 7** (module resolution for boundary enforcement) — the source of the "a rule that permits by silence is not a rule" argument this ADR applies to npm.
- **ADR 2** (transport) and **ADR 6** (no database) — own the deny-list in `packages/server/eslint.config.js`. That list stays: it names packages whose _addition would contradict a decision_, which is a different question from whether a package is vetted at all.
- **ADR 9** (workspace source exports and the tsx runtime) — why `tsx` is an allow-list entry and why `esbuild` is the one approved postinstall script.
- **ADR 22** (gate the bundle, report coverage) — the standard this ADR is held to: a gate states the failure it prevents and carries its derivation in the file that enforces it.
- **ADR 28** (a doc comment must say something the signature does not) — added `eslint-plugin-jsdoc` while this was being written; the first thing the new gate found.
- **Principle 15** ("enforced by tooling, not by review memory") — the PR-template checkbox this replaces is the clearest example of the thing that principle is about.
- **Principle 1** (one authoritative implementation) — the reason workspace packages are skipped here rather than restated.
- **`TODO.md` § Priority 4** items 1 and 6 — proposed unused-dependency detection and a vulnerability gate; both land here, item 1 without the tool it assumed.
- **`TODO.md` § P2.6** — closed by removing `simple-git-hooks` rather than configuring it.
