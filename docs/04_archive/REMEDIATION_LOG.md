# Archived — ADR remediation plan, phase 3

**Authority:** None. This is a spent work plan, kept for provenance only.

**Archived:** 19 August 2026, from `docs/00_adr/`, where it was the only file that was not
an ADR.

**Why it is spent.** Every item below was executed, and the ADR set is now the record of it.
Checked against all thirty files in `docs/00_adr/` on the archive date: 30/30 carry the 3.1
field order, the 3.2 one-line `**Decision:**` summary, the 3.3 three-part `**Status:**`, and
first-class `## Open questions` (3.4) and `## Observed consequences` (3.5) sections. The four
`Related` variants 3.6 set out to merge no longer appear anywhere — there is exactly one
`## Related` per file — and 3.7's split survives as separate `## Assumptions` and
`## Constraints` sections, present in all thirty.

**What replaced it.** Part of this shape is now enforced rather than remembered.
`scripts/architectureDocs.mjs` requires the 3.1 title line, the 3.2 `**Decision:**` summary
and the 3.3 three-part `**Status:**` to parse at all, and generates
[`../PENDING_ARCHITECTURE_DECISIONS.md`](../PENDING_ARCHITECTURE_DECISIONS.md) from them, so
an ADR that drops one of those three fails `pnpm check:architecture-docs`. The rest — `Group`
and the section set from 3.4 through 3.7 — holds by convention and by `00_TEMPLATE.md` only;
it was at 30/30 on the archive date, but nothing would fail if the thirty-first ADR omitted
`## Observed consequences`. Phases 1 and 2 were never written to a file and are not
recoverable from this repository; only phase 3 was.

**Do not edit.** Amending a spent plan to match today would misrepresent what was planned.

---

Phase 3 — Structural changes

3.1 — Target field order

# ADR N — Title

**Decision:** One sentence. What was decided, not why.
**Status:** Decided | Superseded · YYYY-MM-DD · Implemented | Partial | Not started
**Group:** ...

## Issue

## Decision

## Positions

## Argument

## Implications

## Open questions

## Observed consequences

## Related

## Notes

3.2 — Add the one-line Decision summary

A reader currently traverses a full Issue paragraph before learning what was decided. Add a single declarative sentence at the top of each file, before Issue. This is also the chunk a retrieval system will surface first, which matters given the stated intent that these be readable by both humans and models.

3.3 — Make Status structured

Replace prose status with three fields: state, date, implementation state. ADR 5 currently spends three clauses on what eight words carry.

3.4 — Promote Open questions to a first-class field

Open questions are currently buried in Notes across four documents, indistinguishable from commentary. Extract them. Each entry gets a one-line question, a stated current lean where one exists, and the event that will resolve it. Several of these are closed by earlier phases of this guide — ADR 1's Set question, ADR 3's two questions, ADR 4's second fixture, ADR 6's ring buffer — so this field should shrink substantially rather than merely relocating.

3.5 — Add Observed consequences, with a dash where nothing is observed

Four documents spend roughly forty words each explaining that no code exists yet and what the first entry will be. The Status field already carries that. Replace each with a dash. ADR 4 is the exception and the model: its Notes contain real observed consequences, and they should move into this field under dated entries.

3.6 — Collapse the four Related fields into one

Related requirements and Related principles restate each other in every document. Merge all four into a single Related section with typed line prefixes:

ADR 4 — enforced dependency rule; makes this ADR's entity-layer prohibition mechanical.
Principle 6 ("...") — this ADR is its direct implementation.
Artifact `packages/contracts` — not yet implemented; owns the envelope type.

This removes roughly a quarter of each document's line count and makes the relationship type scannable.

3.7 — Fold Assumptions and Constraints where they overlap

Several entries appear in both under different framings. Keep both sections, because they answer different questions — what is believed versus what is binding — but move each entry to exactly one.
