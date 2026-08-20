# Documentation Audit and Reconciliation

**Authority:** Planning only. Principles, numbered ADRs, and current specifications govern conflicts.
**Status:** Active
**Updated:** 2026-08-20

## Objective

Audit every repository README, TODO/FIXME, planning document, specification, decision record, and documentation-bearing source comment against the current implementation. Correct stale status claims and classify unresolved work without ratifying or implementing product behavior.

## Deliverables

- Reconcile current READMEs, specifications, TODOs, submission notes, and source documentation comments with code and verified checks.
- Keep historical documents historical; repair only their authority or routing metadata when necessary.
- Make every unresolved item visibly one of: active blocker, actionable non-blocker, trigger-deferred work, or deliberate product cut.
- Keep D22 and D23 open until numbered ADRs ratify them; do not allocate speculative ADR or D-id numbers in planning documents.
- Produce an end-to-end handoff summarizing package status, live data flow, verification evidence, open decisions, blockers, and deferred work.

## Verification

- Run the full repository test, typecheck, build, lint, architecture-documentation, dependency, token, bundle, formatting, and diff-integrity checks.
- Exercise the running stack where the environment permits and distinguish manual observation from committed browser automation.
- Regenerate the pending-decision index only through `pnpm docs:decisions`.

## Constraints

- No runtime API, contract, component, endpoint, dependency, or product behavior changes.
- Preserve user-owned worktree changes and create no commit.
- Do not rewrite historical findings to make them appear current.
