# Plan title

<!--
Copy this file to a narrowly named plan in docs/05_plans/. Replace every placeholder,
delete these instructions, and keep only metadata that matches the plan's current state.
The repository lifecycle is defined in docs/DOCUMENT_LIFECYCLES.md.
-->

**Authority:** Planning only.
**Status:** Active
**Updated:** YYYY-MM-DD

<!--
Status must be Active, Blocked, or Trigger-deferred.
For Blocked, add: **Blocker:** One concrete external condition or authority needed.
For Trigger-deferred, add: **Trigger:** One observable event that activates the work.
Active plans must not include Blocker or Trigger metadata.
-->

## Outcome

State one measurable result.

## Scope

### In scope

- List the work required to produce the outcome.

### Out of scope

- List adjacent work this plan deliberately does not own.

## Authorities and dependencies

- Name the owning principles, ADRs, specifications, and package guides.
- Record sequencing dependencies and any conflicts that must stop execution.

## Execution

1. Describe the smallest ordered implementation step.
2. Add further steps only where ordering matters.

## Acceptance criteria

- [ ] Define observable completion evidence.
- [ ] Confirm code and durable documentation describe the same state.
- [ ] Record every unverified item honestly.

## Documentation synchronization

- Name the specifications, READMEs, TODOs, decision mappings, or other durable documents that must change with the implementation.

## Verification

- `pnpm <narrowest-relevant-check>`
- Add broader checks only when the affected surface requires them.

## Completion

Archive this plan under `docs/04_archive/` only after its content is consumed by code,
ADRs, specifications, or an explicit follow-up plan. Add the archive date and name the
replacement evidence.
