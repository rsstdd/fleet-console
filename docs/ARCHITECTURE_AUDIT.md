# Architecture audit

**Created:** 19 August 2026
**Status:** Findings only — nothing here is a ratified decision. Items that imply a
decision belong in an ADR or in [`PENDING_ARCHITECTURE_DECISIONS.md`](./PENDING_ARCHITECTURE_DECISIONS.md).
**Method:** Read the accepted ADR set, page/component/package specs, and `PRINCIPLES.md`,
then checked each claim against the code rather than against the documentation describing it.

Scale figures in § 5 are **estimates, not measurements**. No harness exists yet; ADR 2
commits to building one, and these numbers should be replaced by its output.

Every finding below was verified against the working tree on 19 August 2026. Several
packages are under active construction, so re-verify before acting on an old finding.

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

### 4.2 Eight unresolved cross-package decisions

`PENDING_ARCHITECTURE_DECISIONS.md` is the largest document in `docs/` and holds D1–D8
unratified. **D1 is the shape an adapter returns** — the adapter/server seam itself — and it
is open while both packages are being built against it.

### 4.3 Principle 12 is unmet and untested

Principle 12 requires virtualized lists and a table usable at several hundred robots.
`packages/web/src/features/fleet/fleetPage.tsx` renders `filteredRobots.map(...)` — a plain
map with no windowing. With a 10-robot fixture set, the table has never been seen at 500
rows.

### 4.4 `sequence` breaks the capability model on its first day

`sequence` is a member of `CapabilityName`, but it is transport metadata rather than a
machine capability, so page spec 03 § 6 must explicitly carve it out of the capability
panels. The rule "render exactly the capabilities the adapter declared" already carries an
exception. It would be better modelled as nullable envelope metadata.

### 4.5 "Adding a vendor never means editing contracts" is oversold

True only for a vendor that reuses existing capabilities. `CapabilityName` is a closed
union, so a vendor with a genuinely new sensor is a contracts change, a web panel change,
and a schema-version conversation. ADR 1's Implications admit this; the headline claim does
not.

### 4.6 The prose is where the defects live

Roughly **8,400 lines of documentation against ~7,500 lines of source**, and the defects
found so far have all been in the prose: wireframe copy that had drifted from the component
spec, a 3-robot fleet manifest describing a 50-robot fleet, and the simulator's
`--print-manifest` emitting `vendor` where the server's loader requires `vendorId`. Each was
invisible until something executed against it.

### 4.7 Three of five non-negotiables are unexercised

There are no commands anywhere in the system, so "requested ≠ observed," command
reconciliation, and confirmation proportional to consequence are asserted but never tested.
There is no authentication or authorization either. Both are honestly recorded as cut in
`README.md` § 9 — but `PRINCIPLES.md` is a graded deliverable carrying several principles
the code cannot currently demonstrate.

## 5. Where it will choke

Estimates. Replace with ADR 2's harness output when it exists.

| Layer           | Comfortable                     | Chokes at          | Cause                                                                                    |
| --------------- | ------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| HTTP ingest     | ~2.5k req/s (500 robots × 5 Hz) | ~10–20k req/s      | One POST per reading; JSON parse, strict Zod, and adapter decode per request on one core |
| Freshness sweep | Trivial to ~100k robots         | Not the bottleneck | O(n) at 2 Hz — 500 robots is 1,000 comparisons per second                                |
| Fan-out         | Single-digit clients            | ~50–100 clients    | Per-client coalescing means per-client serialization                                     |
| Browser table   | ~100 rows                       | 300–500 rows       | No virtualization; full re-render on every delta                                         |
| Whole system    | —                               | ~10–20k robots     | Single process, in-memory state                                                          |

**The browser breaks first, well before the server.** ADR 2's ceiling analysis is careful
and correct about ingest, but the console is the deliverable and holds the lowest ceiling in
the stack.

**Thundering herd on mass transition.** The sweep marks freshness-changed robots as changed
for fan-out. When telemetry stops, every robot transitions inside one threshold window and
the next flush carries the whole fleet at once.

**Deltas are robot-level, not field-level.** A freshness-only transition — the most common
delta at scale — resends the entire envelope including every capability payload, roughly
5–10× the bytes the change requires.

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

## 7. Recommended order of work

1. **Ship one vertical slice** — one vendor adapter, the server composition root, one real
   WebSocket, one robot visibly going STALE in a browser. Everything else is unvalidated
   until this exists, and it forces D1 to resolve itself.
2. **Resolve or delete D1–D8.** Eight open cross-package decisions is more architectural
   debt than the code currently has architecture.
3. **Refresh the ADR statuses** (§ 4.1). Minutes of work; restores trust in the artifact the
   project is betting on.
4. **Virtualize the fleet table, or withdraw Principle 12's claim.** Either is defensible;
   the present state is not.
5. **Add a freshness-only delta type** before the fan-out is written rather than after.

## 8. Summary

The engineering judgment here is strong — noticeably stronger than the execution. The risk
is not that the design is wrong. It is that the documentation apparatus has become the
deliverable, and it is now large enough to rot faster than it is verified. Every defect
found in this repository so far has been prose describing something the code does not do.

The correction is not less documentation. It is executing the slice that makes the
documentation checkable.
