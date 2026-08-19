# Fleet Console

Multi-vendor robot fleet telemetry console. Canonical contracts, vendor adapters, thin simulator/server, React + Material UI console.

**Core guarantees:**

1. The console never presents stale state as current; enforced by tooling, survives team turnover/agent-written code (Principle 4).
2. Vendor differences are normalized where shared and preserved as declared capabilities where not (flattening differences deletes the product) (Principle 3).

Sections 2-3 cover freshness; 4 covers normalization; 7 covers scale.

> **Implementation status — 19 August 2026.** This README describes the design in the
> present tense throughout. Parts of it are not built yet, and where a section claims
> behavior the tree does not have, it is now marked **[NOT BUILT]** or **[PARTIAL]**
> inline rather than quietly left standing.
>
> The short version: `contracts`, `simulator`, and the `web` console are built. There
> is **no server process** — no HTTP listener, no WebSocket, no `/api/health` — and
> **no vendor adapter modules**. The console runs on fixtures. Section 5 has the
> per-item table; [`packages/FIXME.md`](packages/FIXME.md) has the cross-package
> reconciliation list and [`TODO.md`](TODO.md) the work queue.

---

## 1. Architecture

Fleet operators watch robots from three manufacturers with different wire dialects. The console shows one coherent fleet, explicit about data age and machine capabilities.

Two deliberate hard problems:

- **Silence is an event:** Freshness derived by a recurring server sweep, not on arrival. Robots degrade LIVE → STALE → UNREACHABLE autonomously. Systems reacting only to arrivals miss silence, showing stale data as current. The console displays what the sweep determined and never recomputes it (ADR 3).
- **Vendors disagree:** Three awkward dialects normalized into a canonical envelope (core shared data) + declared capabilities. UI renders from declarations, not hard-coded lists.

|             |                                                                                                                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack       | React · TypeScript · Vite · Material UI with design-token layer                                                                                                                                                                                |
| Layout      | pnpm workspace, feature-sliced web package                                                                                                                                                                                                     |
| Enforcement | `eslint-plugin-boundaries`, token/hex lint, `strictTypeChecked`, CI (Principle 15)                                                                                                                                                             |
| Specs       | [`PRINCIPLES.md`](PRINCIPLES.md) · [ADRs](docs/00_adr/) · [decision index](docs/PENDING_ARCHITECTURE_DECISIONS.md) · [page specs](docs/01_page-specs/) · [component specs](docs/02_component-specs/) · [package specs](docs/03_package-specs/) |
| Design      | [design system](docs/DESIGN_SYSTEM.md) · [wireframes](docs/WIREFRAMES.md)                                                                                                                                                                      |
| Records     | [architecture audit](docs/ARCHITECTURE_AUDIT.md) · [submission notes](docs/SUBMISSION_NOTES.md) · [archive](docs/04_ARCHIVE/)                                                                                                                  |

```
/packages
  /contracts    canonical envelope, capability types, freshness machine, Zod schemas (Principle 2)
  /adapters     one module per vendor dialect, plus recorded vendor fixtures (Principle 2, 3)
                [PARTIAL] result type, unknown-field ledger, vendor union, one recorded
                fixture per vendor and a public `testing` subpath; no A/B/C module,
                no schema, no registry
  /simulator    multi-vendor telemetry producer with fault injection
  /server       ingest, adapter dispatch, current state, WebSocket fan-out, health
                [PARTIAL] framework-independent core only (config, store, ring buffer,
                sweep, delta coalescer, health counters); no process listens
  /web          the console — primary deliverable
PRINCIPLES.md   binding engineering principles
AGENTS.md       normative agent routing and hard rules (Principle 14)
CLAUDE.md       compatibility pointer to AGENTS.md
/docs/00_adr    architecture decision records
```

`/adapters` is a standalone package: it's a contract boundary, changes most often, and must be testable/versionable without touching the dispatcher. Adding a vendor = 1 module + 1 fixture. Zero canonical model edits.

### Updating architecture decisions

Numbered ADRs are the normative decision records. `docs/decisions.json` routes decision
IDs to those ADRs, and `docs/PENDING_ARCHITECTURE_DECISIONS.md` is a generated index; do
not edit the index directly. CI checks their consistency on every change. To update a
decision:

1. Edit the normative ADR and its entry in `docs/decisions.json`.
2. Run `pnpm docs:decisions` to regenerate the decision index.
3. Run `pnpm check:architecture-docs` before committing.

---

## 2. Run it

```bash
pnpm install
pnpm dev
```

The web tenant is selected at build time with `VITE_TENANT=tenant-a|tenant-b`; omitting
it selects tenant A. For example, `VITE_TENANT=tenant-b pnpm --filter web build` produces
the Tenant B bundle. Unknown values fail the build rather than silently falling back
(ADR 17).

D13 is settled as **Option 2 — environment variables at server startup plus a Vite dev
proxy, with strict startup validation**
([ADR 21](docs/00_adr/21_ENDPOINTS_FROM_THE_ENVIRONMENT_WITH_A_DEV_PROXY.md)). The server
and development proxy both default to `127.0.0.1:8080`. Override them together with
`FLEET_SERVER_HOST` and `FLEET_SERVER_PORT`; set `FLEET_ALLOWED_ORIGINS` to a
comma-separated list of exact origins only for a cross-origin production deployment.
Present-but-invalid values fail startup rather than being coerced or silently defaulted.

Both shipped consoles call same-origin `/api` and `/ws`, which Vite proxies in development,
so CORS is intentionally not exercised there. Serving the console from a different origin
than the API is the decision's falsifier: that deployment must configure the allow-list and
add integration coverage for accepted and rejected cross-origin requests.

**[PARTIAL] Starts the simulator and the console, not the server.** Root `dev` is
`pnpm --recursive --parallel --stream dev`, and only `simulator` and `web` define a
`dev` script — `server` defines neither `dev` nor `start` and has no executable
entry point. The console comes up on `http://localhost:5173` (Vite's default;
`packages/web/vite.config.ts` sets no `server.port`). The simulator comes up and POSTs
at its default endpoint `http://127.0.0.1:8080`, where nothing is listening, so every
reading fails to deliver.

Until the server's composition root lands, the console renders a fixture set
(`web/src/entities/robot/useFleetRobots.ts`) rather than simulator data, and the two
processes `pnpm dev` starts are not connected to each other.

**30-second observations** (against the fixture set today, the live fleet once the
server lands):

1. **Summary strip:** Counts freshness only (`LIVE`, `STALE`, `UNREACHABLE`, `UNKNOWN`). Mutually exclusive, totals fleet exactly. No status duplication.
2. **Rows:** Show status + freshness. Non-`LIVE` rows use outline status chips (`(last known)`) and em-dash batteries (no stale numbers presented as current). **The freshness column is empty today**: no transport supplies a connection state, the default is `disconnected`, and ADR 3 suppresses per-robot labels while the stream is down. Seeing the labels requires the live path, not a config change.
3. **Vendor column:** Filter to Vendor C vs A. Capability panels differ because robots differ.

---

## 3. Demo script

**[NOT BUILT] as an end-to-end sequence.** Every step below depends on the server
process, which does not exist; steps 3-6 additionally depend on the vendor adapters.
The simulator commands are real and run today — they just have no receiver. Kept in
the present tense as the acceptance criteria for the transport work, not as a claim
about the current tree.

Sequence to watch (Steps 2 & 4 are the submission):

1. Open fleet (50 robots). All `LIVE`.
2. Compare capability panels across all three vendors: A shows dock + lidar-health, B shows dock alone, C shows dock + water-level. **(The web fixture currently contradicts this: it gives Vendor B `lidarHealth` too, and the detail tests assert it. ADR 1 § Observed consequences resolves B to `dock` alone — see `packages/FIXME.md` F1.)** Three vendors, three distinct panel sections. Absence is the interface (no disabled placeholders). Cannot offer unsupported actions.
3. Simulator `--drop` 3 robots (`R-007,R-023,R-041` — ids must exist in the 50-robot default fleet; an unknown id fails at startup rather than silently dropping nothing). No message sent to console.
4. Watch 3 rows degrade on the server sweep (`STALE` → `UNREACHABLE`). Others stay `LIVE`. Status chips hollow, batteries em-dash. Caused by message absence.
5. Kill stream. Connection banner appears, table retains last-known data, per-robot freshness labels are suppressed. **([PARTIAL] The suppression rule is built and tested — connection state travels through `ConnectionContext` in `shared/lib`, both pages render `FreshnessLabel` only while the stream is connected, and the default is `disconnected` rather than an optimistic `connected` ([ADR 23](docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md)). What cannot be demonstrated is the step itself: with no transport there is no stream to kill, so the rule is proved against injected states rather than a real socket, and today the console reports itself disconnected and shows no freshness labels at all. That is the honest reading, not a bug.)** With no live connection the console has no current per-robot answer and says so at the connection level rather than guessing per row (ADR 3). No blank page or frozen lies (Principle 5).
6. Restore stream. Labels return; rows resume degrading on the sweep (no reload).

Steps 4 and 5 are different failures on purpose: 4 is a robot going silent, 5 is the console going blind. Deriving freshness server-side is what lets the console tell them apart.

Simulator commands for the steps above (verified against `packages/simulator`: the
default fleet is 50 robots at 1 Hz, ids run `R-001`-`R-050`, and `--drop` validates
its ids against the built fleet before any timer starts):

```bash
# Step 1 — the demo workload: 50 robots, 1 Hz each
pnpm --filter @fleet/simulator start

# Step 3 — three robots go silent; the process and every other robot stay healthy
pnpm --filter @fleet/simulator start -- --drop R-007,R-023,R-041

# Step 6 — recovery is a restart without the flag; dropped robots resume where they stopped
pnpm --filter @fleet/simulator start
```

`--hz` is per robot, so the load profile is `--robots 500 --hz 5` (~2,500 req/s). See
[`packages/simulator/README.md`](packages/simulator/README.md) for every flag.

---

## 4. Vendors & Adapter Layer

Multi-manufacturer normalization is the business. 3 producers disagree on purpose.

| Dialect      | How it differs                                                                                                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vendor A** | Nested payload · battery 0–1 fraction · position in meters · ISO 8601 timestamps · status enum `idle` / `busy` / `charging` / `fault`                                                     |
| **Vendor B** | Flat payload · battery int percentage · position in cm · epoch-ms timestamps · status numeric code · **no sequence** (adapter synthesizes ordering from timestamp) · declares `dock` only |
| **Vendor C** | Like A, but declares `waterLevel`, omits `lidarHealth`, sends undocumented field                                                                                                          |

**Adapter jobs:** Identify, convert telemetry/errors to envelope, declare capabilities, retain raw payload for diagnosis (hidden from read model).
**Canonical envelope:** schema version, robot/site/vendor/model identity, adapter id and version, `reportedAt` and `receivedAt`, normalized core, server-derived freshness, capability record. Core: connectivity, battery, position, status, health.

Two corrections against ADR 1, which is the current authority: **sequence** is a declared capability rather than an envelope field, because Vendor B sends none; and **raw payload** is excluded from the fleet read model and the delta stream, served only on the single-robot endpoint as a separate boundary type. `@fleet/contracts` rejects an envelope carrying either, which is what makes the exclusion checkable rather than a convention.

**Consequences:**

- **Capabilities drive UI, not vendor names.** `if (vendor === …)` in `features/` is a defect (Principle 3).
- **Unknown fields counted.** Vendor C's undocumented field increments a per-adapter counter on `GET /api/health`. Quietly discarding data rots integrations. **([NOT BUILT] The ledger exists — `adapters/src/core/unknownFields.ts` — but there is no Vendor C adapter to feed it and no `/api/health` route to serve it.)**
- **Vendor B's synthesized sequence is weaker.** Timestamp ordering can not distinguish duplicates from same-ms events. Recorded as a known limitation.

**[PARTIAL]** Adapter contract tests verify normalization: recorded vendor payload → exact canonical event (Principle 10). 3 fixtures, 3 assertions. **The fixtures exist and the assertions do not.** `pnpm record:fixtures` records one representative payload per vendor from the simulator into `packages/adapters/src/vendors/*/__fixtures__/`, and CI fails if the tree produces a different byte ([ADR 13](docs/00_adr/13_RECORDED_FIXTURES_WITH_A_CI_DRIFT_GUARD.md)); `packages/adapters` also ships the result type, the unknown-field ledger, the vendor union, a public `testing` subpath for the fixtures ([ADR 11](docs/00_adr/11_PUBLIC_TESTING_SUBPATH_FOR_FIXTURES.md)), and its boundary-enforcement fixtures. What does not exist is any vendor schema, adapter module, or registry — so nothing consumes a fixture yet. This remains the single largest gap between this document and the tree.

**Site hierarchy:** 1 level (robots → sites). Extends rather than changes shape for org → site → building → fleet → robot.

---

## 5. Scope

Unequal weighting: console is submission; simulator/server feed it.

| Package                   | Weight      | Why                                                                                 |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `/web`                    | Heaviest    | Deliverable. Structure, freshness honesty, capability rendering, personas, theming. |
| `/contracts`, `/adapters` | Substantial | Normalization argument & checkable adapter tests.                                   |
| `/server`, `/simulator`   | Thin        | Produce dialects, inject faults, fan out deltas. No more.                           |

Budget: 10–11 hours / 3 days.

Status as of 19 August 2026, verified against the tree. Cuts go in section 9.

| Built                                                         | Status                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical envelope + capability model + freshness machine     | **Built.** Schemas, capability wire codec, `deriveFreshness`, tests.                                                                                                                                                                                    |
| Three vendor adapters + recorded fixtures + contract tests    | **Partial.** One recorded fixture per vendor, drift-gated in CI (ADR 13), plus core primitives and a public `testing` subpath (ADR 11). No A/B/C module, no schema, no registry, no contract test.                                                      |
| Simulator with vendor mix and fault-injection flags           | **Built.** Three dialects, `--drop`, seeded fleet, bounded transport, integration tests.                                                                                                                                                                |
| Server: ingest, dispatch, idempotent upsert, health endpoint  | **Partial.** Store-level upsert rejects duplicate/out-of-order sequences and `HealthMetrics` counts; no HTTP, no dispatch, no endpoint.                                                                                                                 |
| WebSocket fan-out with coalescing                             | **Partial.** `PendingDeltaSet` coalesces; nothing opens a socket.                                                                                                                                                                                       |
| Fleet view: summary, filters, table                           | **Built**, fixture-backed. Freshness summary, site/vendor/freshness/search filters, table.                                                                                                                                                              |
| Robot detail: capability panels, operator/technician personas | **Built**, fixture-backed.                                                                                                                                                                                                                              |
| Connection-integrity handling                                 | **Partial.** `ConnectionBanner`, `ConnectionContext` and per-robot label suppression are built and tested (ADR 23), failing closed to `disconnected`. No transport supplies a real state, so it is proved against injected states rather than a socket. |
| Tenant theming + one gated feature                            | **Built.** Build-time profiles are validated; Tenant B disables the lidar-health panel through `flags.lidarHealthPanel` (ADR 17).                                                                                                                       |
| Enforced dependency boundaries in lint and CI                 | **Built.** `eslint-plugin-boundaries` + resolver, violation fixtures, `.github/workflows/ci.yml`.                                                                                                                                                       |

---

## 6. Principles

[`PRINCIPLES.md`](PRINCIPLES.md) is binding. Every rule names an enforcement mechanism (static check, type, test, runtime, review). Review-only rules are conventions, not guarantees (Principle 15).

- **§3 Canonical model:** Normalizes shared meaning, preserves differences as typed capabilities. Capabilities limit UI offerings, not server authorization or current availability.
- **§4 Provenance/Freshness:** Values carry source timestamps (`reportedAt` and `receivedAt`). Freshness is derived server-side from `receivedAt` against a configured policy, tested with an injected clock, and delivered as a field (ADR 3). The client displays; it never computes. Rejects absolute version: badges aren't needed everywhere, only at smallest scope needed to act.
- **§6 Accessibility:** Target WCAG 2.2 AA. Semantic HTML, visible focus, contrast verification.
- **§7 Security/Privacy:** Server is the authority. UI hides/disables, but never authorizes. Requested ≠ observed.
- **§8 Design tokens:** Rejects raw hex/px outside `shared/ui`/`config`.
- **§9 Boundaries:** `shared/ui` gets display data/callbacks only. No domain imports. No cross-feature imports. Lint-checked.
- **§10 Tests:** Tests prove behavior at the cheapest reliable boundary. No component snapshots (asserts no-change, not correctness).
- **§11 State:** State is separated by authority, lifetime, and transition model. Requested ≠ observed.
- **§12 Performance:** Performance and observability are product behavior. Two budgets are enforced in CI — the console's first-load size and per-message ingest validation cost ([ADR 22](docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md)). Ingest latency and client frame time have no budget yet, because neither can be measured until the server transport exists; see § 10.
- **§14 Agent operability:** `CLAUDE.md`/`AGENTS.md` have hard rules + routing table. Structure makes agent code checkable.

---

## 7. Scale (Holding at 4000 Files)

Feature-sliced, not type-sliced (`components/`, `hooks/` smear code across features).

```
/web/src
  /app        providers, router, shell
  /features   fleet · robot          (composition only)
  /entities   robot · site           (domain model, selectors — no JSX, no MUI)
  /shared     ui (pure, domain-free) · lib (formatting, time, transport)
                                        [PARTIAL] lib holds time.ts only; no transport client
  /config     tenant themes, feature flags
                                        build-time selected, schema-validated profiles
```

**Dependency rule:** `app` → any; `features` → `entities`, `shared`; `entities` → `shared`; `shared` → nothing up; no cross-feature (Principle 9).
**Enforcement:** Lint/CI tested. `__boundary-violation__/` tests cross-feature rejection + legal import non-error. Agent slop fails builds.
**Lint pass:** Rejects raw hex/px outside `shared/ui`/`config` (Principle 8), forbids `enum` (string-literal unions), runs `strictTypeChecked` + `jsx-a11y` (Principle 6).
**Agent governance:** `CLAUDE.md`/`AGENTS.md` have hard rules + routing table (what → which package) (Principle 14). Per-package overrides alongside code. Exported symbols = 1-sentence doc comment. Cross-package coupling documented on both sides (searchable).
**ADRs:** Precede implementation. Amended under `## Observed consequences` if changed. Never claim ADR describes reality if diverged.
**Personas:** Operator summary default; technician diagnostics (raw payload, seq gaps, clock delta) behind toggle. 1 layout.
**White-label:** Config (`/config`), not conditionals (Principle 13). Theme, wordmark and features are selected together per build and validated at module load. `flags.lidarHealthPanel` is off for Tenant B; per-tenant component conditionals are defects. Config covers theming/features, NOT authorization (server concern, Principle 7). If that flag loses an owner without a replacement, ADR 17 requires removing the feature-flag claim rather than keeping an unnamed gate.

---

## 8. AI Usage

> **Evidence not collected, and it cannot be collected from the tree.** This section is
> supposed to say which files were agent-generated and kept, what agent output was
> rejected and why, what was written by hand, and what was reviewed line by line.
> Specific rejections are worth more than general claims. None of that is recoverable
> from source or Git history after the fact — it is the author's own record — so it is
> left unwritten rather than reconstructed. **Do not fill this in by inference**: an
> invented authorship or review claim is the one failure this section exists to avoid,
> and it would be indistinguishable from a measured one. Tracked as `TODO.md` **P3.4**.
>
> Nothing below this line is a measurement either; it is the argument for why the
> structure exists, and it is checkable against the enforcement it names.

Repo assumes agents write large share of code (that's what `CLAUDE.md`, routing, doc-comments, boundaries are for) (Principle 14). Claim isn't "no AI", it's "structure makes agent code checkable":

- Boundary rule fails build (Principle 9).
- Token lint rejects agent hex literals (Principle 8).
- Contract tests pin canonical output (Principle 10).
- Doc comments ground next agent.

---

## 9. Not Built

| Cut                               | Reason                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Robot discovery/commissioning** | Highest-value front-end, cut because provisioning/credentials is a different exercise.                                                                                                          |
| **Schema-driven config forms**    | Right answer for differing vendor schemas, cut for time. Capability model is foundation.                                                                                                        |
| **Auth/multi-tenancy**            | Real tenancy is auth model, not filter. Config = theming/features only (Principle 7, 13).                                                                                                       |
| **Commands to robots**            | Requires state machine (requested, ack, executing, completed, failed, unknown) + audit (Principle 11). Fake buttons reporting unverifiable success violates anti-stale principle (Principle 4). |
| **Cloud/on-prem skew**            | Envelope has schema version for this, but full compatibility window out of scope.                                                                                                               |
| **Floor plans/calibration**       | Transform robot map → building drawing per site/floor is real problem. Positions shown native map frame + frame name. Abstract bounds used.                                                     |
| **Horizontal scale/broker**       | Correct at this size. Seam named: ingest stateless, state/fan-out partition. In-memory state won't scale across instances (Principle 12).                                                       |
| **Alerting/escalation**           | Different product than live view.                                                                                                                                                               |
| **Persistent history**            | In-memory current state, rebuildable (Principle 11). History = bounded per-robot ring buffer (decimated sparkline). [ADR 6].                                                                    |

---

## 10. Measurements

> **Two numbers are measured and gated; the load tables are not, and cannot be yet.**
> The scale run has not been performed and cannot be until the server accepts ingest:
> the simulator generates `--robots 500 --hz 5` today — 2,499 readings/s achieved
> against 2,500 configured, measured against a trivial receiver — but there is no
> receiver in this repository to measure the other end of. No number in the empty
> tables should be cited until it comes from an actual run through the complete harness
> (Principle 12); the simulator's own figure is not a substitute, because it measures
> the producer.
>
> The contrast table is blocked on nothing at all and is simply not yet done. It needs
> a person reading ratios off both themes, and it is tracked as `packages/FIXME.md`
> **F8** and `TODO.md` **P3.3**.

### Budgets and gates ([ADR 22](docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md))

Two numbers fail the build, and each carries its derivation in the file that enforces it.
A third is printed and enforces nothing, because nobody could derive it.

| Number                         | Budget                     | Measured (19 Aug 2026) | Enforced in                                                    |
| ------------------------------ | -------------------------- | ---------------------- | -------------------------------------------------------------- |
| Console first load (JS + CSS)  | 720 kB raw / 300 kB gzip   | 585.66 kB / 177.13 kB  | `scripts/checkBundleBudget.mjs` — **gate**                     |
| Ingest validation, per message | 400 µs (ADR 2's falsifier) | 5.8–6.4 µs             | `packages/server/src/ingest/validationCost.test.ts` — **gate** |
| Adapter test coverage          | none, deliberately         | 94.25% statements      | CI job summary — **reported, not gated**                       |

The bundle budget is derived from a warehouse-floor tablet on ~3 Mbps of shared site
Wi-Fi and a 2.0 s target to the fleet table showing data; raising it is a claim that the
operator's device or network is different from that one. The 400 µs figure is ADR 2's own
falsification threshold, not a tuned number — at the measured cost, validation consumes
about 1.5% of one core at 2,500 msg/s, so ADR 2's estimate survives and per-request HTTP
overhead remains the candidate for the first bottleneck. Coverage is reported because the
90% threshold this repository once proposed had no derivation and, over today's
`src/vendors/**`, would have measured nothing.

The tables below stay empty regardless: they need a receiver, and these two gates do not
provide one. Adapter coverage was re-measured on 19 August 2026 and is unchanged at
94.25% of statements — over `src/core` alone, since `src/vendors/**` still holds only
fixtures.

|                                       | 50 robots @ 1 Hz | 500 robots @ 5 Hz |
| ------------------------------------- | ---------------- | ----------------- |
| Ingest throughput (events/s)          |                  |                   |
| Ingest → fan-out latency (p50 / p95)  |                  |                   |
| WebSocket messages/s after coalescing |                  |                   |
| Client frame time under load (p95)    |                  |                   |
| Table rows rendered / virtualized     |                  |                   |
| Memory, server / client               |                  |                   |

**Contrast verification** (WCAG 2.2 AA) (Principle 6):

| Pair                           | Dark | Light |
| ------------------------------ | ---- | ----- |
| `--ink` on `--bg`              |      |       |
| `--ink` on `--surface`         |      |       |
| `--accent-text` on `--surface` |      |       |
| `--ink-muted` on `--surface`   |      |       |
| Status label on tint           |      |       |

`--ink-muted` matters most: the "last known" treatment depends on legibility.
**Virtualization:** Ships unvirtualized, by decision ([ADR 24](docs/00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md)). The table renders one row per robot and is asserted correct at 500 rows — 500 rows, 500 activation links, fleet-wide counts, filter still narrowing to one — in `packages/web/src/features/fleet/fleetScale.test.tsx`. **No ceiling is claimed**, because the number that would set one is delta-apply cost at 500 robots under a live stream, and there is no fan-out to measure against. Absolute positioning also conflicts with the semantic `<table>` layout Principle 6 depends on. When the measurement exists, `@mui/x-data-grid` is evaluated first (ADR 5) and whatever is chosen must fit ADR 22's bundle budget.

---

## Testing

### Contributing: run the CI gates locally

Before pushing, run every merge-blocking check in one shot:

```bash
pnpm check:ci
```

The script mirrors `.github/workflows/ci.yml` in workflow order. Its expanded command list
is:

```bash
pnpm install --frozen-lockfile
pnpm check:architecture-docs
pnpm check:type-safety
pnpm check:doc-comments
pnpm check:dependencies
pnpm audit --audit-level=high --ignore-registry-errors
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm record:fixtures
git diff --exit-code -- 'packages/adapters/src/vendors/*/__fixtures__/*.json'
pnpm check:diff-size
pnpm check:bundle
```

`pnpm lint` includes the repository-wide Prettier check. The fixture command intentionally
modifies stale generated fixtures; commit those regenerated files rather than editing them
by hand. `check:diff-size` compares committed changes with the merge base, so CI is
authoritative for an uncommitted local tree; an indivisible change over the budget needs
the `Oversized-diff: <reason>` commit trailer documented by ADR 27.

CI also runs adapter coverage and writes it to the job summary, but that step is explicitly
report-only and does not gate a merge. The workflow file remains the executable source of
truth if this list and CI ever disagree.

Deliberate scope (Principle 10). Built today:

- Envelope validation (valid, missing, malformed, boundary, unknown) — `packages/contracts`.
- Freshness machine (injected time, threshold boundaries) — `contracts` + the server sweep.
- No double-apply, no backwards state — `currentStateStore.test.ts` rejects duplicate and out-of-order sequences.
- Simulator HTTP delivery against a live receiver — `simulator/src/integration/ingest.integration.test.ts`.
- Boundary lint (violation fails, legal passes) — `__boundary-violation__` / `__enforcement__` suites in `web`, `server`, `adapters`.
- **No component snapshots** (asserts no-change, not correctness; trains blind diff acceptance). Verified: the repository contains no `.snap` files.

Named in the scope and **[NOT BUILT]**:

- Adapter contract tests (recorded fixture → exact output). The fixtures exist and are drift-gated (ADR 13); the assertions are blocked on the vendor adapters, which have nothing to decode a fixture with.
- Idempotent ingest at the HTTP boundary. The store-level guarantee above exists; the ingest route it protects does not.
- E2E (simulator → visibly stale row). Needs the server process and the console's live transport; no browser-driven test exists.

## Licence

[MIT.](./LICENSE)
