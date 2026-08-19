# canonical-fleet package specifications

Status: implementation-tracking package contract index
Scope: every directory under `packages/`
Layer: workspace structure, package boundaries, public APIs

## 1. Purpose

Each workspace package has one owning document. Where the ADRs record _why_ a boundary
exists and `AGENTS.md` records _how to work inside_ a package, these documents record
_what the package is_: its responsibility, its public API, what enforces its boundary,
and what is and is not built.

The distinction from the existing spec families is deliberate:

| Family                | Owns                                            |
| --------------------- | ----------------------------------------------- |
| `00_adr/`             | Decisions and their arguments                   |
| `01_page-specs/`      | One route's behaviour and states                |
| `02_component-specs/` | One presentational primitive's contract         |
| `03_package-specs/`   | One package's responsibility and public surface |

A package spec never restates an ADR's argument. It cites the ADR and states the
consequence.

## 2. Ownership

| Package              | Owning specification | Name               | Role                                             |
| -------------------- | -------------------- | ------------------ | ------------------------------------------------ |
| `packages/contracts` | `01_CONTRACTS.md`    | `@fleet/contracts` | Canonical envelope, capabilities, freshness      |
| `packages/adapters`  | `02_ADAPTERS.md`     | `@fleet/adapters`  | Vendor dialect decoding and normalization        |
| `packages/simulator` | `03_SIMULATOR.md`    | `@fleet/simulator` | Deterministic multi-vendor telemetry producer    |
| `packages/server`    | `04_SERVER.md`       | `@fleet/server`    | Runtime authority: ingest, state, sweep, fanout  |
| `packages/web`       | `05_WEB.md`          | `web`              | The operations console — the primary deliverable |

`packages/web` is named `web`, not `@fleet/web`, because it is a Vite application rather
than a workspace library: it has no `exports` map and nothing imports it (ADR 9
§ Constraints).

## 3. Normative hierarchy

- `PRINCIPLES.md` and `docs/00_adr/` govern. Where a package spec and a principle or ADR
  disagree, the principle or ADR governs and the spec is corrected.
- `packages/*/AGENTS.md` and `packages/*/CLAUDE.md` are the scoped working instructions
  for agents inside a package. They must not contradict these specs; when they do, the
  conflict is resolved and recorded in the relevant ADR's `Observed consequences` rather
  than settled locally.
- These specs own the description of the package as it exists. They are updated with the
  code, not ahead of it.

The last rule matters most. A package spec that describes intended behaviour as though it
shipped is the fabricated confidence Principle 14 exists to prevent. Every section 11
below states what is built and what is not.

## 4. The dependency graph

```
                 ┌──────────────────┐
                 │ @fleet/contracts │  imports nothing from the workspace
                 └────────┬─────────┘
            ┌─────────────┼──────────────┐
            ▼             ▼              ▼
   ┌────────────────┐  ┌──────┐  ┌──────────────┐
   │ @fleet/adapters│  │ web  │  │ @fleet/server│
   └────────┬───────┘  └──────┘  └──────┬───────┘
            └─────────────────────────────┘
                    server imports adapters

   ┌───────────────────┐
   │ @fleet/simulator  │  imports no workspace package;
   └───────────────────┘  reaches the server over HTTP only
```

Binding consequences:

- **`@fleet/contracts` imports nothing from the workspace.** It is the one package that
  must stay at the bottom, because everything else decodes against it.
- **`@fleet/adapters` may import `@fleet/contracts` and nothing else.** It sits below
  transport, storage and UI.
- **`@fleet/simulator` imports no workspace package in production code.** Its boundary
  with the server is the HTTP ingest endpoint; adapter imports are permitted in tests
  only, to verify generated payloads.
- **`web` may import `@fleet/contracts`.** It may not import `@fleet/server` or
  `@fleet/adapters`: the canonical envelope arrives over the wire, already decoded.
- **Nothing imports `web`, and nothing imports `@fleet/simulator`.**

Each package's `eslint.config.js` enforces its own outbound bans with
`no-restricted-imports`; `web` additionally enforces its internal layering with
`eslint-plugin-boundaries` (ADR 4, ADR 7).

## 5. Shared conventions

Binding on every package.

**Packaging** (ADR 9)

- Library packages export TypeScript source from `./src/index.ts` with no build step.
  `build` is `tsc --noEmit` — a check that produces no artifact.
- Consumers import from the package root. Deep imports into internal paths are not part
  of any package's contract.
- Packages that execute run through `pnpm dev` / `pnpm start`. `node path/to/file.ts` is
  not a supported entry point for any package importing a workspace dependency.
- Shared toolchain versions come from the pnpm catalog (`typescript: "catalog:"`), never
  a restated range. Workspace dependencies use `workspace:*`.

**Source**

- One-sentence doc comment on every exported class, function, type and component
  (Principle 14).
- Non-trivial cross-package coupling is commented on **both** sides, naming the other
  file. Agents find related code by search; implied coupling is invisible.
- `export type` for type-only exports, required by `verbatimModuleSyntax`.
- No dependency without an ADR (ADR 6 § Related establishes the rule; ADR 8 and ADR 9
  discharge it for Hono, `ws`, `tsx` and `esbuild`).

**Testing** (Principle 10)

- Domain rules as pure units, adapters as contracts, components through accessible user
  behaviour, critical workflows in a real browser or process.
- Deterministic fixtures, injected time, controlled network. No test sleeps against the
  wall clock except where explicitly marked integration.
- No snapshot tests. A snapshot asserts output did not change, not that it is correct.

**Enforcement** (Principle 15)

- Every binding rule names its mechanism: Static, Types, Test, Runtime or Review.
- Rules whose violation is mechanically recognizable are automated, and the automation is
  itself tested. `packages/adapters/src/__enforcement__/` and
  `packages/web/src/**/__boundary-violation__/` are deliberate violations that prove the
  rules still fire, plus a control file that violates nothing. ADR 7 records why the
  control is not optional: a rule reporting nothing for every input passes every
  assertion that only checks for silence.
- Do not repair or delete an enforcement fixture. A failure there means a rule stopped
  working, not that the fixture is wrong.

## 6. Shared document template

Every package specification includes:

1. Responsibility and non-responsibilities
2. Position in the dependency graph
3. Public API
4. Internal structure
5. Contracts owned and consumed
6. Governing decisions
7. Enforcement
8. State, lifecycle and configuration
9. Failure behaviour
10. Verification matrix
11. Implementation status
12. Change rules

Sections 8 and 9 collapse to "not applicable" for a package that holds no state and has
no runtime failure modes; they are not omitted, because an empty section is a claim and a
missing one is an oversight.

## 7. Definition of done

A package matches its specification when:

- the public API in section 3 is what `src/index.ts` actually exports;
- every enforcement mechanism in section 7 has a test proving it fires;
- section 11 states what is built without describing unbuilt work in the present tense;
- `pnpm lint`, `pnpm test`, `pnpm typecheck` and `pnpm build` pass in that package;
- the package's `AGENTS.md` and this specification do not contradict each other.

## 8. Current state — 19 August 2026

| Package   | Tests | Lint | Typecheck | Runtime status                                     |
| --------- | ----- | ---- | --------- | -------------------------------------------------- |
| contracts | 96    | pass | pass      | Complete                                           |
| adapters  | 14    | pass | pass      | Core primitives only; no vendor adapters yet       |
| simulator | 182   | pass | pass      | Complete and runnable                              |
| server    | 35    | pass | pass      | Framework-independent pieces only; no listener yet |
| web       | 135   | pass | pass      | Substantially built                                |

462 tests across five packages. The two gaps — vendor adapters and the server listener —
are the critical path; every other package is waiting on one or both to be verified
end to end.
