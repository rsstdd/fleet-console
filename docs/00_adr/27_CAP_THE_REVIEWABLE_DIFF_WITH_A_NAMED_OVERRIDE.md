# ADR 27 — Cap the reviewable diff, with a named override

**Decision:** A pull request's hand-written change — code and prose alike — is capped at 300 modified lines and enforced in CI, generated files excluded from the count, and a change that must exceed the cap passes only by naming itself in an `Oversized-diff:` commit trailer.
**Status:** Decided · 2026-08-19 · Implemented
**Group:** process / review

## Issue

This repository assumes agents write a large share of its code — `AGENTS.md`, the routing
table, the per-export doc comments and the boundary lint all exist for that reason — and
README § 8 states the claim plainly: "structure makes agent code checkable." Every
mechanism named there checks a property of the code. None of them checks the property of
the _change_ that determines whether a human ever finds a defect in it: its size.

An agent produces 2,000 correct-looking lines as easily as 200. The failure is not that
the lines are wrong; it is that nobody reads 2,000 lines the way they read 200. Review
degrades into confirmation, and what survives is exactly what needed a careful reader —
the unhandled boundary case, the branch no test covers, the function nothing calls. Dead
code is the visible half of this; the subtle edge-case failure is the half that ships.

`AGENTS.md` already says "Small focused diffs. Do not drive-by refactor." That is a review
convention, and Principle 15 is explicit that a review-only rule is a convention rather
than a guarantee. ADR 7 records what this repository already paid for trusting one: the
`boundaries/dependencies` rule sat inert for most of the project's life while reporting
nothing, and silence was indistinguishable from passing.

The question is therefore not whether small diffs are better. It is whether this one gets
a mechanism, and at what number — because ADR 22 has already ruled that a threshold
without a derivation is worse than no threshold, having retired an undefended 90% coverage
figure on exactly that ground.

## Assumptions

- A reviewer reads a pull request in roughly one sitting. A change that cannot be finished
  in one sitting is either split by the reviewer, deferred, or approved unread; the third
  outcome is the common one and the reason this ADR exists.
- Careful reading — the kind that finds a defect rather than confirming a shape — runs at
  roughly **300 lines per hour**. This is the softest input in the derivation and is named
  as such below.
- Generated output is not read by anyone. A recorded fixture (ADR 13) and the generated
  decision index are verified by the tooling that produces them, not by a human eye.
- Documentation in this repository is load-bearing. ADRs and package specifications carry
  decisions that code obeys, so a 2,000-line ADR is as unreviewable as 2,000 lines of
  TypeScript, and for the same reason.

## Constraints

- ADR 22's standing rule binds: gate a number you can derive, report one you cannot. A gate
  here requires a derivation in the file that enforces it.
- `TODO.md` § Priority 4 forbids "arbitrary percentages or permanently noisy checks."
- Some necessary changes cannot be small. The initial import of this repository's
  implementation is roughly 21,000 lines of source and 6,000 of markdown (`TODO.md`
  **P0.3**); a tree-wide rename is indivisible by nature. A gate a necessary change cannot
  pass is a gate that teaches people to bypass it.
- The check must run from `git` alone. It cannot depend on the GitHub API, because it also
  has to be runnable locally before a branch is pushed.

## Decision

**Gate the number, derive it, and make the exception say its own name.**

1. **The cap is 300 modified lines**, counted as additions plus deletions across the pull
   request's full range against its base — not per commit, because a change split into
   twelve commits is still one thing to review.

2. **Code and prose both count.** TypeScript, JavaScript, CSS and Markdown are all
   hand-written and all read by a human.

3. **Generated files do not count**, because nobody wrote or reads them: `pnpm-lock.yaml`,
   the recorded vendor fixtures under `packages/adapters/src/vendors/*/__fixtures__/`
   (ADR 13), and `docs/PENDING_ARCHITECTURE_DECISIONS.md`, which `AGENTS.md` forbids
   editing by hand. Counting these would spend the budget on the output of
   `pnpm record:fixtures` and `pnpm docs:decisions` — two commands other ADRs require.

4. **The override is a commit trailer**, `Oversized-diff: <reason>`, in any commit in the
   range. It passes the gate and is permanent, greppable history: `git log --grep` returns
   every change that has ever claimed the exception, with the author's reason attached.

5. **`scripts/checkDiffSize.mjs` carries the derivation in its header**, in the form ADR 22
   established for `scripts/checkBundleBudget.mjs`: the number is stated as a consequence
   of a named claim, so moving it means changing that claim in the open.

## Positions

1. **Do nothing; keep `AGENTS.md`'s "small focused diffs" as a convention.** The status
   quo.
2. **Report the number, never gate it** — ADR 22's treatment of adapter coverage.
3. **Gate hard, with no override.**
4. **Gate with a named override.** _Chosen._
5. **Gate on files changed rather than lines.**
6. **Gate on a per-file cap as well as a total.**

## Argument

**Against 1**, Principle 15 decides it: the principles are enforced by tooling, not by
review memory. The specific failure this addresses — a large, plausible, agent-written
change — is the one a human reviewer is _least_ able to catch unaided, because the defect
is hidden by the same volume that exhausts the reviewer. A convention that fails precisely
when it is most needed is not a control.

**Against 2**, the difference from adapter coverage is that this number _can_ be derived,
so ADR 22's rule points the other way. The second reason is behavioural: a reported
coverage percentage still describes work already done, whereas a reported diff size
changes nothing about the author's decision to write 2,000 lines. Nobody has ever been
deterred by a number printed after the fact.

**Against 3**, the constraint above is decisive. **P0.3** cannot comply, and neither can a
rename. A gate that a necessary change cannot pass is bypassed once, and the bypass is the
habit thereafter — which is ADR 22's own account of why an undefended threshold gets
raised the first time it fails.

**For 4**, the override converts an unavoidable exception from a silent one into a recorded
one. This is the same move ADR 13 makes for fixtures and ADR 16 for the test-only adapter
dependency: the escape hatch exists, and using it leaves evidence. An author who writes
`Oversized-diff: initial import of the implementation tree` has said something true and
checkable; an author who writes it on a 900-line feature has to look at that sentence
first, which is most of the value.

**Against 5**, file count measures the wrong thing in both directions. Thirty one-line
files is a rename and reviews in minutes; one 800-line file is the case this ADR is about.

**Against 6**, not yet — it is a second threshold, and this ADR only has a derivation for
one. Recorded as an open question rather than guessed at.

### The derivation

The cap is a **reviewer-attention budget**, not an aesthetic preference about code size:

- **Unit:** one reviewer, one uninterrupted sitting, taken as **60 minutes**. Beyond that
  the reviewer is either interrupted or tired, and both end the careful reading.
- **Rate:** **300 lines per hour** of careful, defect-seeking reading — the pace at which a
  reader is checking a change rather than confirming its shape. Skim rates are several
  times higher, which is the point: above this rate the reading that happens is not the
  reading the gate is trying to buy.
- **Therefore:** 60 min × 300 lines/h = **300 lines**. One pull request is one sitting.

**The falsifier, stated because the rate is the soft input.** If pull requests at the cap
routinely take a reviewer far less than an hour _and_ defects keep surfacing afterwards in
tests or production, the rate is wrong and the cap is too high — lower it and say so here.
If pull requests well under the cap merge with no comments at all, then review volume was
never the binding constraint, this gate is theatre, and the honest response is to delete it
rather than to tune it. Either observation belongs under `## Observed consequences`.

## Implications

- **`TODO.md` P0.3 will need the override, and that is the intended outcome.** The initial
  import is ~27,000 lines. It should land as an explicit, named exception rather than as a
  change that quietly proved the gate optional on its first encounter.
- **Documentation work will hit this.** The P0.2 reconciliation pass on 19 August 2026
  rewrote roughly 500 lines of markdown with no code at all, and would have required the
  override. This follows directly from counting prose, which is deliberate: an unreviewably
  large ADR is the failure mode this repository is most exposed to, not least.
- **The gate reads the whole PR range**, so splitting one change across commits does not
  evade it, and rebasing does not change the number.
- **The override is author-asserted.** Nothing verifies that the reason is honest. The gate
  buys deliberation and an audit trail, not authorization; treating it as approval would be
  the Principle 7 mistake in a different setting.
- **A new CI step and script**, registered under `mechanicalRules` in `docs/decisions.json`
  and citing this ADR, per `AGENTS.md`.
- **The check runs locally too**, as `pnpm check:diff-size`, so an author learns the answer
  before pushing rather than from a red build.

## Open questions

- **Should the override require a reviewer rather than the author?** Current lean: no,
  while this repository has a single author. Resolved by the first PR where the override is
  used to wave through work that should have been split.
- **Does a per-file cap earn its place alongside the total?** Current lean: no derivation
  exists for one, so no. Resolved if a compliant 300-line PR still proves unreviewable
  because it is concentrated in a single file.
- **Should test files count at full weight?** Current lean: yes, unexamined — a large test
  file is read, and Principle 10 makes tests load-bearing. Resolved if the cap starts
  discouraging tests, which would be strictly worse than the failure it prevents.

## Observed consequences

**19 August 2026 — all four behaviours were exercised against real commits**, in a
throwaway repository rather than by reasoning about the code, because the failure mode
this gate protects against is precisely a check nobody watched fail (ADR 7):

| Case                                              | Result                                        |
| ------------------------------------------------- | --------------------------------------------- |
| 400-line change, no trailer                       | fails, exit 1, with the split-or-declare text |
| the identical change with `Oversized-diff:` added | passes, exit 0, reason echoed                 |
| 1-line change                                     | passes, counted as 1                          |
| 500 lines of recorded fixture (ADR 13 output)     | passes, counted as **0**                      |

The second and first cases differ only by the trailer, which is the property worth
probing: the gate must turn on the declaration and on nothing else.

**19 August 2026 — the check measures commits, not a working tree.** `git diff base...HEAD`
cannot see untracked or uncommitted files, so running it locally before committing reports
less than the change actually contains. That is correct for its purpose — it budgets a
pull request — but it means a local run is a preview rather than a verdict, and only the
CI run against a pushed branch is authoritative.

**19 August 2026 — the decision's own change is inside its budget**, excluding this
repository's pre-existing uncommitted documentation work, which predates the gate. A gate
whose introduction could not satisfy itself would have argued against its own number.

## Related

- `ADR 22 — gate the bundle and ADR 2's falsifier; report coverage` — supplies the rule
  this decision is held to (derive it or report it) and the header form the enforcement
  script follows.
- `ADR 13 — recorded fixtures with a CI drift guard` — produces output excluded from the
  count, and is the precedent for an escape hatch that leaves evidence.
- `ADR 7 — module resolution for boundary enforcement` — records the inert-rule failure
  that argues against leaving this as a convention.
- `Principle 15 ("the principles are enforced by tooling, not by review memory") — this
ADR converts an existing AGENTS.md convention into a mechanism.`
- `Principle 10 ("tests prove behaviour at the cheapest reliable boundary") — the counting,
exclusion and override parsing are pure functions with a test, rather than logic that
only runs in CI.`
- `Artifact scripts/checkDiffSize.mjs — the enforcement file; carries the derivation.`
- `Artifact TODO.md P0.3 — the change that will need the override first.`

## Notes

The number is a budget for a reader, not a claim about how much code a change should
contain. A 900-line change is not forbidden; it is required to say that it is a 900-line
change. That distinction is the whole design, and it is why the override is a sentence
rather than a flag.
