# AGENTS.md

This is a TypeScript monorepo for a multi-vendor robot fleet telemetry console: canonical contracts, vendor adapters, thin simulator/server, and a React + Material UI web console.

## Rules

- Prefer test-driven changes. Write or update a focused test that documents intended behaviour before implementing.
- One-sentence doc comment on every exported class, function, type, and React component.
- Document non-trivial cross-file/cross-package coupling on both sides; agents rely on search.
- Strict dependency rule (enforced by lint/CI):
  - app → anything
  - features → entities + shared
  - entities → shared
  - shared → nothing above
  - features never import other features
- `shared/ui` is pure presentational; domain logic lives only in `entities`.
- Observed state and requested state are never collapsed. Freshness is first-class on every value surface.
- Operator view is default; technician diagnostics are behind an explicit toggle.
- Use existing Material UI tokens and tenant config; do not introduce another styling system.
- When adding behaviour, imitate the best existing example in the same area.
- After a user-facing change, verify end-to-end in a running browser (or documented equivalent). Unit tests alone are not enough.
- Quality bar: never present stale data as current; virtualize large lists; reject malformed payloads; count unknown fields; keep one-command start working.
- Treat PRINCIPLES.md as binding. Every change must stay consistent with the ten principles.
  If a requested change would violate a principle, stop and surface the conflict instead of
  working around it. When in doubt, re-read PRINCIPLES.md before editing.
- New vendor = new module + fixtures under `packages/adapters` only. Never change the canonical model for a vendor.
- Small focused diffs. Do not drive-by refactor.
- If a change conflicts with PRINCIPLES.md or an ADR, surface the conflict instead of working around it.

## Routing table

| Looking for | Look here |
|-------------|-----------|
| Canonical envelope, capabilities, freshness, Zod schemas | `packages/contracts` |
| Vendor adapters + fixtures + contract tests | `packages/adapters` |
| Simulator + fault injection + load mode | `packages/simulator` |
| Ingest, dispatch, state, WebSocket, health | `packages/server` |
| React console | `packages/web` |
| App shell / providers / router | `packages/web/src/app` |
| Fleet feature | `packages/web/src/features/fleet` |
| Robot detail feature | `packages/web/src/features/robot` |
| Robot entity | `packages/web/src/entities/robot` |
| Site entity | `packages/web/src/entities/site` |
| Pure UI primitives | `packages/web/src/shared/ui` |
| Shared lib / transport | `packages/web/src/shared/lib` |
| Tenant config / flags | `packages/web/src/config` |
| Principles | `PRINCIPLES.md` |
| ADRs | `docs/adr/` |
| Run instructions, demo, AI note | `README.md` |
| This agent guide | `CLAUDE.md` / `AGENTS.md` |
| Binding engineering principles (must be followed) | `PRINCIPLES.md` |
