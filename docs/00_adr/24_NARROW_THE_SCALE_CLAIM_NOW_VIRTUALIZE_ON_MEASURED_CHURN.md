# ADR 24 — Narrow the fleet table's scale claim now; virtualize on measured delta churn

**Decision:** The fleet table keeps rendering one row per robot; the repository's scale claim is narrowed from "virtualized" to "correct at 500 rows, ceiling unmeasured", and virtualization is deferred until delta-apply cost has been measured against a live stream at 500 robots — at which point MUI's own data grid is evaluated before any other component.
**Status:** Decided · 2026-08-19 · Implemented (the narrowing; the deferral has no code)
**Group:** presentation / performance

## Issue

`packages/web/src/features/fleet/fleetPage.tsx` renders `filteredRobots.map(...)` with no windowing, against a ten-robot fixture. Principle 12 promises an interface that stays usable at real data volume, root `CLAUDE.md` instructs agents to "virtualize large lists", page spec 02 says "table (virtualized when needed)", and `docs/ARCHITECTURE_AUDIT.md` § 5 predicts the browser table is the **first** thing in the whole stack to choke — at roughly 300–500 rows, before the server, in a project whose deliverable is the console.

So the repository has a promise, an instruction, a spec line and a prediction, and no measurement behind any of them. The audit's own § 7 puts it plainly: virtualize, or withdraw the claim; the present state is not defensible. Register **D14** asked which.

## Assumptions

- The 300–500 row estimate is exactly that. It was formed against ten static robots with no delta stream, and nobody has seen this table at 500 rows in a browser.
- The workload that matters is not a static 500-row render. It is 500 rows re-rendering as deltas arrive, which is the state this console spends its whole life in.
- If the dominant cost turns out to be the page-level recompute on every delta — the filter pass, the summary, the latest-reading scan, all O(fleet) and all outside the table body — windowing the rows moves the ceiling by very little. Windowing removes row work, not parent work.
- A component that ships its own DOM and its own styling is a second styling system in everything but name.

## Constraints

- ADR 5: MUI plus design tokens is the styling decision. No second component or styling system.
- `packages/web/CLAUDE.md`: no dependency without an ADR of its own. That is a cost on option 1 whenever it is taken, not a reason to avoid it.
- Principle 6 / WCAG 2.2 AA: the table is semantic — `<table>`, `<tr>`, one link per row as the only activation path. Any windowing must keep row semantics, keyboard order and visible focus, and that has to be re-verified rather than assumed.
- Principle 12: unmeasured performance claims do not land. That cuts both ways — it forbids claiming a virtualized table, and it equally forbids adopting one on an estimate.
- The measurement needs a listening server and a fan-out. Neither exists (server **I2**), and [ADR 22](./22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md) built only the validation half of ADR 2's harness.

## Decision

**Option 3 now; option 1 once the transport exists.**

1. **The table is not virtualized, and the claim is narrowed to what can be defended.** The repository stops saying "virtualize the table" as a standing instruction and starts saying what is true: one row per robot, correct at 500, ceiling unmeasured. Root `CLAUDE.md`, `packages/web/CLAUDE.md`, page spec 02, package spec 05 and README § 10 are all corrected to that sentence and to this ADR.

2. **The 500-row behaviour is asserted rather than assumed.** `packages/web/src/features/fleet/fleetScale.test.tsx` renders 500 robots and asserts one row per robot, one activation path per row, fleet-wide summary counts, and that filtering still narrows to a single robot. That test is also the tripwire: virtualizing makes it fail, which forces the claim to be restated in the same commit.

3. **No duration is published from that test.** It runs in jsdom — no layout, no paint, no compositor — so a millisecond figure from it would be a fabricated ceiling. The file says so.

4. **Virtualization is deferred behind one specific number:** delta-apply cost at 500 robots under a live stream, taken with ADR 2's harness. When that number exists, **evaluate `@mui/x-data-grid` first**, on ADR 5 grounds, and measure whatever is chosen against ADR 22's bundle budget before adopting it.

## Positions

1. **Adopt a virtualization library now.** Solves scroll restoration, variable row heights and accessibility edge cases that a hand-rolled window gets wrong. Rejected _for now_, not on merit: adopting it today means optimizing a workload nobody has observed, and paying a dependency ADR, a bundle increase and a WCAG re-verification for a ceiling that may not move.
2. **Hand-roll windowing.** No dependency, no ADR. Rejected outright: the edge cases a library solves are the ones an accessibility audit finds later, and this table's semantics are load-bearing for Principle 6.
3. **Narrow the claim to the measured scale.** Selected for now. Honest, cheap, and it keeps the vertical slice the audit wants shipped first as the priority.

## Argument

The audit says the browser table chokes at 300–500 rows and, in the same row of the same table, names the cause: "no virtualization; **full re-render on every delta**". Those are two different problems and only one of them is fixed by windowing.

Rendering 500 rows once is a cost paid once. Re-rendering them 2,500 times a second is a cost paid continuously — and the parent's share of it does not shrink when the rows do. Every delta today re-runs `selectFreshnessSummary` over the fleet, the `latestReadingAt` scan over the fleet, and the filter pass over the fleet, and then re-renders `FleetPage`. Windowing the body removes the row work and leaves all three. If they dominate, a virtualized table is a dependency, a bundle cost and an accessibility re-verification bought in exchange for very little — and the actual fix is somewhere else entirely: batching deltas onto a frame, keying subscriptions per robot, or memoizing the row.

Nobody knows which it is, because the number that would say has never been taken. Taking it needs a server that fans out. So the honest sequence is: state what is true today, assert it in a test, and wait for the one measurement that distinguishes the two causes. That is not deferral as procrastination — it is refusing to spend a dependency on a guess, in a repository whose own Principle 12 says unmeasured performance claims do not land.

Narrowing the claim costs a graded promise, which is a real loss and the reason option 3 is uncomfortable. It is still the better trade: a stated smaller ceiling is defensible, and an unstated larger one is not. The claim that survives — 500 rows render correctly, with keyboard access and honest freshness — is now backed by a test, which is more than the "virtualized" claim ever had.

**Why MUI's own grid gets evaluated first.** ADR 5 chose MUI plus tokens and forbade a second styling system. A windowing library brings its own DOM and its own layout assumptions into the middle of a themed table, which is that second system arriving through a side door. `@mui/x-data-grid` has row virtualization in its MIT community tier, uses the same theme, and needs no second token mapping. It is not automatically the answer — it is a large dependency and it replaces the semantic `<table>` this page deliberately uses, so it has to be checked against Principle 6 and ADR 22's budget like anything else — but it is the first thing to measure, not the last.

## Implications

- **The repository now says one thing about this table in five places instead of four different things.** Root `CLAUDE.md`, `packages/web/CLAUDE.md`, page spec 02, package spec 05 and README § 10 all carry the narrowed claim and point here. An agent reading any of them no longer finds an instruction to virtualize.
- **A test now pins the unwindowed table.** `fleetScale.test.tsx` fails the moment rows stop being one-per-robot. That is deliberate friction: virtualization becomes a decision that must revisit this ADR, not a refactor that quietly invalidates five documents.
- **The claim that was withdrawn is a graded one.** Principle 12's "virtualize large lists" is not met and this ADR does not pretend otherwise. What is claimed instead — correct at 500 rows, ceiling unmeasured, one number named as the thing that would settle it — is smaller and true.
- **The deferred work has one owner and one trigger.** Server **I2** produces the measurement; register D10's deferred half wants the same run. Whoever builds the transport harness should produce both numbers from it, and this ADR reopens automatically when they do.
- **If the measurement shows the parent recompute dominates, the fix is not a component at all.** It is delta batching onto a frame and per-robot subscriptions, both of which `packages/web/CLAUDE.md` already asks for. In that case this ADR is superseded by a decision about the store, not about the table.
- **Whatever component is eventually adopted pays ADR 22's budget.** The console has 19% raw headroom at today's size; `@mui/x-data-grid` is not small, and "it fits" is now something CI decides rather than something a reviewer estimates.
- **Accessibility evidence has to be re-taken, not carried over.** The 500-row test asserts one activation path per row precisely because that is what a virtualized table most easily breaks — keyboard order across a window boundary, and focus on a row that has been unmounted while focused.
- **jsdom must never be cited as a browser measurement.** The scale test deliberately publishes no duration. If a later change adds one, it becomes the fabricated ceiling this decision exists to avoid.

## Open questions

- Does the parent-level recompute or the row rendering dominate at 500 robots under live deltas?
  - _Current lean:_ genuinely unknown, and the whole decision turns on it.
  - _Resolves on:_ server **I2**.
- Is `@mui/x-data-grid` acceptable under Principle 6 given it replaces the semantic `<table>` this page uses?
  - _Current lean:_ it must be verified against the page spec's activation and keyboard rules before adoption, not assumed from its documentation.
  - _Resolves on:_ the evaluation this ADR commits to, when the measurement arrives.
- Should the fleet-wide summary and the filter pass move out of the render path regardless of what the measurement says?
  - _Current lean:_ probably yes on clarity grounds alone, but not as a performance change made blind.
  - _Resolves on:_ the same measurement.

## Observed consequences

- 19 August 2026: the table renders correctly at 500 robots — 500 body rows, 500 activation links, fleet-wide counts of 125 in each freshness state, and a search filter that still narrows to one row. Asserted in `fleetScale.test.tsx`; four assertions, no timing.
- 19 August 2026: the row-count assertion was probed by rendering 30 robots while the test still expected 500 — a stand-in for a window — and all four assertions failed, including the summary counts (8 rather than 125). The tripwire works (Principle 15).
- 19 August 2026: no ceiling was published anywhere. `docs/ARCHITECTURE_AUDIT.md` § 5 keeps its 300–500 row estimate, explicitly labelled an estimate, and README § 10's rows stay empty.

## Related

- ADR 2 — owns the measurement commitment at 50 and 500 robots that this ADR waits on, and the fan-out whose delta churn is the workload in question.
- ADR 5 — Material UI with tokens only; the reason MUI's own grid is evaluated before any third-party windowing component.
- ADR 22 — the bundle budget any adopted component must fit, and the precedent for measuring what can be measured rather than publishing an estimate as a gate.
- ADR 18 — its deferred delta-granularity half waits on the same harness run; produce both numbers together.
- Principle 12 ("performance and observability are product behaviour") — this ADR narrows a claim made under it rather than leaving it unmet and unstated.
- Principle 6 (accessibility) — the constraint that makes hand-rolled windowing the worst option and makes any adopted grid re-verifiable.
- Requirement — register **D14**, resolved by this ADR.
- Artifact `packages/web/src/features/fleet/fleetPage.tsx` — unchanged by this decision, deliberately.
- Artifact `packages/web/src/features/fleet/fleetScale.test.tsx` — the evidence and the tripwire.
- Artifact `docs/ARCHITECTURE_AUDIT.md` § 4.3, § 5, § 7 item 4 — the findings this ADR answers without closing.

## Notes

- **In short, for the note the register asks for.** The table is not virtualized and now says so, in every document that used to say otherwise. What replaces the promise is a smaller claim with a test behind it: 500 rows, correct, keyboard-operable, ceiling unmeasured. Virtualization waits on one number — delta-apply cost at 500 robots against a live stream — because the audit's own diagnosis names two causes and windowing only fixes one of them. When that number arrives, MUI's grid is evaluated first, and whatever is chosen has to fit ADR 22's budget.
- The estimate in audit § 5 was not deleted. An estimate labelled as an estimate is useful; the failure this ADR corrects was letting it stand in for a decision.
