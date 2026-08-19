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
