# Decision and plan lifecycles

**Authority:** Repository process. This document governs how durable decisions and plans move through the repository; it does not override `PRINCIPLES.md`, a numbered ADR, or a current specification.

Use a decision when multiple viable positions change durable architecture, public contracts, dependency policy, mechanical enforcement, or cross-package ownership. Use a plan when sequencing accepted or proposed work, recording acceptance evidence, or preserving a trigger-gated implementation path. A plan may recommend a decision but cannot ratify one.

## Decision lifecycle

Decision state and implementation state are independent. An open D-id is undecided. A numbered ADR is `Decided` or `Superseded`; its implementation is `Not started`, `Partial`, or `Implemented`.

### Algorithm: create or resolve a decision

1. Read `PRINCIPLES.md`; stop if the proposed outcome conflicts with a non-negotiable rule.
2. Search `docs/decisions.json` by question and inspect only the mapped ADRs. Reuse the existing D-id when the question is already registered.
3. Decide whether an ADR is warranted. Do not create one for local implementation detail, status reporting, or a reversible choice with no durable consequence.
4. If the question needs deliberation, append the next contiguous D-id with `adr: null` and a non-empty `next` describing the evidence, owner action, or event that can resolve it. Do not reserve an ADR number.
5. If the question can be decided now, allocate the next unused ADR number, copy `docs/00_adr/00_TEMPLATE.md`, and record the issue, viable positions, argument, implications, open questions, and related authorities.
6. Set the top status to `Decided · YYYY-MM-DD · Not started`, `Partial`, or `Implemented` using evidence from the same change. A decision is not `Implemented` merely because its prose is complete.
7. Map the D-id to the ADR and remove `next`. If no D-id existed, add the next contiguous D-id only when this is a durable registered question.
8. Put every mechanically recognizable rule in code, lint, runtime validation, or a test; cite the ADR beside the mechanism and register the file under `mechanicalRules`.
9. Update affected specifications with current consequences, TODOs with remaining work, and READMEs with supported operation. Link the ADR; do not duplicate its rationale or status.
10. Run `pnpm docs:decisions`, then `pnpm check:architecture-docs`, followed by checks appropriate to affected code.
11. Change implementation state only when evidence changes. Add dated observed consequences when operation reveals a material result.
12. Close all remaining open questions or promote each durable unresolved question to its own D-id with a concrete resolution event.

### Algorithm: amend or supersede a decision

1. Amend the existing ADR only to clarify wording, record evidence, close an anticipated open question, or refine consequences without reversing its chosen position.
2. Create a new ADR when the chosen position changes or two records would otherwise prescribe incompatible behavior.
3. Mark the old record `Superseded`, preserve its historical text, and add `**Superseded by:** ADR N`. The replacement ADR links back and explains the changed position.
4. Route the owning D-id to the replacement ADR unless retaining the old tombstone is necessary for a distinct question; never leave two active normative answers.
5. Update enforcement and `mechanicalRules` registrations in the same change. Remove obsolete enforcement only after replacement evidence passes.
6. Regenerate and validate the index. Never delete an ADR or reuse a D-id/ADR number.

## Plan lifecycle

Files in `docs/05_plans/` are executable planning documents and may have only these states:

- `Active`: accepted for execution now; no trigger or blocker metadata.
- `Blocked`: accepted work that cannot progress; includes `**Blocker:**` naming the external condition or authority needed.
- `Trigger-deferred`: deliberately out of scope until its `**Trigger:**` becomes true.

Completed, abandoned, and superseded plans are terminal and therefore leave `docs/05_plans/`; archive them under `docs/04_archive/` with the archive date and the normative artifact, evidence, or plan that replaced them.

### Algorithm: create and execute a plan

1. Search `docs/05_plans/` by task terms. Update the single owning plan instead of creating a competing roadmap.
2. Read the owning principles, decision mapping/ADR, specification, scoped `AGENTS.md`, and relevant public code entry point. Record any conflict and stop; a plan cannot waive authority.
3. Create a narrowly named plan only if no plan owns the work. Declare `**Authority:** Planning only.`, `**Status:**`, and `**Updated:** YYYY-MM-DD` near the top.
4. State one measurable outcome, in-scope and out-of-scope work, dependencies/order, acceptance criteria, documentation synchronization, and the narrowest verification commands.
5. Use `Active` only for executable scope. Use `Trigger-deferred` plus one observable trigger for unscheduled work. Use `Blocked` plus one concrete blocker only after safe in-scope alternatives are exhausted.
6. Before implementation, re-read identifiers and authorities; recommendations and reserved numbers in a plan are stale hints, never facts.
7. Work test-first where behavior changes. Update the plan date and facts when scope, evidence, dependencies, status, trigger, or blocker changes.
8. When a trigger fires, revalidate the whole plan against current authority, remove `Trigger`, set `Active`, and update the date. A fired trigger does not ratify a proposed decision.
9. When a blocker clears, remove `Blocker`, set `Active`, update the date, and resume at the first unmet acceptance criterion.
10. Keep status claims evidence-based: code, specifications, TODOs, READMEs, and the plan must describe the same current state.
11. At completion, run named checks, record any unverified item honestly, synchronize durable documentation, and ensure no required work remains hidden in prose.
12. Archive the plan only when its content is consumed by code, ADRs, specifications, or explicit follow-up plans. For abandonment or supersession, archive it with the reason and replacement. Never delete it merely because it is stale.

## Mechanical guardrails

`pnpm check:architecture-docs` runs in CI and rejects:

- non-contiguous or duplicate D-ids, duplicate ADR routing, missing ADR targets, open stubs without `next`, and resolved entries retaining `next`;
- malformed ADR metadata, duplicate ADR numbers, superseded ADRs without a replacement, missing replacement ADRs, and self-supersession;
- active plan files without authority/status/date metadata, deferred plans without triggers, blocked plans without blockers, and trigger/blocker metadata on the wrong state;
- missing ADR citations in registered mechanical enforcement, stale generated decision output, missing authority markers, and stale resolved-decision language.

Human review remains responsible for whether a choice is truly architectural, whether evidence justifies implementation status, and whether a completed plan has been fully consumed. The checks make lifecycle shape and synchronization mandatory rather than relying on memory.
