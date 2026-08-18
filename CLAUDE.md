# CLAUDE.md

This is a TypeScript monorepo for a multi-vendor robot fleet telemetry console: canonical contracts, vendor adapters, thin simulator/server, and a React + Material UI web console.

## Rules

Behavioral instructions only. Do not load product or domain knowledge here.

- Prefer test-driven changes. Write or update a focused test that documents the intended behaviour before implementing the change. Use the test to validate your own work.
- Add a one-sentence doc comment on every exported class, function, type, and React component. Keep it factual; it is grounding context for future agents.
- Document non-trivial cross-file or cross-package coupling in both places with a short comment that names the other side. Agents find related code by search; implied coupling is invisible.
- Follow the dependency rule strictly:
  - `app` may import anything
  - `features` may import `entities` and `shared`
  - `entities` may import `shared`
  - `shared` imports nothing above it
  - No feature may import another feature
  Enforcement lives in lint/CI. Never introduce a violation even if it appears convenient.
- Presentational components under `shared/ui` import no domain code. Domain logic stays in `entities`. Features compose; they do not own domain rules.
- State naming and UI conventions:
  - Observed (telemetry) state and requested (command) state are never collapsed into one value.
  - Freshness is first-class: any surface that shows a value must also indicate how old it is (LIVE / STALE / UNREACHABLE / UNKNOWN).
  - Operator view is the default; technician diagnostics are behind an explicit toggle.
  - Use the existing Material UI theme tokens and tenant config for any visual variation. Do not introduce a second styling system.
- When adding or changing behaviour, point at the best existing example in the same package or feature and imitate its structure, naming, and test style.
- After implementing a user-facing feature, perform end-to-end verification: start the stack, exercise the flow in a browser (or documented equivalent), and confirm the observable result. Compiling and unit tests alone are insufficient.
- Quality bar (enforce by default):
  - Console must never present stale data as current.
  - Virtualize large lists; keep the fleet table usable at several hundred robots.
  - Reject malformed payloads at the boundary; never coerce.
  - Unknown vendor fields are counted, not silently dropped.
  - One-command local start must continue to work.
- Treat PRINCIPLES.md as binding. Every change must stay consistent with the ten principles.
  If a requested change would violate a principle, stop and surface the conflict instead of
  working around it. When in doubt, re-read PRINCIPLES.md before editing.
- Adding a new vendor means adding one module + fixtures under `/packages/adapters`. Never edit the canonical model or envelope to accommodate a vendor.
- Prefer small, focused diffs. Do not refactor unrelated code while implementing a feature.
- If a change would violate PRINCIPLES.md or an ADR, stop and surface the conflict instead of working around it.

## Routing table

| Looking for | Look here |
|-------------|-----------|
| Canonical envelope, capability types, freshness machine, Zod schemas | `packages/contracts` |
| Vendor dialects, adapters, recorded fixtures, adapter contract tests | `packages/adapters` |
| Telemetry producer, fault injection flags, load mode | `packages/simulator` |
| Ingest, adapter dispatch, current-state store, WebSocket fan-out, health endpoint | `packages/server` |
| React console (primary deliverable) | `packages/web` |
| App shell, providers, router | `packages/web/src/app` |
| Fleet list / site grouping / summary | `packages/web/src/features/fleet` |
| Robot detail, capability-driven panels, operator/technician toggle | `packages/web/src/features/robot` |
| Robot domain model, selectors, hooks | `packages/web/src/entities/robot` |
| Site / grouping model | `packages/web/src/entities/site` |
| Pure UI primitives (no domain) | `packages/web/src/shared/ui` |
| Formatting, time helpers, transport client | `packages/web/src/shared/lib` |
| Tenant themes and feature flags | `packages/web/src/config` |
| Engineering principles (graded deliverable) | `PRINCIPLES.md` |
| Architecture Decision Records | `docs/adr/` |
| How to run, demo script, AI-usage note, measurements | `README.md` |
| Boundary / dependency enforcement config | lint config at repo root + CI |
| Agent routing and hard rules (this file) | `CLAUDE.md` |
| Binding engineering principles (must be followed) | `PRINCIPLES.md` |
