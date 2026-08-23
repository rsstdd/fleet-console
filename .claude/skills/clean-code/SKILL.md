---
name: clean-code
description: Clean Code (Robert C. Martin) rules as applied in this repository, with the conflict order against binding repo conventions. REQUIRED before writing, generating, editing, or reviewing any code here, and whenever a Clean Code rule appears to conflict with a repo convention.
---

# Clean Code in this repository

These rules govern all code written or edited here. They are style and structure guidance,
not authority: **`PRINCIPLES.md`, the accepted ADRs, and `AGENTS.md` win on any genuine
conflict.** Where they conflict, apply Clean Code inside the repo convention's frame and say
so in the summary — never resolve the conflict silently.

## Conflict order

1. `PRINCIPLES.md` (binding, all fifteen — repo `AGENTS.md` states it outranks everything below)
2. Accepted ADRs, the sole normative decision records
3. Repo `AGENTS.md`, then path-scoped `AGENTS.md`
4. These Clean Code rules

## Known conflicts, already settled

Do not re-litigate these. Flag anything new. (Recorded in
`docs/05_plans/WEB_TEST_LAYOUT_AND_DECOMPOSITION.md`, Code quality standard.)

| Clean Code rule                 | Repo convention that wins                                                | Why                                                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One assert per test             | One _behavior_ per test; existing multi-assertion suites stay            | Rewriting a green suite that serves as behavior-preservation evidence is churn that destroys the evidence. New tests are written one behavior per test.                                                                                                                                 |
| Prefer polymorphism to if/else  | Exhaustive `switch` over discriminated unions for state and domain rules | `switch-exhaustiveness-check` makes a new union member a compile error at every consumer; a class hierarchy cannot refuse an unknown variant at the decode boundary. Polymorphism applies at real seams — the capability-panel registry instead of vendor branches — not closed unions. |
| Boy scout rule, unbounded       | Bounded by ADR 27's ~300-line reviewable-diff gate                       | Campground = files the change already touches; cleanups beyond them go on a plan's follow-up list rather than into the diff.                                                                                                                                                            |
| Avoid comments; explain in code | Two-sided coupling comments to governance docs                           | A mirror between code and a ratified policy cannot be expressed in code. Both ends must name each other.                                                                                                                                                                                |

## General

- Follow standard conventions. Keep it simple: simpler is always better.
- Boy scout rule: leave the code cleaner than you found it — within the change's scope. Do not
  reformat, rename, or reorganize unrelated code (`AGENTS.md` operating rules).
- Always find the root cause. No workaround without saying why.

## Design

- Keep configurable data at high levels.
- Prefer polymorphism to if/else or switch — subject to the settled conflict above.
- Separate multi-threading code from the logic it runs.
- Prevent over-configurability. Use dependency injection. Follow the Law of Demeter.

## Understandability

- Be consistent: one idea, one spelling, one shape.
- Use explanatory variables. Encapsulate boundary conditions.
- Prefer dedicated types to bare primitives for closed vocabularies — a `Freshness` union
  decoded once at the boundary, not a bare string compared ad hoc at each call site. (Open
  identifiers from the wire stay `string`, validated once at the boundary — inventing a nominal
  type for one call site is over-configurability, a recorded KISS decision.)
- Avoid logical dependency between methods. Avoid negative conditionals.

## Names

- Descriptive, unambiguous, pronounceable, searchable, meaningfully distinct.
- Named constants over magic numbers (`IDENTIFIER_MAX_LENGTH`, not `64`).
- No encodings, no type prefixes, no Hungarian notation.

## Functions

- Small. Do one thing. Descriptive name. Few arguments. No side effects. No flag arguments —
  a boolean parameter that selects behavior means two functions.

## Comments

- Explain yourself in code first.
- Comments carry intent, clarification, consequence, or warning — never a restatement of the
  code, never a closing-brace label, never commented-out code.
- In this repo a comment is also the right tool for: why an ordering is load-bearing, why a
  deviation is proportionate, and what a code↔document mirror is bound to.

## Source structure

- Separate concepts vertically; keep related code vertically dense.
- Declare variables close to use. Keep dependent and similar functions close.
- Functions read downward: callers above callees.
- Short lines (100 cols here). No horizontal alignment. Use whitespace to associate, not to decorate.
- Do not break indentation.

## Objects and data structures

- Hide internal structure. Prefer data structures where there is no behavior. Avoid hybrids.
- Small, doing one thing, with few instance variables.
- A base class knows nothing of its derivatives.
- Prefer many functions to one function taking a parameter that selects behavior.
- Prefer non-static methods.

## Tests

- Readable, fast, independent, repeatable. One concept per test.
- **A test must not re-derive the implementation.** Expected values are a table a reviewer reads
  against the controlling document, not a second copy of the code under test — an expectation
  computed by the same logic passes for any policy, including a wrong one.
- Prefer an exhaustive `switch` in an expectation table so a new union member is a compile error
  in the test rather than an untested one.
- A test that needs the running stack for a claim that does not require one is not independent —
  browser evidence belongs to the e2e projects (ADR 32), everything else to the unit suite.

## Smells to refuse

Rigidity, fragility, immobility, needless complexity, needless repetition, opacity.

In this repo, "opacity" specifically includes collapsing a failure whose cause is known into a
generic error: the one failure vocabulary is `ContractIssue` plus the recoverable/terminal
distinction (ADR 20), and a surface that could name the path and code but doesn't is opaque.
