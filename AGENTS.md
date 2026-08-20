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
- Freshness is derived server-side only — a sweep over `receivedAt` in `packages/server` calling the pure state function in `packages/contracts` — and travels as a field on the envelope. `packages/web` never derives it and holds no freshness timer. While the stream is down, per-robot labels are suppressed in favour of the connection banner (ADR 3).
- Every asynchronous surface defines its complete user-visible state (loading, empty, stale, offline, recoverable error, terminal error) (Principle 5).
- Operator view is default; technician diagnostics are behind an explicit toggle.
- Target WCAG 2.2 AA. Use semantic HTML, keyboard-operable functionality, and visible, logical focus (Principle 6).
- UI may hide or disable actions; it never authorizes them. Server is the authority (Principle 7).
- Use existing Material UI tokens and tenant config; do not introduce another styling system (Principle 8).
- Tenant branding, endpoints, and feature flags live in typed configuration; no tenant-specific conditionals in components (Principle 13).
- When adding behaviour, imitate the best existing example in the same area.
- After a user-facing change, verify end-to-end in a running browser (or documented equivalent). Unit tests alone are not enough (Principle 10).
- Quality bar: never present stale data as current (P4); keep the fleet table usable at several hundred robots (P12) — it is deliberately **not** virtualized, see [ADR 24](docs/00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md) before adding windowing; reject malformed payloads at the boundary (P2); count unknown fields (P3); keep one-command start working.
- Treat PRINCIPLES.md as binding. Every change must stay consistent with the **fifteen** principles.
  If a requested change would violate a principle, stop and surface the conflict instead of
  working around it. When in doubt, re-read PRINCIPLES.md before editing.
- New vendor = new module + fixtures under `packages/adapters` only. Never change the canonical model for a vendor (Principle 3).
- Small focused diffs. Do not drive-by refactor.
- If a change conflicts with PRINCIPLES.md or an ADR, surface the conflict instead of working around it (Principle 14).
- Numbered ADRs are the sole normative decision records. `docs/decisions.json` routes D-ids
  to ADRs, and `docs/PENDING_ARCHITECTURE_DECISIONS.md` is generated with
  `pnpm docs:decisions`; never edit the generated index by hand.
- Follow `docs/DOCUMENT_LIFECYCLES.md` for the mandatory decision and plan state machines.
  Open decisions require a resolution step; resolved mappings remove it; superseded ADRs
  name their replacement. Plans in `docs/05_plans/` declare checked status/date metadata,
  and blocked or trigger-deferred plans declare the condition that changes their state.
- Every mechanical rule cites its ADR in a nearby comment and is registered under
  `mechanicalRules` in `docs/decisions.json`; code must not reproduce the ADR rationale.
- TypeScript packages inherit `tsconfig.base.json` with `strict: true` and the additional
  checked-index, return, override, unused, and switch rules. Typed ESLint must reject
  explicit `any`; use a precise type or `unknown` plus boundary validation. Run
  `pnpm check:type-safety` after changing TypeScript or ESLint configuration.
- Package specifications state consequences and link ADRs; they do not repeat decision
  rationale or status. TODOs are planning-only and audits are historical, as declared by
  their `Authority` markers.
- In planning mode, create or update the task's planning document in `docs/05_plans/`;
  plans describe intended work and never override `PRINCIPLES.md`, ADRs, or specifications.
  Search for the owning plan first, execute the plan algorithm in
  `docs/DOCUMENT_LIFECYCLES.md`, and archive terminal plans rather than leaving stale work
  in the active directory.
- Run `pnpm check:architecture-docs` after changing an ADR, package specification,
  mechanical enforcement rule, audit, TODO, or decision mapping.
- Do not commit code on my behalf.
- Keep README.md, TODO.md, and similar files in sync with code.

### Decision and plan lifecycle

For a decision:

1. Read `PRINCIPLES.md`, search `docs/decisions.json`, and reuse the owning D-id.
2. Keep an unresolved question as `adr: null` with a concrete `next`; create an ADR only
   when choosing a durable position.
3. Map the ADR, remove `next`, add cited and registered mechanical enforcement, and sync
   specifications, TODOs, and READMEs.
4. Amend without reversing the chosen position; otherwise create a replacement ADR and
   mark the old record `Superseded by` it.
5. Run `pnpm docs:decisions` and `pnpm check:architecture-docs`.

For a plan:

1. Search for and update the single owning plan; read its authorities before changing it.
2. Declare planning authority, `Status`, and `Updated`; add `Trigger` only when
   trigger-deferred or `Blocker` only when blocked.
3. Define outcome, scope, ordering, acceptance evidence, documentation closure, and checks.
4. Revalidate authority and identifiers before execution; a plan recommendation is not a
   decision.
5. When the trigger/blocker changes, update metadata and revalidate the plan. When all
   acceptance evidence passes, synchronize durable docs and archive the consumed plan.

The detailed algorithms and transition rules are authoritative in
`docs/DOCUMENT_LIFECYCLES.md`; CI tests their machine-recognizable invariants.

## Routing table

Read only the first matching route, then follow its “then” path. Use each documentation
family's `00_*` index to find its single owning document; do not preload a directory.
For an existing plan, search `docs/05_plans/` by filename or task term and open only the
match. Within a package, read its scoped agent guide before editing.

| Task                                                                   | Start here                                                         | Then narrow to                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Binding constraint, principle, or suspected conflict                   | `PRINCIPLES.md`                                                    | `docs/decisions.json` only when a named decision is involved                                   |
| Decision or plan lifecycle, transition, closure, or archive            | `docs/DOCUMENT_LIFECYCLES.md`                                      | Decision mapping/template or the single owning plan                                            |
| Decision by D-id, ADR topic, or mechanical-rule ownership              | `docs/decisions.json`                                              | The mapped `docs/00_adr/NN_*.md`; generated `PENDING_ARCHITECTURE_DECISIONS.md` is lookup-only |
| Current or proposed work plan                                          | Matching file in `docs/05_plans/`                                  | Owning ADR/specs, then affected package guides and code; create a focused plan if none exists  |
| Repository work queue or implementation gap                            | `TODO.md`                                                          | Matching plan, owning spec, or package-local TODO named by the entry                           |
| Package responsibility, public API, or implementation status           | `docs/03_package-specs/00_PACKAGE_SPECS.md`                        | The package's single numbered spec, then its `AGENTS.md`                                       |
| Page/route behavior, states, hierarchy, or accessibility               | `docs/01_page-specs/00_PAGE_SPECS.md`                              | The route's single numbered spec, then its owning web feature                                  |
| Reusable presentational component contract                             | `docs/02_component-specs/00_COMPONENT_SPECS.md`                    | The component's single numbered spec, then `packages/web/src/shared/ui/`                       |
| Styling tokens, visual rules, or wireframes                            | `docs/DESIGN_SYSTEM.md`                                            | `docs/WIREFRAMES.md` only for layout intent; then web styles/theme/config                      |
| Historical audit, remediation evidence, or superseded work             | The file named by the task; otherwise `docs/04_ARCHIVE/README.md`  | Current ADR/spec/code for present truth; archive and audit files are never normative           |
| Canonical schemas: envelope, capabilities, errors, health, freshness   | `packages/contracts/AGENTS.md` → `packages/contracts/src/index.ts` | Matching `src/{envelope,capabilities,errors,health,freshness}/` module                         |
| Adapter boundary, current implementation, unknown fields, fixtures     | `packages/adapters/AGENTS.md` → `packages/adapters/src/index.ts`   | Package spec first for vendor-module status; then `src/core/` or public `src/testing/`         |
| Simulator CLI, fleet generation, vendor payloads, faults, load, ingest | `packages/simulator/AGENTS.md` → `packages/simulator/src/index.ts` | `src/{cli,fleet,vendors,faults,scheduling,transport}/`                                         |
| Server config, ingest, state, freshness sweep, fan-out, health         | `packages/server/AGENTS.md` → `packages/server/src/index.ts`       | Matching `src/{config,ingest,state,freshness,fanout,health}/` module                           |
| Web ownership and layer/import placement                               | `packages/web/AGENTS.md`                                           | The one layer named by that guide; do not scan all of `src/`                                   |
| App shell, providers, routing, or theme composition                    | `docs/01_page-specs/01_APP_SHELL.md`                               | `packages/web/src/app/`                                                                        |
| Fleet page, scale behavior, or site grouping                           | `docs/01_page-specs/02_FLEET.md`                                   | `packages/web/src/features/fleet/` and `src/entities/{robot,site}/`                            |
| Robot detail, capability panels, or diagnostics                        | `docs/01_page-specs/03_ROBOT_DETAIL.md`                            | `packages/web/src/features/robot/` and `src/entities/robot/`                                   |
| Tenant branding, flags, endpoints, or Vite proxy                       | `packages/web/src/config/tenant.ts`                                | `tenantSelection.ts`, `tenantTheme.ts`, `devServerTarget.ts`, `vite.config.ts`                 |
| Deployment policy or runtime endpoint configuration                    | `config/`                                                          | `packages/server/src/config/` and ADR mapped from `docs/decisions.json`                        |
| Start commands, demo behavior, or operator workflow                    | `README.md`                                                        | Relevant package script in `package.json`                                                      |
| CI, lint boundaries, or architecture-doc checks                        | `.github/workflows/ci.yml`                                         | Package `eslint.config.js`, `scripts/architectureDocs.mjs`, or `scripts/checkBundleBudget.mjs` |
