# AGENTS.md

TypeScript monorepo: multi-vendor robot fleet telemetry console.
Packages: `contracts` (canonical), `adapters`, `simulator`, `server`, `web` (React + MUI).
`PRINCIPLES.md` is binding (all **fifteen**). Numbered ADRs are the sole normative decision records. If a change would violate a principle or ADR, stop and surface the conflict — never work around it. When in doubt, re-read `PRINCIPLES.md` before editing.

**Precedence**: `PRINCIPLES.md` outranks this file, path-scoped `AGENTS.md`, specs, plans, and TODOs. Apply every relevant principle; if this file and a principle diverge, follow the principle and surface the gap (Principle 14).

## Context

Load the first matching route only. Do not preload directories or paste `PRINCIPLES.md`, ADRs, specs, or this file back into the conversation. Prefer the `00_*` index → one owning doc → package `AGENTS.md`. Quote the smallest span that decides the change. Search before reading; archive/audit files are never normative.

## Layers (lint/CI, Principle 9)

| From        | May import                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| app         | anything                                                                                                       |
| features    | entities + shared (never other features)                                                                       |
| entities    | shared                                                                                                         |
| shared      | nothing above                                                                                                  |
| `shared/ui` | presentational only; domain logic lives only in `entities` with one authoritative implementation (Principle 1) |

## Rules

- Prefer TDD: write or update a focused test that documents intended behaviour before implementing (Principle 10). After a user-facing change, verify end-to-end in a running browser (or documented equivalent); unit tests alone are not enough (Principle 10).
- One-sentence doc comment on every exported class, function, type, and React component (Principle 14).
- Document non-trivial cross-file/cross-package coupling on both sides; agents rely on search (Principle 14).
- State is separated by authority, lifetime, and transition model. Observed state and requested state are never collapsed (Principle 11).
- Freshness is first-class on every value surface (Principle 4). Derive it server-side only: a sweep over `receivedAt` in `packages/server` calling the pure state function in `packages/contracts`; it travels as a field on the envelope. `packages/web` never derives it and holds no freshness timer. While the stream is down, suppress per-robot labels in favour of the connection banner (ADR 3). Never present stale data as current (P4).
- Every asynchronous surface defines its complete user-visible state: loading, empty, stale, offline, recoverable error, terminal error (Principle 5).
- Operator view is default; technician diagnostics are behind an explicit toggle.
- Target WCAG 2.2 AA: semantic HTML, keyboard-operable functionality, visible logical focus (Principle 6).
- UI may hide or disable actions; it never authorizes them. Server is the authority (Principle 7).
- Use existing Material UI tokens and tenant config; do not introduce another styling system (Principle 8). Tenant branding, endpoints, and feature flags live in typed configuration; no tenant-specific conditionals in components (Principle 13).
- Quality bar: keep the fleet table usable at several hundred robots (P12) — deliberately **not** virtualized; see [ADR 24](docs/00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md) before adding windowing. Reject malformed payloads at the boundary (P2). Count unknown fields (P3). Keep one-command start working.
- New vendor = new module + fixtures under `packages/adapters` only. Never change the canonical model for a vendor (Principle 3).
- Small focused diffs. Do not drive-by refactor. Do not commit code on my behalf.
- `docs/decisions.json` routes D-ids to ADRs. `docs/PENDING_ARCHITECTURE_DECISIONS.md` is generated with `pnpm docs:decisions`; never edit the generated index by hand.
- Follow `docs/DOCUMENT_LIFECYCLES.md` for the mandatory decision and plan state machines (authoritative algorithms and transition rules; CI tests their machine-recognizable invariants). Open decisions require a resolution step; resolved mappings remove it; superseded ADRs name their replacement. Plans in `docs/05_plans/` declare checked status/date metadata; blocked or trigger-deferred plans declare the condition that changes their state.
- In planning mode, create or update the task’s planning document in `docs/05_plans/`. Plans describe intended work and never override `PRINCIPLES.md`, ADRs, or specifications. Search for the owning plan first, execute the plan algorithm in `docs/DOCUMENT_LIFECYCLES.md`, and archive terminal plans rather than leaving stale work in the active directory.
- Every mechanical rule cites its ADR in a nearby comment and is registered under `mechanicalRules` in `docs/decisions.json`; code must not reproduce the ADR rationale.
- TypeScript packages inherit `tsconfig.base.json` with `strict: true` and the additional checked-index, return, override, unused, and switch rules. Typed ESLint must reject explicit `any`; use a precise type or `unknown` plus boundary validation. Run `pnpm check:type-safety` after changing TypeScript or ESLint configuration.
- Package specifications state consequences and link ADRs; they do not repeat decision rationale or status. TODOs are planning-only and audits are historical, as declared by their `Authority` markers.
- Keep README.md, TODO.md, and specification files in sync with code. `docs` are authoritative over code and should inform code.
- When adding behaviour, imitate the best existing example in the same area.

## Verify

Incremental (run the matching line only):

```bash
pnpm check:type-safety         # after tsconfig / ESLint config
pnpm check:doc-comments        # after exported docs (Principle 14)
pnpm check:dependencies        # after imports, new deps, or layer changes (Principle 9)
pnpm check:tokens              # after MUI tokens, theme, or DESIGN_SYSTEM
pnpm docs:decisions            # writes PENDING index; never edit it by hand
pnpm check:architecture-docs   # after ADR, spec, mechanical rule, audit, TODO, or mapping
pnpm record:fixtures           # after vendor/simulator payloads; fixtures must stay clean
pnpm test                      # after behaviour; always serial (`workspace-concurrency=1`)
pnpm test:e2e                  # after user-facing web change (browser, not unit-only)
pnpm test:e2e:scale            # after fleet table / scale / ADR 24
pnpm check:diff-size           # before commit if the diff grew
pnpm check:bundle              # after web/bundle or dependency changes
```

Full local gate (install → docs → type-safety → doc-comments → tokens → deps → audit → lint → typecheck → test → build → fixtures + `git diff --exit-code` on vendor fixtures → diff-size → bundle):

```bash
pnpm check:ci
```

`pnpm test` must stay serial: adapters/server/simulator/web boundary suites lint the tree on disk; a parallel workspace run races those files (packages/FIXME.md F14). Serial cost is a few seconds; do not raise `--workspace-concurrency` to buy speed.

One-command start: `pnpm dev`. Keep it working. Engines: Node `>=24.15.0`, pnpm `>=11.20.0`.

## Routing table

Do not preload a directory. Use each family's `00_*` index.
Read only the first matching route, then follow its “then” path.
For an existing plan, search `docs/05_plans/` by filename or task term and open only the match.
Within a package, read its scoped agent guide (`AGENTS.md`) before editing.

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
| Map view, site facet, or spatial extents                               | `docs/01_page-specs/04_MAP.md`                                     | ADR 35; `packages/web/src/features/map/` and `src/entities/robot/selectors.ts`                 |
| Tenant branding, flags, endpoints, or Vite proxy                       | `packages/web/src/config/tenant.ts`                                | `tenantSelection.ts`, `tenantTheme.ts`, `devServerTarget.ts`, `vite.config.ts`                 |
| Deployment policy or runtime endpoint configuration                    | `config/`                                                          | `packages/server/src/config/` and ADR mapped from `docs/decisions.json`                        |
| Start commands, demo behavior, or operator workflow                    | `README.md`                                                        | Relevant package script in `package.json`                                                      |
| CI, lint boundaries, or architecture-doc checks                        | `.github/workflows/ci.yml`                                         | Package `eslint.config.js`, `scripts/architectureDocs.mjs`, or `scripts/checkBundleBudget.mjs` |
