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
- `docs/PENDING_ARCHITECTURE_DECISIONS.md` holds cross-package choices that packages have
  not yet ratified and tombstone links for those that are. It is generated from
  `docs/decisions.json` and ADR headers; never edit it by hand. A package spec summarizes
  an ADR's consequence in one paragraph and links the normative ADR instead of repeating
  its rationale or status.

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
            └───────────────────────────┘
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
- **`@fleet/simulator` imports no workspace package in production.** Its boundary with
  the server is the HTTP ingest endpoint. `@fleet/adapters` is a dev dependency permitted
  only in tests so `src/fleet/vendorId.test.ts` can compare the independent vendor
  literals; lint bans it everywhere else and enforcement fixtures prove the exception is
  narrow (decision **D7**, ratified as Option 1 by ADR 16).
- **`web` may import `@fleet/contracts`.** It may not import `@fleet/server`: the
  canonical envelope arrives over the wire, already decoded. `@fleet/adapters` is a
  **test-only** edge — a devDependency banned in production code and lifted only for test
  files (decision **D3**, ratified as Option 1 by ADR 12).
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

- One-sentence doc comment on every class, function, type, and component exported or
  re-exported by the package's declared public entry points, and in `web` on the surface
  another layer imports or the app shell composes (ADR 37). Internal exports are
  documented only where the sentence earns its place.
- Non-trivial cross-package coupling is commented on **both** sides, naming the other
  file. Agents find related code by search; implied coupling is invisible.
- `export type` for type-only exports, required by `verbatimModuleSyntax`.
- No dependency without an ADR. `CLAUDE.md` states the rule; ADR 6 § Constraints is the
  first record invoking it, and records a decision **not** to add one. ADR 8 discharges it
  for `hono`, `@hono/node-server` and `ws`; ADR 9 for `tsx` and the `esbuild` it wraps,
  including the `allowBuilds` approval that lets `esbuild`'s `postinstall` run.

**Testing** (Principle 10)

- Domain rules as pure units, adapters as contracts, components through accessible user
  behaviour, critical workflows in a real browser or process.
- Deterministic fixtures, injected time, controlled network. No test sleeps against the
  wall clock except where explicitly marked integration.
- No snapshot tests. A snapshot asserts output did not change, not that it is correct.

**Enforcement** (Principle 15)

- Every binding rule names its mechanism: Static, Types, Test, Runtime or Review.
- Rules whose violation is mechanically recognizable are automated, and the automation is
  itself tested. Three packages carry deliberate violations that prove their rules still
  fire: `packages/adapters/src/__enforcement__/`,
  `packages/web/src/**/__boundary-violation__/` and
  `packages/server/src/__boundary-violation__/`. The first two also carry a `legal.ts`
  control that violates nothing; the server does not — see `04_SERVER.md` § 7 for why its
  assertions still catch the failure ADR 7 was written about, and what they miss. ADR 7
  records why the control matters: a rule reporting nothing for every input passes every
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

## 8. Current state — 23 August 2026

| Package   | Tests | Lint | Typecheck | Runtime status                                                                                 |
| --------- | ----- | ---- | --------- | ---------------------------------------------------------------------------------------------- |
| contracts | 180   | pass | pass      | Complete, including the battery-history response (ADR 33)                                      |
| adapters  | 227   | pass | pass      | Complete, including dispatch and joining evidence                                              |
| simulator | 211   | pass | pass      | Complete and runnable                                                                          |
| server    | 193   | pass | pass      | Runnable HTTP ingest, reads (battery history included) and WebSocket fan-out                   |
| web       | 405   | pass | pass      | Live decoded store, transport, automatic recovery, and the battery-history sparkline are built |

The live simulator-to-console path is implemented, including automatic stream recovery and
server-restart reconciliation (ADR 31, register D22), and is proven end to end in real
browsers by the committed Playwright suite (ADR 32, register D23).

One registered decision remains open in `docs/PENDING_ARCHITECTURE_DECISIONS.md`:
**D27**, enable the React Compiler build transform in web (registered 21 August 2026;
waits on bundle-size and scale evidence per ADR 22 and ADR 24, and gates the
memoization-removal sweep). **D17 is resolved by ADR 22 as Option 3:** gate
the first-load bundle and ADR 2's defensible validation falsifier, while reporting adapter
coverage without a threshold. The 90% proposal is retired because it was underived and
would have measured an empty vendor-source set. The decision register remains the
authoritative status summary for every registered stub.
