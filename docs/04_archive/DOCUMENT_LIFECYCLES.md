# Enforce decision and plan lifecycles

**Authority:** Historical only. This plan was consumed by repository process documentation and enforcement.
**Archived:** 2026-08-20
**Superseded by:** `docs/DOCUMENT_LIFECYCLES.md`, `scripts/architectureDocs.mjs`, and root `AGENTS.md`.

## Goal

Define deterministic creation, execution, transition, and closure algorithms for durable decisions and implementation plans, then enforce their machine-readable invariants in the existing architecture-documentation CI check.

## Acceptance evidence

- `docs/DOCUMENT_LIFECYCLES.md` owns both lifecycle algorithms and state definitions.
- Root agent instructions route decision and plan work through those algorithms.
- Current plans declare checked status/date metadata; deferred plans declare their triggers.
- Open and resolved decision fields, ADR supersession, and plan transitions have focused failure tests.
- `pnpm check:architecture-docs` validates all current repository documents.
