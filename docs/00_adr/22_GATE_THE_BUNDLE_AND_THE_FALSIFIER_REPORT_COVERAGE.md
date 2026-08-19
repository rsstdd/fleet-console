# ADR 22 — Gate the bundle and ADR 2's falsifier; report coverage

**Decision:** The console's first-load size and ADR 2's per-message validation falsifier are enforced gates with their derivations written in the files that enforce them; adapter test coverage is reported on every CI run and gates nothing.
**Status:** Decided · 2026-08-19 · Partial
**Group:** process / performance

## Issue

Three numbers in this repository read like rules and behaved like placeholders.

`packages/contracts` **C-5** measured what decoding at the client boundary costs the console — 491.70 kB → 567.32 kB raw, 154.33 → 175.01 kB gzip — and recorded that "there is no bundle budget in the repository yet (Principle 12 asks for one); this is the first number to hold one against." `packages/adapters` **D8** proposed failing the build under 90% coverage for `src/vendors/**` and, in the same file, wrote "it has no derivation." ADR 2 committed to measuring throughput and latency at 50 and 500 robots and stated — unusually — what would falsify its own estimate, then left its Observed consequences empty because no harness exists.

So: one number with no budget, one budget with no derivation, and one derivation with no measurement. Principle 12 asks for budgets; a budget nobody can defend is worse than none, because it is raised or deleted the first time it fails and teaches everyone present that the gates are decorative. Register **D17** asked which of the three are decisions.

## Assumptions

- An operator opens this console on a warehouse-floor tablet over shared site Wi-Fi, not on the workstation it was built on. That device and that network are what the budget is about.
- ADR 2's 2,500 msg/s design point (500 robots at 5 Hz) is the scale the validation cost has to be judged against.
- Coverage percentage is a weak proxy for whether vendor mappings are actually tested. The strong evidence for that is the adapter contract tests over recorded fixtures (ADR 13), which exist and are gated by the ordinary test run.
- CI runners are shared and noisy. Any timing assertion that runs there has to survive a busy machine or it will be deleted for flakiness, taking its argument with it.

## Constraints

- Principle 12: performance is product behaviour, and budgets are part of it.
- Principle 15: a rule that is not mechanically enforced is not a rule. A number that fails nothing is a comment.
- ADR 7's lesson: a check that reports nothing is indistinguishable from a check that passes. Any gate added here has to be probed by deliberate breakage.
- The harness ADR 2 commits to needs a listening server, and `packages/server` has no composition root yet. Whatever ships now must be honest about which part of that harness it is.

## Decision

**Gate the two numbers whose failure a human notices. Report the third.**

1. **Bundle — gated.** `scripts/checkBundleBudget.mjs` measures the JavaScript and CSS a first load must fetch and compile, and fails the build above **300 kB gzip** or **720 kB raw**. Both numbers are derived in the header of that file from a named device on a named network, and both are stated as consequences of that claim rather than of the current build. Fonts are measured and printed but not budgeted, because `unicode-range` subsetting means summing every emitted face counts bytes no first load fetches. CI runs it as `pnpm check:bundle` after the build.

2. **Validation cost — gated, at ADR 2's own threshold.** `packages/server/src/ingest/validationCost.test.ts` measures `JSON.parse` plus a strict canonical decode per message and fails above **400 µs**, which is the figure ADR 2 named as its own falsifier: more than that and validation alone consumes a core at 2,500 msg/s. The threshold is not tuned to the measurement and must never be; it is ADR 2's scale commitment expressed as an assertion.

3. **Adapter coverage — reported, never gated.** `packages/adapters/vitest.config.ts` carries no `thresholds` key, and says in a comment why. CI prints the coverage table into the job summary under a step marked `continue-on-error: true`, so a reported number cannot redden a build by accident. The 90% proposal is retired.

## Positions

1. **Ratify each number with its derivation.** Every gate lands with a sentence saying what it came from. Honest, and the right long-run answer — but it requires deriving a coverage threshold today, and the only derivation available would be another invented number wearing a justification.
2. **Measure and report, gate nothing.** No false authority anywhere. Rejected because it leaves Principle 12's "budgets" claim unmet and lets a slow slide pass unopposed; also because two of the three numbers _can_ be defended right now.
3. **Gate what has a consumer-visible failure; report the rest.** Selected.

## Argument

The three numbers are not alike, and treating them alike is what made the register entry necessary.

**The bundle is felt.** An operator waits for it, on a specific device, over a specific network. That makes a budget derivable rather than invented: name the device and the link, name the time you are willing to make someone wait, and the kilobytes fall out. This ADR names 2.0 seconds from navigation to the fleet table showing data, over ~3 Mbps of congested site Wi-Fi, on a mid-tier ARM tablet — 1.0 s transfer, 0.6 s parse and compile, 0.4 s for connection setup, paint and the first socket message. At 375 kB/s that is 375 kB on the wire, less 61.5 kB of latin font subsets a first paint requests, rounded down to **300 kB gzip** for code. At a conservative 1.2 MB/s of parse and compile for that device class, 0.6 s is **720 kB raw**.

Today's build is 584.75 kB raw and 176.88 kB gzip, so raw is the binding constraint — which is the honest outcome and worth stating plainly: on the device this console is actually used on, it is limited by the JavaScript it must compile, not by the bytes it must fetch. The headroom is deliberate. This gate exists to stop a step change — a charting library, a second icon set, a map SDK pulled in whole — not to police kilobytes of drift. Policing drift is what a ratchet does, and a ratchet is the gate that gets raised the first time it fails.

**The validation cost was already argued.** ADR 2 did the rare thing and wrote down what would prove it wrong. That makes the number a decision this ADR only has to wire up: it comes from the scale commitment, not from the current measurement, and it cannot drift with the code. Measured today, one message costs **5.8–6.4 µs**, so at 2,500 msg/s validation consumes about **1.5% of one core** — ADR 2's "tens of microseconds" estimate was right and slightly conservative, and its competing candidate, per-request HTTP overhead, remains the thing to measure. The 60× margin is also what makes the assertion safe on a shared runner: it will not fail because CI was busy, only because something structural changed.

**Coverage was never argued, and today it would measure nothing.** The proposed gate covered `src/vendors/**`, which currently contains three recorded JSON fixtures and one enforcement fixture and **no TypeScript at all**. A 90% threshold there would report a pass while measuring an empty set — precisely the ADR 7 failure, where silence is indistinguishable from a passing check, and worse than the absent gate it replaced because it would have looked like assurance. The whole-package number is 94.25% of statements today, so the threshold would also have passed for reasons unrelated to what it claimed to protect. Report it, watch it, and derive a threshold if and when adapters ship with materially untested mappings.

The register's stated falsifier for this recommendation stands unchanged: adapters shipping with materially untested vendor mappings would justify deriving a real coverage threshold rather than deleting an invented one.

## Implications

- **Two numbers now have a home that can fail, and one has a home that cannot.** The derivation lives in the enforcing file in both gated cases — the budget arithmetic in the header of `checkBundleBudget.mjs`, ADR 2's threshold in `validationCost.test.ts` — so a reader who hits the failure finds the argument in the same place as the number, not one document away.
- **Raising the bundle budget is a claim about the operator's hardware.** The failure message says so. That is the intended cost of raising it: not a config edit, but an argument in this ADR that the warehouse tablet or the site Wi-Fi is different from what is written here.
- **The validation gate is a falsifier and must never become a ratchet.** If someone tightens 400 µs toward the measured 6 µs, this repository acquires exactly the undefended threshold the decision removed. The test says this in a comment; it is not otherwise enforceable.
- **What is measured is not the full harness, and the ADR 2 rows stay empty.** Per-request HTTP overhead and the vendor schema decode are missing, because there is no listening server and no vendor adapters. The throughput, latency, fan-out and memory rows in `README.md` § 10 remain blank, and `docs/ARCHITECTURE_AUDIT.md` § 5 remains estimates. This ADR closes the validation question and no other.
- **The bundle number this repository quotes changes slightly.** `checkBundleBudget.mjs` compresses at gzip level 9 and sums JS with CSS; Vite reports JS alone at its own default level. Both are correct measurements of different things: 176.88 kB (gated, code) versus 175.10 kB (reported by the build, JS). Quote the gate's number when talking about the budget.
- **Coverage is now reported in a place a human reads.** The CI job summary carries the table on every run. If nobody looks at it for a quarter, that is evidence about the number's value, and the honest response is to delete the step rather than to promote it to a gate.
- **`continue-on-error` is load-bearing.** It is what keeps the reported number from becoming a gate through a flake — a coverage step that can fail the build is a gate with extra steps. The coverage run also needs a raised test timeout, because the lint-enforcement tests run ESLint programmatically and take seconds each under v8 instrumentation.
- **The deferred half of ADR 18 and the virtualization call in D14 are still blocked.** Both wait on the transport half of the harness, not on this one. Nothing here unblocks them, and this ADR should not be cited as though it had.
- **One more root-level script exists.** `scripts/` now holds a Node script that CI depends on; it is checked by Prettier and by nothing else. If a second one lands, the pair deserves a lint configuration rather than a convention.

## Open questions

- Should the bundle gate also cover the fonts a first paint actually requests, rather than excluding all of them with the subsetting argument?
  - _Current lean:_ no. The three latin subsets are already inside the transfer arithmetic, and a check that has to know which faces first paint requests would encode a guess about locale into CI.
  - _Resolves on:_ a non-latin tenant, which would change both the guess and the budget.
- Does the coverage report get read?
  - _Current lean:_ unknown, and worth watching rather than assuming.
  - _Resolves on:_ a quarter of runs, or the first time someone cites the number in a review.
- Should the validation harness measure the vendor schema decode as well, once vendor adapters exist?
  - _Current lean:_ yes, in the same test, keeping the same threshold. The canonical decode measured today is an upper bound on a vendor payload's, so adding the vendor path should not move the verdict.
  - _Resolves on:_ adapters **B1**–**B3**.

## Observed consequences

- 19 August 2026: measured 584.75 kB raw / 176.88 kB gzip of first-load code against the 720 / 300 budget — 19% and 41% headroom. Fonts, excluded, total 417.40 kB emitted across every subset and weight.
- 19 August 2026: measured 5.8, 6.1, 6.1 and 6.4 µs per message across four runs against ADR 2's 400 µs falsifier. ADR 2's estimate survives its own test; see that ADR's Observed consequences.
- 19 August 2026: adapter coverage at the moment the threshold was retired — 94.25% statements, 86.36% branches, 100% functions, 98.64% lines. The retired gate would have passed, which is the point: it would have passed while measuring a directory containing no TypeScript.
- 19 August 2026: both gates probed by deliberate breakage (Principle 15). Lowering the raw budget to 500 kB failed the build with the derivation restated in the error; lowering the validation threshold to 1 µs failed with `expected 6.591142 to be less than 1`. Running the budget script with no build present fails with an instruction to build rather than passing on an empty directory. All three were restored immediately.

## Related

- ADR 2 — states the falsification threshold this ADR wires to CI, and owns the harness whose transport half is still missing. Its Observed consequences now carry the validation measurement.
- ADR 7 — the lesson that an inert check is indistinguishable from a passing one; the reason the coverage threshold over an empty directory was rejected rather than kept as harmless.
- ADR 13 — recorded fixtures with a CI drift guard; the real evidence that vendor mappings are tested, which is why a coverage percentage does not need to carry that weight.
- ADR 17 — the most recent measurement of the console's bundle before this budget existed (567.36 → 568.32 kB raw), taken by hand; this ADR is what makes such measurements automatic.
- Principle 12 ("performance and observability are product behaviour") — this ADR is the first budget in the repository that can fail a build.
- Principle 15 ("rules are enforced mechanically") — satisfied here by two gates that were probed, and deliberately not claimed for the coverage number.
- Requirement — register **D17**, resolved by this ADR.
- Artifact `scripts/checkBundleBudget.mjs` — the bundle gate and its derivation.
- Artifact `packages/server/src/ingest/validationCost.test.ts` — the validation gate and ADR 2's threshold.
- Artifact `packages/adapters/vitest.config.ts` — the absent threshold, and the comment explaining the absence.
- Artifact `.github/workflows/ci.yml` — where both gates and the report run.

## Notes

- **In short, for the note the register asks for.** Two numbers became enforceable because someone could say where they came from — an operator's tablet in one case, ADR 2's own arithmetic in the other. One number was deleted because nobody could, and because in its proposed form it would have measured an empty directory and reported a pass. The cost of this decision is that the console can grow 19% before anything complains, and that adapter coverage can fall without failing a build; both are accepted deliberately, and the reported numbers are where a reader would see either happening.
- The 90% figure is not preserved anywhere as a target. Recording it as "the number we used to want" would recreate the authority this decision removed.
