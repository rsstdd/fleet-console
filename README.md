# Fleet Console

Multi-vendor robot fleet telemetry console. Canonical contracts, vendor adapters, thin simulator/server, React + Material UI console.

**Core guarantees:**

1. The UI never presents stale data as current. This is enforced by tooling and intended to survive team turnover/agent-written code (Principle 4).
2. Vendor differences are normalized where shared. These differences are preserved as declared capabilities where not shared
   (flattening differences deletes the product) (Principle 3).

Sections 2-3 cover "freshness"; 4 covers normalization; 7 covers scale.

> **Implementation status — 20 August 2026.** This README describes the design in the
> present tense throughout. Where a section still claims behavior the tree does not have,
> it is marked inline with **[NOT BUILT]** or **[PARTIAL]**.
>
> The short version: **the path runs end to end.** `pnpm dev` starts the server, the
> simulator and the console together; the simulator's readings reach the server's ingest,
> are decoded by the vendor adapters, enter fleet state, are aged by the freshness sweep,
> and are fanned out over WebSocket to a console that renders them. All five packages are
> built.
>
> Measured on one 40-second `pnpm dev` run: **1,993 readings sent, 1,993 accepted, zero
> rejected and zero server failures**, at ~50 readings/second across 50 robots and three
> vendor dialects. `GET /api/health` then reported vendor C's undocumented
> `telemetry.firmware_channel` counted 235 times, vendor B's ordering as _not evaluated_
> rather than as zero gaps, and no malformed payloads.
>
> The console rendering against a live socket is committed browser automation: the
> Playwright suite drives the real stack in Chromium, Firefox, and (in CI) WebKit,
> including freshness degradation, stream loss, and automatic restart recovery
> ([ADR 32](docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md)).
> Section 5 has the per-item table;
> [`packages/FIXME.md`](packages/FIXME.md) preserves the historical package audit;
> [`TODO.md`](TODO.md) is the current work queue.

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
| Records     | [architecture audit](docs/ARCHITECTURE_AUDIT.md) · [submission notes](docs/SUBMISSION_NOTES.md) · [archive](docs/04_archive/)                                                                                                                  |

```
/packages
  /contracts    canonical envelope, capability types, freshness machine, Zod schemas (Principle 2)
  /adapters     one module per vendor dialect, plus recorded vendor fixtures (Principle 2, 3)
                A/B/C schemas, registry, unknown-field ledger, recorded fixtures and
                public `testing` subpath
  /simulator    multi-vendor telemetry producer with fault injection
  /server       ingest, adapter dispatch, current state, battery history, WebSocket fan-out, health
                runnable HTTP/WebSocket process; slow-client policy remains trigger-deferred
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
(ADR 17). To see Tenant B against the same live stack, run `pnpm dev:tenant-b` — the
"Northwind Robotics" wordmark, the light theme, and a robot-detail page without the
lidar-health panel are the three visible differences; `pnpm test:e2e:tenant` asserts the
same three on the production bundle in Chromium.

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

**Starts all three, connected.** Root `dev` is `pnpm --recursive --parallel --stream dev`,
and `server`, `simulator` and `web` each define one. Verified on 20 August 2026: the server
logs `server.listening` on `127.0.0.1:8080` with 5 routes and the shipped freshness policy,
the console comes up on `http://localhost:5173` and proxies `/api` and `/ws` to the server,
and the simulator POSTs into the real ingest — 1,993 readings sent and 1,993 accepted over
40 seconds, with no rejections and no server failures.

1. **Summary strip:** Counts freshness only (`LIVE`, `STALE`, `UNREACHABLE`, `UNKNOWN`). Mutually exclusive, totals fleet exactly. No status duplication. Headed "Fleet freshness" while the stream is connected; during an outage the counts stay visible under "Fleet freshness · last known", so the group never asserts a currency the socket cannot support (ADR 23).
2. **Rows:** Show status + freshness. Non-`LIVE` rows use outline status chips (`(last known)`) and em-dash batteries (no stale numbers presented as current). The connection state is supplied by a real socket, so the labels render while the stream is connected and are suppressed while it is not (ADR 3) — watched in a browser by the Playwright outage scenario, which kills the server and asserts the suppression, the retained rows, and the qualified summary heading (ADR 32).
3. **Vendor column:** Filter to Vendor C vs A. Capability panels differ because robots differ.

---

## 3. Demo script

A presenter-facing version of this sequence — seven acts with per-act frontend notes,
plus an interactive driver that starts, faults, and restarts the stack itself — lives in
[`demo/DEMO.md`](demo/DEMO.md) and [`demo/demo.sh`](demo/demo.sh). The steps below are
the canonical sequence; the demo guide restates them and must stay consistent with this
section.

**Observed in a browser on 20 August 2026.** Headless Chrome against the running stack, at
`http://127.0.0.1:5301`:

| Moment                  | Rendered freshness         | Banner                |
| ----------------------- | -------------------------- | --------------------- |
| Simulator running       | `{Live: 46, Stale: 4}`     | `Stream connected`    |
| Simulator stopped, +12s | `{Unreachable: 50}`        | `Stream connected`    |
| Server stopped          | no per-robot labels at all | `Stream reconnecting` |

Rows carried all three dialects normalised — `R-001 A … 93.46%`, `R-002 B … 72%`,
`R-003 C … 35.53%` — from one table with no vendor branch.

**That contrast is the demo.** Steps 4 and 5 are different failures on purpose, and the
middle and bottom rows above are what tells them apart: a robot going silent degrades to
`UNREACHABLE` **while the stream stays connected**, because the server still has a current
answer about it; the console going blind suppresses every per-robot label and says so at
the connection level instead. Deriving freshness server-side is what makes those two
distinguishable at all.

Every step of it is now committed automation
([ADR 32](docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md)):
`pnpm test:e2e` drives the real server, simulator, and built console through these
scenarios in Chromium, Firefox, and (in CI) WebKit.

Sequence to watch (Steps 2 & 4 are the submission):

1. Open fleet (50 robots). All `LIVE`.
2. Compare capability panels across all three vendors: A shows dock + lidar-health, B shows dock alone, C shows dock + water-level. Confirmed against the real adapters on 20 August 2026 — decoding the recorded payloads yields `A: dock+lidarHealth+sequence`, `B: dock`, `C: dock+sequence+waterLevel` — and the console's fixtures were corrected to match, closing `packages/FIXME.md` **F1**. Three vendors, three distinct panel sections. Absence is the interface (no disabled placeholders). Cannot offer unsupported actions.
3. Simulator `--drop` 3 robots (`R-007,R-023,R-041` — ids must exist in the 50-robot default fleet; an unknown id fails at startup rather than silently dropping nothing). No message sent to console. **Run the simulator once _without_ the flag first.** A cold start with `--drop` leaves those three at `UNKNOWN` rather than degrading them, because they never reported at all and `UNKNOWN` is the honest state for a robot nobody has heard from (ADR 3). The `LIVE → STALE → UNREACHABLE` transition needs them to have been live first, and following step 3 from a cold fleet is the one way to make this demo look broken when it is working.
4. Watch 3 rows degrade on the server sweep (`STALE` → `UNREACHABLE`). Others stay `LIVE`. Status chips hollow, batteries em-dash. Caused by message absence. **Verified against a running stack on 20 August 2026**: after a normal run followed by a `--drop` run, `GET /api/fleet` reported `{live: 47, unreachable: 3}` with `R-007`, `R-023` and `R-041` the only unreachable robots. The browser half is a committed Playwright scenario: silence the simulator and watch `R-001`'s row render `Live` → `Stale` → `Unreachable` while the banner stays `Stream connected` (ADR 32).
5. Kill stream. Connection banner appears, table retains last-known data, per-robot freshness labels are suppressed. **Built, observed on 20 August 2026 against the running stack, and committed as a Playwright scenario (ADR 32): rows retained, freshness suppressed, banner honest.** Connection state travels through `ConnectionContext`, both pages render `FreshnessLabel` only while the real socket is connected, and the default remains fail-closed at `disconnected` ([ADR 23](docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md)). With no live connection the console has no current per-robot answer and says so at the connection level rather than guessing per row (ADR 3).
6. Restore stream. Labels return; rows resume degrading on the sweep (no reload). **The server half was observed on 20 August 2026**: robots that had aged to `UNREACHABLE` while the simulator was stopped returned to `LIVE` within seconds of it resuming, with no server restart. **The console half is implemented under [ADR 31](docs/00_adr/31_JITTERED_RECONNECT_AND_SERVER_SESSION_RECONCILIATION.md)**: the transport reconnects automatically on a full-jitter schedule and detects a restarted server by its `serverSessionId`, replacing its picture from the new snapshot without reload or manual retry. Proven at unit and process boundaries (`fleetTransport.test.ts`, `runServer.test.ts`) and now in real browsers: the committed restart scenario kills the server, starts a new process, and watches the console re-join and resume live rows without Retry or reload (`packages/web/e2e/smoke.spec.ts`, ADR 32).

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
- **Unknown fields counted.** Vendor C's undocumented field increments a per-adapter counter on `GET /api/health`. Quietly discarding data rots integrations. Measured on a 40-second `pnpm dev` run: `telemetry.firmware_channel` counted **235** times under vendor C, with vendor A and B at zero — the count is per adapter and fleet-wide, and the response says so in `unknownFieldScope` rather than in a caption ([ADR 15](docs/00_adr/15_UNKNOWN_FIELD_ACCOUNTING_ON_ACCEPTED_PAYLOADS.md), [ADR 25](docs/00_adr/25_CONTRACTS_OWNS_EVERY_DECODED_RESPONSE_COUNTERS_BY_SCOPE.md)).
- **Sequence regressions are rejected and reported safely.** A lower reliable sequence
  leaves accepted state, diagnostics, history, deltas, and health counters unchanged and
  emits one `telemetry.sequence_regression` warning with canonical ids, both sequence
  values, and server receipt time—never raw payload or vendor prose. The public health
  counter remains deferred until a real diagnostics consumer requires contract versioning.
- **Vendor B's synthesized sequence is weaker.** Timestamp ordering can not distinguish duplicates from same-ms events. Recorded as a known limitation.

Adapter contract tests verify normalization: recorded vendor payload → exact canonical event (Principle 10). `pnpm record:fixtures` records one representative payload per vendor from the simulator into `packages/adapters/src/vendors/*/__fixtures__/`, and CI fails if the tree produces a different byte ([ADR 13](docs/00_adr/13_RECORDED_FIXTURES_WITH_A_CI_DRIFT_GUARD.md)). Each vendor module decodes its own fixture to an exact canonical envelope, a cross-vendor test proves two dialects describing one state produce identical cores, and every malformed fixture returns a failure result rather than throwing. `packages/adapters` also ships the result type, the unknown-field ledger, the vendor union, the dispatch registry, and a public `testing` subpath ([ADR 11](docs/00_adr/11_PUBLIC_TESTING_SUBPATH_FOR_FIXTURES.md)) that `packages/server`'s ingest test consumes under a narrow lint exception.

**Site hierarchy:** 1 level (robots → sites). Extends rather than changes shape for org → site → building → fleet → robot. Site labels are deployment configuration: the manifest's `sites` directory travels on the fleet snapshot (schema version 3, ADR 34) and the console labels from it — North site, South site, East site in the shipped configuration — inventing nothing.

---

## 5. Scope

Unequal weighting: console is submission; simulator/server feed it.

| Package                   | Weight      | Why                                                                                 |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| `/web`                    | Heaviest    | Deliverable. Structure, freshness honesty, capability rendering, personas, theming. |
| `/contracts`, `/adapters` | Substantial | Normalization argument & checkable adapter tests.                                   |
| `/server`, `/simulator`   | Thin        | Produce dialects, inject faults, fan out deltas. No more.                           |

Budget: 10–11 hours / 3 days.

Status as of 20 August 2026, verified against the tree and against one `pnpm dev` run. Cuts go in section 9.

| Built                                                         | Status                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical envelope + capability model + freshness machine     | **Built.** Schemas, capability wire codec, `deriveFreshness`, tests.                                                                                                                                                                                                                                                                                                                                               |
| Three vendor adapters + recorded fixtures + contract tests    | **Built.** A, B and C modules with per-vendor schemas, a dispatch registry, exact-output contract tests, and recorded fixtures drift-gated in CI (ADR 13) reachable through the public `testing` subpath (ADR 11).                                                                                                                                                                                                 |
| Simulator with vendor mix and fault-injection flags           | **Built.** Three dialects, `--drop`, seeded fleet, bounded transport, integration tests.                                                                                                                                                                                                                                                                                                                           |
| Server: ingest, dispatch, idempotent upsert, health endpoint  | **Built.** `POST /api/telemetry/:vendor` with the size cap ahead of the parse, registry dispatch, idempotent upsert, and `GET /api/fleet`, `/api/robots/:id`, `/api/robots/:id/history` and `/api/health`. The history route (**G4**) landed under ADR 33: compact retention at capacity 3,001 per robot, decimated to at most 60 extrema-preserving points over a fixed 60-second window.                         |
| WebSocket fan-out with coalescing                             | **Built.** One coalescing set per console, flushed at up to 10 Hz on `/ws`, sharing the server's one flush counter with the snapshot (ADR 18). No backpressure yet — deferred on ADR 8's open configuration question (**H6b**).                                                                                                                                                                                    |
| Fleet view: summary, filters, table                           | **Built**, reading the live store. Freshness summary, site/vendor/freshness/search filters, table.                                                                                                                                                                                                                                                                                                                 |
| Robot detail: capability panels, operator/technician personas | **Built**, reading `GET /api/robots/:id` and `/api/health`, plus the fetch-on-visit battery-history sparkline over `GET /api/robots/:id/history` (ADR 33). Live after the one fetch: core values and freshness update from stream deltas by reconciling this robot's fleet row over the fetched detail — no refetch, no re-render for other robots' deltas.                                                        |
| Connection-integrity handling                                 | **Built.** The banner, `ConnectionContext` and label suppression are driven by a real socket, failing closed to `disconnected` (ADR 23). Recovery is automatic under ADR 31 — full-jitter reconnect, capped initial probe, server-session restart detection — with manual retry for the terminal states. The restart recovery is committed browser automation against a real killed-and-restarted server (ADR 32). |
| Tenant theming + one gated feature                            | **Built.** Build-time profiles are validated; Tenant B disables the lidar-health panel through `flags.lidarHealthPanel` (ADR 17).                                                                                                                                                                                                                                                                                  |
| Enforced dependency boundaries in lint and CI                 | **Built.** `eslint-plugin-boundaries` + resolver, violation fixtures, `.github/workflows/ci.yml`.                                                                                                                                                                                                                                                                                                                  |

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
- **§12 Performance:** Performance and observability are product behavior. Two budgets are enforced in CI — the console's first-load size and per-message ingest validation cost ([ADR 22](docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md)). Ingest latency and client frame time are measured and reported without budgets (§ 10); a budget without a derivation is the thing ADR 22 exists to refuse.
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
                                        lib holds time, connection state, the stream
                                        client and the one decode boundary
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

| Cut                               | Reason                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Robot discovery/commissioning** | Highest-value front-end, cut because provisioning/credentials is a different exercise.                                                                                                                                                                                                                                                                                              |
| **Schema-driven config forms**    | Right answer for differing vendor schemas, cut for time. Capability model is foundation.                                                                                                                                                                                                                                                                                            |
| **Auth/multi-tenancy**            | Real tenancy is auth model, not filter. Config = theming/features only (Principle 7, 13). This is the demo-only security boundary: raw vendor payloads are served unauthenticated by recorded decision (ADR 26), the technician panel states the exposure on the surface, and production deployment remains blocked until authentication and authorization supersede that decision. |
| **Commands to robots**            | Requires state machine (requested, ack, executing, completed, failed, unknown) + audit (Principle 11). Fake buttons reporting unverifiable success violates anti-stale principle (Principle 4).                                                                                                                                                                                     |
| **Cloud/on-prem skew**            | Envelope has schema version for this, but full compatibility window out of scope.                                                                                                                                                                                                                                                                                                   |
| **Floor plans/calibration**       | Transform robot map → building drawing per site/floor is real problem. Positions shown native map frame + frame name. Abstract bounds used.                                                                                                                                                                                                                                         |
| **Horizontal scale/broker**       | Correct at this size. Seam named: ingest stateless, state/fan-out partition. In-memory state won't scale across instances (Principle 12).                                                                                                                                                                                                                                           |
| **Alerting/escalation**           | Different product than live view.                                                                                                                                                                                                                                                                                                                                                   |
| **Persistent history**            | In-memory current state, rebuildable (Principle 11). History = bounded per-robot ring buffer of compact battery samples, served decimated for the sparkline. [ADR 6], amended by [ADR 33].                                                                                                                                                                                          |

---

## 10. Measurements

> **ADR 2's own question is now answered, and the answer is decisive.** ADR 2 estimated
> that schema validation costs tens of microseconds and that per-request HTTP overhead was
> the likelier first bottleneck, and committed to a harness that would confirm or falsify
> it. Measured 20 August 2026 by `packages/server/src/ingest/validationCost.test.ts`:
>
> | Cost                                              | 50 robots | 500 robots |
> | ------------------------------------------------- | --------- | ---------- |
> | Strict canonical decode (`JSON.parse` + Zod)      | 5.8 µs    | 5.8 µs     |
> | Whole request (route, cap, parse, decode, upsert) | 892 µs    | 926 µs     |
>
> **Transport dominates validation by roughly 150×**, so ADR 2's estimate holds and its
> staged mitigation should start with batch ingest rather than with worker-pooled
> validation. Per-request cost is essentially flat from 50 to 500 robots (+3.8%), which is
> what the map-keyed store predicted.
>
> Read the 892 µs honestly: it is a **sequential round trip over loopback including the
> client's own `fetch`**, so it bounds server-side per-request work from above rather than
> isolating it — and it is emphatically **not** a capacity figure.
>
> **Under concurrency, measured 20 August 2026 by `src/freshness/sweepUnderLoad.test.ts`
> at 500 robots:**
>
> | Offered concurrency | Accepted    | Sweep ticks late |
> | ------------------- | ----------- | ---------------- |
> | 1                   | 1,264 req/s | 0 of 4           |
> | 16                  | 4,786 req/s | 0 of 4           |
> | 128                 | 5,971 req/s | 0 of 4           |
>
> That is **~2.4× ADR 2's 2,500 msg/s design scale**, and the freshness sweep never ran
> late at any level — which is the measurement that actually matters, because ADR 3's
> failure under saturation is not slowness but a sweep that stops firing and leaves stale
> robots reported as LIVE. No degradation point was found on this machine; the honest
> statement is that saturation was not reached, not that it cannot be.
>
> **The client half, measured 20 August 2026 by the Playwright scale project**
> (`packages/web/e2e/scale.spec.ts`,
> [ADR 32](docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md)):
> 500 robots at ten WebSocket frames per second (250 robots changing per frame) against
> the production build in a real Chromium:
>
> | Client metric at 500 robots, live stream | Measured                                |
> | ---------------------------------------- | --------------------------------------- |
> | Frames applied                           | 120 of 120                              |
> | Achieved frame rate                      | 9.79 Hz of 10 Hz offered                |
> | Delta to next paint                      | p50 47.3 ms · p95 53.7 ms · max 74.5 ms |
> | Animation-frame interval                 | p50 16.7 ms · p95 50.1 ms               |
>
> The un-virtualized table absorbs the documented workload with the frame budget intact,
> so ADR 24's virtualization deferral now rests on evidence. Integrity is asserted in CI;
> the numbers are reported, never gated, and each run writes its own `scale-report.json`
> with the environment attached.
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
report-only and does not gate a merge. A separate `browser-evidence` job runs
`pnpm test:e2e` across three engines and `pnpm test:e2e:scale`, uploading the report,
traces, and measurement JSON (ADR 32); it is not part of `check:ci` because it needs
Playwright's browsers installed. The workflow file remains the executable source of
truth if this list and CI ever disagree.

Deliberate scope (Principle 10). Built today:

- Envelope validation (valid, missing, malformed, boundary, unknown) — `packages/contracts`.
- Freshness machine (injected time, threshold boundaries) — `contracts` + the server sweep.
- No double-apply, no backwards state — `currentStateStore.test.ts` rejects duplicate and out-of-order sequences.
- Privacy-safe regression reporting — store, ingest, and live-composition tests prove one
  stable warning and no mutation or counter misclassification.
- Simulator HTTP delivery against a live receiver — `simulator/src/integration/ingest.integration.test.ts`.
- Boundary lint (violation fails, legal passes) — `__boundary-violation__` / `__enforcement__` suites in `web`, `server`, `adapters`.
- **No component snapshots** (asserts no-change, not correctness; trains blind diff acceptance). Verified: the repository contains no `.snap` files.

Named in the scope and now built:

- Adapter contract tests (recorded fixture → exact output), drift-gated in CI (ADR 13).
- Idempotent ingest at the HTTP boundary, over the store-level guarantee above.
- E2E (simulator → visibly stale row) **in a browser** ([ADR 32](docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md)). `pnpm test:e2e` runs the smoke suite per engine against the real server, simulator, and production bundle — rendering and streamed row updates, vendor normalization with capability panels, keyboard operability without focus theft, freshness degradation with the stream up, row retention with the server down, the battery-history chart surviving a robot going silent (ADR 33), automatic restart recovery, live robot detail updating from deltas without navigation, manifest-provided site labels and filters (ADR 34), a first-load server failure recovered through the visible retry, and a controlled malformed snapshot rendered as a terminal contract failure. `pnpm test:e2e:tenant` builds and drives the tenant-B production bundle in Chromium: light theme, disabled lidar panel, and narrow-viewport behavior (ADR 17). `pnpm test:e2e:scale` reports the 500-robot client measurement (integrity asserted, numbers reported, gated by nothing). Chromium and Firefox run anywhere; WebKit's system libraries are installed in CI (`--with-deps`), so a box without them proves two engines and leaves the third to the `browser-evidence` job.

Still explicitly **manual**: real screen-reader output and subjective forced-colors inspection (ADR 32 keeps them named rather than claimed).

## Licence

[MIT.](./LICENSE)
