# Architecture audit

**Authority:** Historical. This point-in-time audit preserves evidence, but current ADRs, the generated decision index, and package specifications supersede its status claims.

**Created:** 19 August 2026
**Status:** Findings only — nothing here is a ratified decision. Items that imply a
decision belong in an ADR or in [`PENDING_ARCHITECTURE_DECISIONS.md`](./PENDING_ARCHITECTURE_DECISIONS.md).
**Method:** Read the accepted ADR set, page/component/package specs, and `PRINCIPLES.md`,
then checked each claim against the code rather than against the documentation describing it.

Scale figures in § 5 are **estimates, not measurements**. No harness exists yet; ADR 2
commits to building one, and these numbers should be replaced by its output.

Every finding below was verified against the working tree on 19 August 2026. Several
packages are under active construction, so re-verify before acting on an old finding.

**Reading the status lines.** The findings themselves are frozen as written — this is a
dated record, not a live tracker, and editing a finding to match today would destroy the
evidence of what was true when it was made. Instead every finding carries a
`> **Status**` line recording where it stands now, so an unannotated item cannot be mistaken
for an unresolved one. A status line says three things: whether the finding is open, which
ADR closed it if one did, and — where the finding recommended a course of action —
whether that recommendation was taken or declined. § 1 and § 3 carry none, because they
assess rather than find; every item in § 2 and § 4 through § 8 carries one. The authority is
[`PENDING_ARCHITECTURE_DECISIONS.md`](./PENDING_ARCHITECTURE_DECISIONS.md) and the ADR set;
these lines are pointers into them.

---

## 1. Does the design make sense?

Yes, and the thesis is sharper than the norm for a project of this size. It selects two
genuinely hard problems and refuses the cheap answer to both.

**Freshness (ADR 3) is the strongest idea in the repository.** Recomputing freshness when
a message arrives cannot detect the absence of messages. The ADR states that in one
sentence and designs around it. The corollary matters as much as the decision: while the
socket is down the console suppresses per-robot labels rather than degrading every row,
because a client-side timer would report every robot as UNREACHABLE when the console's own
socket died — attributing the console's blindness to the machines. That distinction is
what an operator acts on, and most systems never draw it.

**The capability model (ADR 1) is the second.** `Partial<Record<CapabilityName, Payload>>`
where key presence _is_ the declaration, with an array of discriminated entries as the wire
form, is a real answer to "how do I keep `if (vendor === 'C')` out of a component."

## 2. Does it work?

**No — not end to end.** The demo the repository is organized around has never run.

| Package     | Reality                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `contracts` | Complete and tested                                                    |
| `simulator` | Complete; emits into a closed port                                     |
| `adapters`  | **Zero vendor modules.** Core primitives only                          |
| `server`    | Store, ring buffer, sweep, delta set, config — **no composition root** |
| `web`       | Fleet page and robot detail built against a **10-robot fixture set**   |

`pnpm dev` starts the simulator and the console. They are not connected to each other.

This is stated accurately in `README.md` § 2 and its Built/Not-built table. The
documentation is not overstating the state — but the normalization argument the project
rests on is currently unexercised, because no adapter exists to normalize anything.

> **Status · 19 August 2026 — unchanged, and that is the finding worth keeping.** Re-verified
> after ADRs 10–29: `packages/adapters/src/vendors/` has grown `a/`, `b/` and `c/` directories,
> but they hold recorded fixtures and one enforcement fixture and still no vendor module;
> `packages/server/src/index.ts` says in its own header that the composition root does not exist;
> `useFleetRobots` still returns ten hardcoded rows. Every decision resolved since this audit was
> a contracts-, configuration- or enforcement-layer decision, which is precisely why none of them
> moved this table. The demo still has never run.
>
> [ADR 21](./00_adr/21_ENDPOINTS_FROM_THE_ENVIRONMENT_WITH_A_DEV_PROXY.md) narrowed the
> reason for one row. "`simulator` emits into a closed port" was previously two problems —
> nothing said which port, and nothing was listening. The first is now decided and built:
> three packages agree on one address, and the console's dev proxy was verified forwarding
> `/api` and upgrading `/ws` against a real server. What remains is the composition root that
> would open the port, which is ADR 8's and still Not started.

## 3. What the project does well

**ADR reasoning quality is above production norm.** Rejected positions carry their reasons,
open questions carry explicit "resolves on" criteria, and Observed consequences are amended
when reality disagrees. ADR 7 is the model: the dependency rule had been silently inert for
the repository's whole life, someone recognised that "reports nothing" and "passes" are
indistinguishable, found the real cause, and recorded that the previous diagnosis had been
wrong.

**Enforcement is real, not aspirational.** The `__boundary-violation__` and `__enforcement__`
fixtures fail lint deliberately. The contracts import ban fires when probed. The
compile-time capability assertions fail `tsc` when the name-to-payload mapping is broken.
Principle 15 is honoured rather than asserted.

**Honesty is implemented, not only argued.** An em dash instead of a stale battery number,
`(last known)` carried in the accessible name, a refusal to render `Invalid Date`, and — the
sharpest of them — rendering a robot that is _not evaluated_ for sequence gaps distinctly
rather than showing "0 gaps." That last distinction is one almost nobody makes.

**`packages/contracts` is production quality.** Strict schemas with no coercion, duplicate
capability entries rejected rather than resolved last-write-wins, and a wire/runtime codec
proven by round-trip tests at 100% branch coverage.

## 4. Flaws

### 4.1 The ADR statuses are stale

ADR 1, ADR 3, and ADR 6 all read **"Not started."** All three are substantially
implemented: ADR 1's envelope and capability codec, ADR 3's `deriveFreshness` and the server
sweep, ADR 6's current-state store and ring buffer.

In a repository whose thesis is that documentation is a control system, the control system
is out of date about itself. This is the cheapest finding here to fix and the most damaging
to leave.

> **Status · 19 August 2026 — open, and now the oldest untaken item here.** Still true, and now
> measurable against a contrast twenty records long: ADR 1, 2, 3, 6 and 8 read "Not started"
> while substantially implemented, whereas every ADR written since (10–29) carries an accurate
> `Implemented` / `Partial` status and amends it when reality disagrees. None of the five
> headers has been touched.
>
> The tracking moved. This item was previously tracked in
> [`PENDING_ARCHITECTURE_DECISIONS.md`](./PENDING_ARCHITECTURE_DECISIONS.md) § "Existing ADR
> reconciliation required alongside these decisions", a section that no longer exists: that file
> is now generated from `docs/decisions.json` and carries nothing but the stub-to-ADR table.
> **The item did not land anywhere else** — root `TODO.md` does not carry it, and no ADR does.
> That is worth recording as a finding in its own right: generating the register made it correct
> and unforgeable, and silently dropped the prose items it had been carrying beside the table,
> including the one tracking this. Re-filed in `TODO.md` on the archive pass of 19 August 2026.

### 4.2 Eight unresolved cross-package decisions

`PENDING_ARCHITECTURE_DECISIONS.md` is the largest document in `docs/` and holds D1–D8
unratified. **D1 is the shape an adapter returns** — the adapter/server seam itself — and it
is open while both packages are being built against it.

> **Status · 19 August 2026 — closed; all twenty resolved.** "Eight" was the count of what had
> been _found_, not of what existed: a later exhaustiveness pass took the register to D1–D18, and
> two more were added afterwards (D19, D20). Every stub D1–D20 is now a tombstone routing to a
> numbered ADR — ADRs 10–29 plus an amendment to ADR 8 — and **D1, the item named here, was the
> first to close** ([ADR 10](./00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md)), without waiting for
> the vertical slice § 7 expected to force it. The last two open when this line was first written
> have since closed: **D12** by
> [ADR 25](./00_adr/25_CONTRACTS_OWNS_EVERY_DECODED_RESPONSE_COUNTERS_BY_SCOPE.md) and **D18** by
> [ADR 26](./00_adr/26_RAW_PAYLOAD_BOUNDED_VERBATIM_AND_UNPROTECTED_BY_DECISION.md).
>
> Read "resolved" narrowly. It means each question has a weighed record with its rejected
> positions and a falsifier, not that each is built:
> ADR 8 is still `Not started`; nine of the twenty are `Partial`. The finding's other half has
> inverted — the register is no longer the largest document in `docs/` but the smallest, a
> generated thirty-four-line index. The volume it used to hold moved into the ADR set, which is
> § 4.6's finding, not a reduction.

### 4.3 Principle 12 is unmet and untested

Principle 12 requires virtualized lists and a table usable at several hundred robots.
`packages/web/src/features/fleet/fleetPage.tsx` renders `filteredRobots.map(...)` — a plain
map with no windowing. With a 10-robot fixture set, the table has never been seen at 500
rows.

> **Status · 19 August 2026 — answered in part, by narrowing rather than by building.**
> **D14** is resolved as [ADR 24](./00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md):
> the table stays unwindowed and every document that claimed otherwise now says so. What replaces
> the claim is smaller and tested — `fleetScale.test.tsx` renders 500 robots and asserts 500 rows,
> 500 activation links, fleet-wide counts and a filter that still narrows to one. So "the table has
> never been seen at 500 rows" is no longer true, and "Principle 12 is unmet" is now stated rather
> than implied. The 300–500 row estimate in § 5 is untouched and still an estimate: this finding
> closes only when delta-apply cost at 500 robots is measured under a live stream, which is the
> half of ADR 2's harness [ADR 22](./00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md)
> did not build. The reasoning for waiting is in this section's own diagnosis: the cause named
> beside "no virtualization" is "full re-render on every delta", and windowing addresses only the
> first.

### 4.4 `sequence` breaks the capability model on its first day

`sequence` is a member of `CapabilityName`, but it is transport metadata rather than a
machine capability, so page spec 03 § 6 must explicitly carve it out of the capability
panels. The rule "render exactly the capabilities the adapter declared" already carries an
exception. It would be better modelled as nullable envelope metadata.

> **Status · 19 August 2026 — resolved, by a different route than the one recommended here.**
> [ADR 19](./00_adr/19_CAPABILITY_KIND_SPLITS_THE_NAME_SET_IN_CONTRACTS.md) keeps `sequence` a
> capability and instead classifies _every_ capability `operator` or `diagnostic` in a total
> `CAPABILITY_KINDS` mapping in `packages/contracts`, deriving both name sets from it; the
> console's panel registry keys off the operator-facing set, so an unclassified capability fails
> to compile in contracts and an operator capability without a panel fails to compile in the
> console.
>
> **The recommendation — nullable envelope metadata — was weighed as option 2 and declined.** It
> is a contracts change touching every adapter and the web mapper, and it discards a genuinely
> per-vendor fact: Vendor B sends no sequence, and ADR 1's Vendor B capability profile is argued
> from that absence. The finding's diagnosis was right and understated the severity — the
> carve-out was not one exception in a page spec but three uncompared copies in `packages/web`,
> including a duplicate of `CAPABILITY_NAMES` that had been correct only by coincidence.

### 4.5 "Adding a vendor never means editing contracts" is oversold

True only for a vendor that reuses existing capabilities. `CapabilityName` is a closed
union, so a vendor with a genuinely new sensor is a contracts change, a web panel change,
and a schema-version conversation. ADR 1's Implications admit this; the headline claim does
not.

> **Status · 19 August 2026 — open, and the claim is unchanged.** `CapabilityName` is still
> closed. [ADR 19](./00_adr/19_CAPABILITY_KIND_SPLITS_THE_NAME_SET_IN_CONTRACTS.md) made the
> cost more explicit rather than smaller: adding a capability is now four steps, three of which
> fail to compile if skipped. No register stub owns this — it is an accuracy defect in ADR 1's
> headline against its own Implications, not a pending decision, and belongs with § 4.1's
> reconciliation work.

### 4.6 The prose is where the defects live

Roughly **8,400 lines of documentation against ~7,500 lines of source**, and the defects
found so far have all been in the prose: wireframe copy that had drifted from the component
spec, a 3-robot fleet manifest describing a 50-robot fleet, and the simulator's
`--print-manifest` emitting `vendor` where the server's loader requires `vendorId`. Each was
invisible until something executed against it.

> **Status · 19 August 2026 — open as an observation; two of its three examples are closed.**
> [ADR 14](./00_adr/14_SHARED_FLEET_ROSTER_PARITY.md) fixed both manifest defects in one change:
> `config/fleet-manifest.json` now carries 50 entries, `--print-manifest` emits `vendorId`, and
> the two are asserted equal from both ends in CI so neither can drift back silently.
>
> The ratio the finding rests on has since moved **further** toward prose, not back — ADRs 10–29
> add 2,166 lines against a few hundred lines of source. That is the finding confirming
> itself rather than being answered, and § 8's correction still applies: the answer is executing
> the slice that makes the prose checkable, not writing less of it.
>
> One class of prose defect did become mechanically impossible after this was written.
> [ADR 28](./00_adr/28_BAN_DOC_COMMENTS_THAT_RESTATE_THE_SIGNATURE.md) lints out doc comments
> that only restate the signature they sit on, in all five packages. Note the size of that bite
> against the finding: it catches comments that say _nothing_, and cannot catch a comment that
> confidently says something false, which is the defect every example above actually is.

### 4.7 Three of five non-negotiables are unexercised

There are no commands anywhere in the system, so "requested ≠ observed," command
reconciliation, and confirmation proportional to consequence are asserted but never tested.
There is no authentication or authorization either. Both are honestly recorded as cut in
`README.md` § 9 — but `PRINCIPLES.md` is a graded deliverable carrying several principles
the code cannot currently demonstrate.

> **Status · 19 August 2026 — open.** No commands and no authentication exist, and none of the
> twenty resolved decisions touched either. The nearest adjacent question was **D18** — the
> single-robot diagnostic endpoint returns raw vendor payloads with no server-side access rule —
> and [ADR 26](./00_adr/26_RAW_PAYLOAD_BOUNDED_VERBATIM_AND_UNPROTECTED_BY_DECISION.md) decided
> it by stating that exposure plainly rather than implying protection. That documents the cut in
> a place a reader will find it; it does not close this finding, and was never meant to.

## 5. Where it will choke

Estimates. Replace with ADR 2's harness output when it exists.

> **Status · 19 August 2026 — still estimates; nothing in this table has been measured.**
> **D17** is resolved as [ADR 22](./00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md),
> which built the only part of the harness that needs no running server: per-message validation
> cost, now gated in CI at ADR 2's own falsification threshold of 400 µs and measured at
> **5.8–6.4 µs**, or about 1.5% of one core at 2,500 msg/s. That number touches exactly one row's
> cause below — it says ingest validation is not what makes ingest choke — and leaves every row
> in the table itself an estimate. The console's first-load size is now gated too, at 720 kB raw /
> 300 kB gzip against a measured 584.75 / 176.88; the invented 90% adapter-coverage threshold was
> deleted rather than enforced. Two later decisions still depend on the _transport_ half of this
> harness, which does not exist: **D14**'s virtualization call and the deferred half of
> [ADR 18](./00_adr/18_FLUSH_SEQUENCE_NOW_DELTA_GRANULARITY_WHEN_MEASURED.md).

| Layer           | Comfortable                     | Chokes at          | Cause                                                                                    |
| --------------- | ------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| HTTP ingest     | ~2.5k req/s (500 robots × 5 Hz) | ~10–20k req/s      | One POST per reading; JSON parse, strict Zod, and adapter decode per request on one core |
| Freshness sweep | Trivial to ~100k robots         | Not the bottleneck | O(n) at 2 Hz — 500 robots is 1,000 comparisons per second                                |
| Fan-out         | Single-digit clients            | ~50–100 clients    | Per-client coalescing means per-client serialization                                     |
| Browser table   | ~100 rows                       | 300–500 rows       | No virtualization (by decision, ADR 24); full re-render on every delta                   |
| Whole system    | —                               | ~10–20k robots     | Single process, in-memory state                                                          |

**The browser breaks first, well before the server.** ADR 2's ceiling analysis is careful
and correct about ingest, but the console is the deliverable and holds the lowest ceiling in
the stack.

> **Status · 19 August 2026 — D14 resolved, ceiling still unmeasured by decision.** See
> § 4.3 and [ADR 24](./00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md).
> The static row behavior is asserted at 500; delta-apply cost under a live stream remains
> unmeasured and is the explicit trigger for evaluating virtualization.

**Thundering herd on mass transition.** The sweep marks freshness-changed robots as changed
for fan-out. When telemetry stops, every robot transitions inside one threshold window and
the next flush carries the whole fleet at once.

> **Status · 19 August 2026 — unchanged, and now the explicit reopening condition for a deferred
> decision.** [ADR 18](./00_adr/18_FLUSH_SEQUENCE_NOW_DELTA_GRANULARITY_WHEN_MEASURED.md) defers
> delta granularity until exactly this event is measured — one mass transition at 500 robots,
> whole-envelope, in bytes. This paragraph describes the measurement still owed — by the
> transport half of the harness, which [ADR 22](./00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md)
> did not build and does not claim to.

**Deltas are robot-level, not field-level.** A freshness-only transition — the most common
delta at scale — resends the entire envelope including every capability payload, roughly
5–10× the bytes the change requires.

> **Status · 19 August 2026 — acknowledged, and deliberately deferred rather than acted on.**
> [ADR 18](./00_adr/18_FLUSH_SEQUENCE_NOW_DELTA_GRANULARITY_WHEN_MEASURED.md) keeps
> whole-envelope deltas on the grounds that 5–10× is a multiplier and nothing has measured the
> base it multiplies, while the cost of acting is that the client stops being able to treat every
> message as a keyed replace. A second, freshness-only delta type is the agreed next step **if**
> the number justifies it; a general field-level patch is closed outright, because its failure
> mode — a robot displaying a mixture of two instants — is invisible, which Principle 4
> disqualifies regardless of any measurement. The same ADR did land the other schema change this
> section implies: the wire now carries the server-wide flush sequence ADR 2 had required and
> `telemetryBatchSchema` did not have.

## 6. The architectural problem that will actually bite

**In-memory state in a single process is a hard ceiling with no incremental path past it.**

ADR 6 chose it correctly for this size, and `README.md` § 9 names the seam. The consequence
is sharper than either records: the current-state map, the freshness sweep, and the fan-out
coalescer are all process-local **and mutually dependent**. Two instances behind a load
balancer do not degrade gracefully — they split-brain. Each sweeps its own partial view, and
two operators watching one fleet see different freshness for the same robot. For a console
whose entire claim is that it never presents stale state as current, disagreeing with itself
is the worst available failure.

ADR 2 half-sees this. It notes that `node:cluster` forking breaks ADR 6's in-memory map and
calls that "pricing the mitigation." It is more than a price: the first mitigation for the
_named_ bottleneck invalidates the state architecture, so there is no cheap step between one
process and externalizing state into a broker with the sweep rewritten as a distributed
lease. ADR 2's staged path has a cliff at step two that the ADR does not draw.

**Suggested follow-up:** amend ADR 2's staged mitigation path, or ADR 6's Implications, to
record the cliff explicitly. It is currently discoverable only by reading both ADRs together
and noticing what neither says.

> **Status · 19 August 2026 — open; the suggested follow-up has not been made.** Re-checked
> against both ADRs: ADR 2 § Implications and ADR 6 § Implications each still say the
> `node:cluster` mitigation is _priced_ by the in-memory map, and neither draws the cliff — that
> there is no cheap intermediate step between one process and externalized state, and that two
> instances disagreeing about one robot's freshness is the worst available failure for a console
> whose claim is that it never presents stale state as current.
> The item was carried in [`PENDING_ARCHITECTURE_DECISIONS.md`](./PENDING_ARCHITECTURE_DECISIONS.md)
> § "Existing ADR reconciliation required", which said explicitly not to leave it only in this
> audit. That section is gone — the register is generated now and holds only the stub table — so
> the item is once again only in this audit, which is where it was told not to stay. See § 4.1.

## 7. Recommended order of work

1. **Ship one vertical slice** — one vendor adapter, the server composition root, one real
   WebSocket, one robot visibly going STALE in a browser. Everything else is unvalidated
   until this exists, and it forces D1 to resolve itself.

   > **Status · 19 August 2026 — not started, and it did not force D1.** D1 closed on argument
   > instead ([ADR 10](./00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md)), which was the cheaper
   > order: retrofitting the adapter return type after three vendor modules existed would have
   > been the expensive version. The rest of the item stands unchanged — no vendor adapter, no
   > composition root, no socket. Both stubs that sat on this slice's path have since closed
   > ahead of the code that would have frozen them: **D16** before the ingest handler that would
   > have fixed the adapter error shape by consuming it
   > ([ADR 20](./00_adr/20_ONE_ISSUE_VOCABULARY_END_TO_END.md)), and **D13** before the
   > composition root that would have hardcoded a port
   > ([ADR 21](./00_adr/21_ENDPOINTS_FROM_THE_ENVIRONMENT_WITH_A_DEV_PROXY.md)). **No open
   > register stub now blocks this item.** What blocks it is unwritten code: a vendor adapter, a
   > composition root, a socket.

2. **Resolve or delete D1–D8.** Eight open cross-package decisions is more architectural
   debt than the code currently has architecture.

   > **Status · 19 August 2026 — done, for all twenty.** D1–D20, closed by ADRs 10–29 plus an
   > amendment to ADR 8. **None was deleted**, which is the half of this item that was declined:
   > each was resolved into an ADR with its weighing, its rejected positions and its falsifier,
   > and its register stub converted to a tombstone so old citations keep resolving. Deleting
   > eight would have been faster and would have destroyed the reasoning. What this does not
   > claim is that the debt is paid — see § 4.2 on how narrowly "resolved" reads. D14's
   > measurement-triggered Option 1 is deferred work recorded in its tombstone, not an open
   > choice.

3. **Refresh the ADR statuses** (§ 4.1). Minutes of work; restores trust in the artifact the
   project is betting on.

   > **Status · 19 August 2026 — not done.** Five ADRs still read "Not started" while
   > substantially implemented. It remains the cheapest item on this list.

4. **Virtualize the fleet table, or withdraw Principle 12's claim.** Either is defensible;
   the present state is not.

   > **Status · 19 August 2026 — the second branch is taken.** **D14** is resolved as
   > [ADR 24](./00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md): the claim is
   > withdrawn in root `CLAUDE.md`, `packages/web/CLAUDE.md`, page spec 02, package spec 05 and
   > README § 10, and what remains is backed by a 500-row test. The state this item called
   > indefensible was _an unmeasured claim_, not the plain map itself; the map now ships with an
   > accurate description and a tripwire test. Virtualization is deferred behind one named number —
   > delta-apply cost at 500 robots under a live stream — because windowing rows does not touch the
   > second cause this audit names in § 5.

5. **Add a freshness-only delta type** before the fan-out is written rather than after.

   > **Status · 19 August 2026 — declined for now, deliberately and with a stated reopening
   > condition.** [ADR 18](./00_adr/18_FLUSH_SEQUENCE_NOW_DELTA_GRANULARITY_WHEN_MEASURED.md)
   > accepts this item's _ordering_ argument — that retrofitting after the fan-out exists is
   > dearer — and rejects its _premise_, that 5–10× of an unmeasured base is enough to justify a
   > second message shape and a client merge path. It reopens on one measured mass-transition
   > flush at 500 robots. See § 5.
   >
   > The ADR did take the ordering argument where it applied without dispute: the server-wide
   > flush sequence ADR 2 requires landed in `packages/contracts` _before_ the fan-out, for
   > exactly the reason this item gives.

## 8. Summary

The engineering judgment here is strong — noticeably stronger than the execution. The risk
is not that the design is wrong. It is that the documentation apparatus has become the
deliverable, and it is now large enough to rot faster than it is verified. Every defect
found in this repository so far has been prose describing something the code does not do.

The correction is not less documentation. It is executing the slice that makes the
documentation checkable.

> **Status · 19 August 2026 — the central claim survived all twenty resolutions, with three
> instructive exceptions.** Across D1–D20, nearly every defect that surfaced was prose describing
> something the code did not do: a README citing `--drop` robot ids outside its own fleet, a
> source comment naming a parity test that did not exist, an ADR requiring a wire field the
> schema had never carried, a package README claiming a guard nothing implemented.
>
> The three exceptions are worth recording **against** the thesis, because none was findable by
> reading and each was found by executing. `pnpm start -- --print-manifest`, the command the
> README documents, failed with `Unknown option --` because pnpm consumes the separator itself —
> caught only because [ADR 14](./00_adr/14_SHARED_FLEET_ROSTER_PARITY.md) was verified by running
> it rather than by unit test. `npx tsc --noEmit` in `packages/web` silently checks nothing,
> because that package's `tsconfig.json` is `files: []` plus project references, so only `tsc -b`
> reads any source; a verification run that did not use `-b` reported success against a
> deliberately broken tree ([ADR 19](./00_adr/19_CAPABILITY_KIND_SPLITS_THE_NAME_SET_IN_CONTRACTS.md),
> Observed consequences). And
> [ADR 21](./00_adr/21_ENDPOINTS_FROM_THE_ENVIRONMENT_WITH_A_DEV_PROXY.md)'s configuration
> validator passed nineteen tests while reporting a single bad value twice — an empty host
> complained of both length and whitespace, `*` drew both the wildcard refusal and a URL-format
> complaint, and port `99999` was told about port `0`. Every assertion was green; the defect was
> only visible in the text a human would have had to read at three in the morning.
>
> All three are the same finding this audit makes, one level down: the _verification_ apparatus
> can rot silently too, and executing it is the only thing that proves otherwise. The third adds
> that a passing assertion is not the same as a legible failure.
