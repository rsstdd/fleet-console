# ADR Template

- **Format:**

```md
# ADR N — Title

**Decision:** One sentence. What was decided, not why.
**Status:** Decided | Superseded · YYYY-MM-DD · Implemented | Partial | Not started
**Group:** ...

## Issue

## Assumptions

## Constraints

## Decision

## Positions

## Argument

## Implications

## Open questions

## Observed consequences

## Related

## Notes
```

- **Decision (Top Summary):** A single declarative sentence placed at the very top of the file. State exactly what was decided, not why. This serves as the primary chunk a retrieval system or human reader surfaces first.
- **Status:** Replace prose status with three structured fields: state (`Decided` or `Superseded`), date (`YYYY-MM-DD`), and implementation state (`Implemented`, `Partial`, or `Not started`).
- **Group:** Use a simple grouping—such as integration, presentation, data, and so on—to help organize the set of decisions. You could also use a more sophisticated architecture ontology (e.g., event, calendar, location).
- **Issue:** Describe the architectural design issue you’re addressing, leaving no questions about why you’re addressing this issue now. Following a minimalist approach, address and document only the issues that need addressing at various points in the life cycle.
- **Assumptions:** Clearly describe the underlying assumptions (what is believed) in the environment in which you’re making the decision—cost, schedule, technology, and so on. Move overlapping items strictly here if they are beliefs rather than bindings.
- **Constraints:** Capture any additional constraints (what is binding) to the environment that the chosen alternative might pose or that limit the alternatives you consider. Move overlapping items strictly here if they are environmental bindings.
- **Decision:** Clearly state the architecture’s direction—that is, the position you’ve selected, expanding on the top-line summary if necessary.
- **Positions:** List the positions (viable options or alternatives) you considered. These often require long explanations, sometimes even models and diagrams. This isn’t an exhaustive list, but it prevents the "Did you think about...?" question during reviews.
- **Argument:** Outline why you selected a position, including items such as implementation cost, total ownership cost, time to market, and required development resources’ availability.
- **Implications:** A decision comes with many implications. A decision might introduce a need to make other decisions, create new requirements, or modify existing requirements; pose additional constraints; require renegotiating scope or schedule; or require additional staff training. Clearly stating implications creates a roadmap for architecture execution.
- **Open questions:** Promoted to a first-class field. Extract open questions from notes. Each entry gets a one-line question, a stated current lean where one exists, and the event that will resolve it. Close out questions that have been resolved by earlier phases or decisions.
- **Observed consequences:** Track real-world outcomes of the decision under dated entries. If no code exists yet and nothing is observed, use a single dash (`-`) rather than explaining the lack of observations (the Status field carries that information).
- **Related:** Collapse related decisions, requirements, artifacts, and principles into a single section with typed line prefixes. For example:
  - `ADR 4 — enforced dependency rule; makes this ADR's entity-layer prohibition mechanical.`
  - `Principle 6 ("...") — this ADR is its direct implementation.`
  - `Artifact packages/contracts — not yet implemented; owns the envelope type.`
- **Notes:** Capture notes and issues that the team discusses during the socialization process. Do not bury open questions or observed consequences here; use their respective first-class fields.
