# CLAUDE.md

This is a TypeScript monorepo for a multi-vendor robot fleet telemetry console: canonical contracts, vendor adapters, thin simulator/server, and a React + Material UI web console.

## Rules

Behavioral instructions only. Do not load product or domain knowledge here.

- Prefer test-driven changes. Write or update a focused test that documents the intended behaviour before implementing the change. Use the test to validate your own work (Principle 10).
- Add a one-sentence doc comment on every exported class, function, type, and React component. Keep it factual; it is grounding context for future agents (Principle 14).
- Document non-trivial cross-file or cross-package coupling in both places with a short comment that names the other side. Agents find related code by search; implied coupling is invisible (Principle 14).
- Follow the dependency rule strictly (Principle 9):
  - `app` may import anything
  - `features` may import `entities` and `shared`
  - `entities` may import `shared`
  - `shared` imports nothing above it
  - No feature may import another feature
    Enforcement lives in lint/CI. Never introduce a violation even if it appears convenient.
- Domain logic lives in `entities` and has one authoritative implementation. Presentational components under `shared/ui` import no domain code. Features compose; they do not own domain rules (Principle 1).
- State naming and UI conventions:
  - State is separated by authority, lifetime, and transition model. Observed (telemetry) state and requested (command) state are never collapsed into one value (Principle 11).
  - Freshness is first-class: any surface that shows a value must also indicate how old it is (LIVE / STALE / UNREACHABLE / UNKNOWN) (Principle 4).
  - Freshness is derived server-side and only server-side: a recurring sweep over `receivedAt` in `packages/server`, calling the pure state function in `packages/contracts`. It travels as a field on the envelope. `packages/web` displays it and holds no freshness timer of its own (ADR 3, Principle 1).
  - While the stream is down the console suppresses per-robot freshness labels and lets the connection banner carry the connection-level state. It does not fall back to a client timer (ADR 3).
  - Every asynchronous surface must define its complete user-visible state (loading, empty, stale, offline, recoverable error, terminal error) (Principle 5).
  - Operator view is the default; technician diagnostics are behind an explicit toggle.
  - Target WCAG 2.2 AA. Use semantic HTML, keyboard-operable functionality, and visible, logical focus (Principle 6).
  - The UI may hide or disable actions; it never authorizes them. The server is the authority (Principle 7).
  - Use the existing Material UI theme tokens and tenant config for any visual variation. Do not introduce a second styling system (Principle 8).
  - Tenant branding, endpoints, and feature flags live in typed configuration; no tenant-specific conditionals in components (Principle 13).
- When adding or changing behaviour, point at the best existing example in the same package or feature and imitate its structure, naming, and test style.
- After implementing a user-facing feature, perform end-to-end verification: start the stack, exercise the flow in a browser (or documented equivalent), and confirm the observable result. Compiling and unit tests alone are insufficient (Principle 10).
- Quality bar (enforce by default):
  - Console must never present stale data as current (Principle 4).
  - Virtualize large lists; keep the fleet table usable at several hundred robots (Principle 12).
  - Reject malformed payloads at the boundary; never coerce (Principle 2).
  - Unknown vendor fields are counted, not silently dropped (Principle 3).
  - One-command local start must continue to work.
- Treat PRINCIPLES.md as binding. Every change must stay consistent with the **fifteen** principles.
  If a requested change would violate a principle, stop and surface the conflict instead of
  working around it. When in doubt, re-read PRINCIPLES.md before editing.
- Adding a new vendor means adding one module + fixtures under `/packages/adapters`. Never edit the canonical model or envelope to accommodate a vendor (Principle 3).
- Prefer small, focused diffs. Do not refactor unrelated code while implementing a feature.
- If a change would violate PRINCIPLES.md or an ADR, stop and surface the conflict instead of working around it (Principle 14).

## Routing table

| Looking for                                                                       | Look here                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Canonical envelope, capability types, freshness state function, Zod schemas       | `packages/contracts`                                                          |
| Freshness sweep loop (the recurring interval that calls it)                       | `packages/server`                                                             |
| Vendor dialects, adapters, recorded fixtures, adapter contract tests              | `packages/adapters`                                                           |
| Telemetry producer, fault injection flags, load mode                              | `packages/simulator`                                                          |
| Ingest, adapter dispatch, current-state store, WebSocket fan-out, health endpoint | `packages/server`                                                             |
| React console (primary deliverable)                                               | `packages/web`                                                                |
| App shell, providers, router                                                      | `packages/web/src/app`                                                        |
| Fleet list / site grouping / summary                                              | `packages/web/src/features/fleet`                                             |
| Robot detail, capability-driven panels, operator/technician toggle                | `packages/web/src/features/robot`                                             |
| Robot domain model, selectors, hooks                                              | `packages/web/src/entities/robot`                                             |
| Site / grouping model                                                             | `packages/web/src/entities/site`                                              |
| Pure UI primitives (no domain)                                                    | `packages/web/src/shared/ui`                                                  |
| Formatting, time helpers, transport client                                        | `packages/web/src/shared/lib`                                                 |
| Tenant themes and feature flags                                                   | `packages/web/src/config`                                                     |
| Engineering principles (graded deliverable)                                       | `PRINCIPLES.md`                                                               |
| Architecture Decision Records                                                     | `docs/00_adr/`                                                                |
| How to run, demo script, AI-usage note, measurements                              | `README.md`                                                                   |
| Boundary / dependency enforcement config                                          | `packages/web/eslint.config.js` (rule + resolver), `.github/workflows/ci.yml` |
| Agent routing and hard rules (this file)                                          | `CLAUDE.md`                                                                   |
| Binding engineering principles (must be followed)                                 | `PRINCIPLES.md`                                                               |
