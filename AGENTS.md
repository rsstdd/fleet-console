# AGENTS.md

This is a TypeScript monorepo for a multi-vendor robot fleet telemetry console: canonical contracts, vendor adapters, thin simulator/server, and a React + Material UI web console.

## Rules

- Prefer test-driven changes. Write or update a focused test that documents intended behaviour before implementing (Principle 10).
- One-sentence doc comment on every exported class, function, type, and React component (Principle 14).
- Document non-trivial cross-file/cross-package coupling on both sides; agents rely on search (Principle 14).
- Strict dependency rule, enforced by lint/CI (Principle 9):
  - app → anything
  - features → entities + shared
  - entities → shared
  - shared → nothing above
  - features never import other features
- `shared/ui` is pure presentational; domain logic lives only in `entities` and has one authoritative implementation (Principle 1).
- State is separated by authority, lifetime, and transition model. Observed state and requested state are never collapsed (Principle 11).
- Freshness is first-class on every value surface (Principle 4).
- Every asynchronous surface defines its complete user-visible state (loading, empty, stale, offline, recoverable error, terminal error) (Principle 5).
- Operator view is default; technician diagnostics are behind an explicit toggle.
- Target WCAG 2.2 AA. Use semantic HTML, keyboard-operable functionality, and visible, logical focus (Principle 6).
- UI may hide or disable actions; it never authorizes them. Server is the authority (Principle 7).
- Use existing Material UI tokens and tenant config; do not introduce another styling system (Principle 8).
- Tenant branding, endpoints, and feature flags live in typed configuration; no tenant-specific conditionals in components (Principle 13).
- When adding behaviour, imitate the best existing example in the same area.
- After a user-facing change, verify end-to-end in a running browser (or documented equivalent). Unit tests alone are not enough (Principle 10).
- Quality bar: never present stale data as current (P4); virtualize large lists (P12); reject malformed payloads at the boundary (P2); count unknown fields (P3); keep one-command start working.
- Treat PRINCIPLES.md as binding. Every change must stay consistent with the **fifteen** principles.
  If a requested change would violate a principle, stop and surface the conflict instead of
  working around it. When in doubt, re-read PRINCIPLES.md before editing.
- New vendor = new module + fixtures under `packages/adapters` only. Never change the canonical model for a vendor (Principle 3).
- Small focused diffs. Do not drive-by refactor.
- If a change conflicts with PRINCIPLES.md or an ADR, surface the conflict instead of working around it (Principle 14).

## Routing table

| Looking for                                              | Look here                         |
| -------------------------------------------------------- | --------------------------------- |
| Canonical envelope, capabilities, freshness, Zod schemas | `packages/contracts`              |
| Vendor adapters + fixtures + contract tests              | `packages/adapters`               |
| Simulator + fault injection + load mode                  | `packages/simulator`              |
| Ingest, dispatch, state, WebSocket, health               | `packages/server`                 |
| React console                                            | `packages/web`                    |
| App shell / providers / router                           | `packages/web/src/app`            |
| Fleet feature                                            | `packages/web/src/features/fleet` |
| Robot detail feature                                     | `packages/web/src/features/robot` |
| Robot entity                                             | `packages/web/src/entities/robot` |
| Site entity                                              | `packages/web/src/entities/site`  |
| Pure UI primitives                                       | `packages/web/src/shared/ui`      |
| Shared lib / transport                                   | `packages/web/src/shared/lib`     |
| Tenant config / flags                                    | `packages/web/src/config`         |
| Principles                                               | `PRINCIPLES.md`                   |
| ADRs                                                     | `docs/00_adr/`                    |
| Run instructions, demo, AI note                          | `README.md`                       |
| This agent guide                                         | `CLAUDE.md` / `AGENTS.md`         |
| Binding engineering principles (must be followed)        | `PRINCIPLES.md`                   |
