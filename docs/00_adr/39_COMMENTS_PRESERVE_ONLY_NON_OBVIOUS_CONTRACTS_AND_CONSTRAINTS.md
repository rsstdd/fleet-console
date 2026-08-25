# ADR 39 — Comments Preserve Only Non-Obvious Contracts and Constraints

**Decision:** A source comment is required only when it preserves an important contract, invariant, constraint, or failure mode that names, types, structure, tests, and owning documentation cannot reasonably express.
**Status:** Decided · 2026-08-25 · Implemented
**Group:** Process / documentation quality

## Issue

ADR 37 reduced the repository's former blanket documentation rule but still required one
sentence on every declared package export and every web cross-layer export. Package guidance
also required coupling comments on both sides and construct-triggered prose around effects,
numeric values, dimensions, and regular expressions. These rules create comments because a
declaration has a particular shape or location, not because a maintainer needs information the
code cannot carry.

That conflicts with the repository's measured comment-quality problem. ADR 28 already rejects
restated documentation, so a declaration whose name and type fully describe its contract is
left with two bad outcomes: padded prose that evades lint or a review dispute over wording that
adds no information. Duplicating coupling prose on both sides adds another failure mode because
the copies can drift independently.

## Assumptions

- Names, precise types, focused helpers, runtime schemas, and behavior tests are easier to keep
  synchronized with implementation than nearby explanatory prose.
- A small number of comments remain essential where code cannot encode domain meaning,
  lifecycle ordering, external limitations, or caller-visible behavior.
- Existing source comments can be reviewed incrementally when their files are touched; changing
  the rule does not justify a repository-wide deletion sweep in the same change.

## Constraints

- ADR 28 remains implemented. Any doc comment that exists must say something the declaration
  does not, and `pnpm check:doc-comments` continues to enforce that mechanical minimum.
- Principles, accepted ADRs, schemas, and specifications own architectural rationale. A source
  comment may identify the applicable invariant or point to its owner but does not duplicate
  mutable document history.
- Principle 14 requires one discoverable authority and reproducible checks; it does not require
  the same coupling explanation in multiple source files.
- Comment necessity is semantic and therefore review-enforced. No coverage count or
  construct-triggered lint rule is introduced.

## Decision

The default is no source comment. Before adding one, improve the name or type, extract a named
predicate or helper, encode the distinction in a schema or discriminated union, add a focused
test, or put durable rationale in the owning ADR or specification.

A comment is warranted only when it preserves at least one of these and the information cannot
reasonably be expressed by those alternatives:

1. a correctness or safety invariant, including ordering and states that must remain distinct;
2. critical external-system lifecycle behavior, race resolution, or non-obvious cleanup;
3. a necessary deviation or workaround whose removal could restore a known failure;
4. a non-obvious protocol or domain constraint such as units, provenance, absence semantics, or
   identity; or
5. a caller-visible API guarantee that TypeScript cannot express, such as ownership, mutation,
   retry, ordering, or failure behavior.

No declaration requires a doc comment solely because it is exported, re-exported, imported
across a layer, or composed by the app shell. Internal and public declarations use the same
test: the sentence must preserve a non-obvious contract. Ordinary interface members, effects,
memoization, callbacks, constants, dimensions, thresholds, regular expressions, JSX sections,
and test phases do not trigger comments by their existence.

Cross-file and cross-package coupling is expressed through a shared type, API, test, or owning
document whenever possible. When a refactor could easily violate a load-bearing relationship
and code cannot make that relationship discoverable, one concise comment belongs at the
least-obvious side. Mirrored source comments are not required.

## Positions

1. **Require comments only for non-obvious contracts and constraints.** Chosen.
2. **Keep ADR 37's public-surface tier and relax only construct-triggered rules.** Rejected
   because export location still does not prove that prose adds information.
3. **Ban source comments.** Rejected because types cannot express every external lifecycle,
   ordering, provenance, or failure guarantee safely.
4. **Require comment coverage mechanically.** Rejected because coverage measures presence,
   rewards filler, and cannot decide whether information is important or already expressed.
5. **Keep two-sided coupling comments as a stale-comment check.** Rejected because duplication
   creates the drift it is intended to expose; shared contracts and tests are stronger evidence.

## Argument

The useful distinction is not public versus internal or complex versus simple. It is whether a
future maintainer can reconstruct an important constraint from executable structure and the
owning documentation. Exported names and types often communicate their entire contract, while
an internal ordering rule or browser lifecycle edge can be critical and invisible. A surface-
based mandate therefore spends prose in the wrong places.

The selected policy also makes ADR 28 coherent. Informative-doc lint remains a cheap guard
against restatement, while review asks the prior question: whether any prose is needed at all.
Shared types, schemas, and tests provide synchronized evidence for coupling; one narrowly placed
comment remains available when those mechanisms cannot expose the risk.

## Implications

- ADR 37 is superseded, and D29 routes to this decision.
- Root and package guidance no longer mandate JSDoc by export surface or duplicated coupling
  prose. Web guidance no longer treats effects, numeric values, dimensions, or regular
  expressions as automatic comment sites.
- Public APIs still receive documentation when they carry behavior their types cannot express.
  Removing the blanket tier does not lower that semantic bar.
- Existing informative comments are not deleted mechanically. When nearby code changes, each
  comment is verified, shortened to the load-bearing fact, or removed if code or owning
  documentation now carries it.
- ADR 28's ESLint rule and enforcement test remain registered mechanical rules. This decision
  adds no new mechanism to `docs/decisions.json`.

## Open questions

- **Can semantic comment necessity be enforced beyond review?** Lean no. Resolution event: a
  tool demonstrates that it can distinguish a non-obvious contract from restatement without a
  comment-coverage target or a false-positive baseline.

## Observed consequences

- 25 August 2026: all repository and package guidance was aligned to the exceptional-comment
  rule; the public-surface, construct-triggered, and mirrored-coupling mandates were removed
  while ADR 28's informative-doc lint remained active.

## Related

- **ADR 37** — superseded public-surface mandate.
- **ADR 28** — retained mechanical rejection of doc comments that restate declarations.
- **Principle 1** — shared types and APIs are preferred to duplicated descriptions of one rule.
- **Principle 10** — focused behavior tests carry executable evidence where prose would drift.
- **Principle 14** — one discoverable authority is more auditable than mirrored source prose.
- **Principle 15** — semantic review is proportionate where a mechanical coverage rule would
  reward noise.
