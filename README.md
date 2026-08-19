# Fleet Console

Multi-vendor robot fleet telemetry console. Canonical contracts, vendor adapters, thin simulator/server, React + Material UI console.

**Core guarantees:**

1. The console never presents stale state as current; enforced by tooling, survives team turnover/agent-written code (Principle 4).
2. Vendor differences are normalized where shared and preserved as declared capabilities where not (flattening differences deletes the product) (Principle 3).

Sections 2-3 cover freshness; 4 covers normalization; 7 covers scale.

---

## 1. Architecture

Fleet operators watch robots from three manufacturers with different wire dialects. The console shows one coherent fleet, explicit about data age and machine capabilities.

Two deliberate hard problems:

- **Silence is an event:** Freshness derived by a recurring server sweep, not on arrival. Robots degrade LIVE → STALE → UNREACHABLE autonomously. Systems reacting only to arrivals miss silence, showing stale data as current. The console displays what the sweep determined and never recomputes it (ADR 3).
- **Vendors disagree:** Three awkward dialects normalized into a canonical envelope (core shared data) + declared capabilities. UI renders from declarations, not hard-coded lists.

|             |                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack       | React · TypeScript · Vite · Material UI with design-token layer                                                                                                                                                       |
| Layout      | pnpm workspace, feature-sliced web package                                                                                                                                                                            |
| Enforcement | `eslint-plugin-boundaries`, token/hex lint, `strictTypeChecked`, CI (Principle 15)                                                                                                                                    |
| Docs        | [`PRINCIPLES.md`](PRINCIPLES.md) · [ADRs](docs/00_adr/) · [page specs](docs/01_page-specs/) · [component specs](docs/02_component-specs/) · [design system](docs/DESIGN_SYSTEM.md) · [wireframes](docs/WIREFRAMES.md) |

```
/packages
  /contracts    canonical envelope, capability types, freshness machine, Zod schemas (Principle 2)
  /adapters     one module per vendor dialect, plus recorded vendor fixtures (Principle 2, 3)
  /simulator    multi-vendor telemetry producer with fault injection
  /server       ingest, adapter dispatch, current state, WebSocket fan-out, health
  /web          the console — primary deliverable
PRINCIPLES.md   binding engineering principles
CLAUDE.md       agent routing and hard rules (AGENTS.md mirrors this) (Principle 14)
/docs/00_adr    architecture decision records
```

`/adapters` is a standalone package: it's a contract boundary, changes most often, and must be testable/versionable without touching the dispatcher. Adding a vendor = 1 module + 1 fixture. Zero canonical model edits.

---

## 2. Run it

```bash
pnpm install
pnpm dev
```

Starts simulator, server, and console (`http://localhost:5173`).

> **[FILL]** Confirm root `dev` script and port.

**30-second observations:**

1. **Summary strip:** Counts freshness only (`LIVE`, `STALE`, `UNREACHABLE`, `UNKNOWN`). Mutually exclusive, totals fleet exactly. No status duplication.
2. **Rows:** Show status + freshness. Non-`LIVE` rows use outline status chips (`(last known)`) and em-dash batteries (no stale numbers presented as current).
3. **Vendor column:** Filter to Vendor C vs A. Capability panels differ because robots differ.

---

## 3. Demo script

Sequence to watch (Steps 2 & 4 are the submission):

1. Open fleet (50 robots). All `LIVE`.
2. Compare capability panels across all three vendors: A shows dock + lidar-health, B shows dock alone, C shows dock + water-level. Three vendors, three distinct panel sections. Absence is the interface (no disabled placeholders). Cannot offer unsupported actions.
3. Simulator `--drop` 3 robots (`R-007,R-023,R-041` — ids must exist in the 50-robot default fleet; an unknown id fails at startup rather than silently dropping nothing). No message sent to console.
4. Watch 3 rows degrade on the server sweep (`STALE` → `UNREACHABLE`). Others stay `LIVE`. Status chips hollow, batteries em-dash. Caused by message absence.
5. Kill stream. Connection banner appears, table retains last-known data, per-robot freshness labels are suppressed. With no live connection the console has no current per-robot answer and says so at the connection level rather than guessing per row (ADR 3). No blank page or frozen lies (Principle 5).
6. Restore stream. Labels return; rows resume degrading on the sweep (no reload).

Steps 4 and 5 are different failures on purpose: 4 is a robot going silent, 5 is the console going blind. Deriving freshness server-side is what lets the console tell them apart.

Simulator commands for the steps above (verified against `packages/simulator`):

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
- **Unknown fields counted.** Vendor C's undocumented field increments a per-adapter counter on `GET /api/health`. Quietly discarding data rots integrations.
- **Vendor B's synthesized sequence is weaker.** Timestamp ordering can not distinguish duplicates from same-ms events. Recorded as a known limitation.

Adapter contract tests verify normalization: recorded vendor payload → exact canonical event (Principle 10). 3 fixtures, 3 assertions.
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

> **[FILL]** Replace with actual shipped features. Cuts go in section 9.

| Built                                                         | Status |
| ------------------------------------------------------------- | ------ |
| Canonical envelope + capability model + freshness machine     |        |
| Three vendor adapters + recorded fixtures + contract tests    |        |
| Simulator with vendor mix and fault-injection flags           |        |
| Server: ingest, dispatch, idempotent upsert, health endpoint  |        |
| WebSocket fan-out with coalescing                             |        |
| Fleet view: summary, filters, table                           |        |
| Robot detail: capability panels, operator/technician personas |        |
| Connection-integrity handling                                 |        |
| Tenant theming + one gated feature                            |        |
| Enforced dependency boundaries in lint and CI                 |        |

---

## 6. Principles

[`PRINCIPLES.md`] is binding. Every rule names an enforcement mechanism (static check, type, test, runtime, review). Review-only rules are conventions, not guarantees (Principle 15).

- **§3 Canonical model:** Normalizes shared meaning, preserves differences as typed capabilities. Capabilities limit UI offerings, not server authorization or current availability.
- **§4 Provenance/Freshness:** Values carry source timestamps (`reportedAt` and `receivedAt`). Freshness is derived server-side from `receivedAt` against a configured policy, tested with an injected clock, and delivered as a field (ADR 3). The client displays; it never computes. Rejects absolute version: badges aren't needed everywhere, only at smallest scope needed to act.
- **§6 Accessibility:** Target WCAG 2.2 AA. Semantic HTML, visible focus, contrast verification.
- **§7 Security/Privacy:** Server is the authority. UI hides/disables, but never authorizes. Requested ≠ observed.
- **§8 Design tokens:** Rejects raw hex/px outside `shared/ui`/`config`.
- **§9 Boundaries:** `shared/ui` gets display data/callbacks only. No domain imports. No cross-feature imports. Lint-checked.
- **§10 Tests:** Tests prove behavior at the cheapest reliable boundary. No component snapshots (asserts no-change, not correctness).
- **§11 State:** State is separated by authority, lifetime, and transition model. Requested ≠ observed.
- **§12 Performance:** Performance and observability are product behavior. Budgets defined for ingest latency and client frame time.
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
  /config     tenant themes, feature flags
```

**Dependency rule:** `app` → any; `features` → `entities`, `shared`; `entities` → `shared`; `shared` → nothing up; no cross-feature (Principle 9).
**Enforcement:** Lint/CI tested. `__boundary-violation__/` tests cross-feature rejection + legal import non-error. Agent slop fails builds.
**Lint pass:** Rejects raw hex/px outside `shared/ui`/`config` (Principle 8), forbids `enum` (string-literal unions), runs `strictTypeChecked` + `jsx-a11y` (Principle 6).
**Agent governance:** `CLAUDE.md`/`AGENTS.md` have hard rules + routing table (what → which package) (Principle 14). Per-package overrides alongside code. Exported symbols = 1-sentence doc comment. Cross-package coupling documented on both sides (searchable).
**ADRs:** Precede implementation. Amended under `## Observed consequences` if changed. Never claim ADR describes reality if diverged.
**Personas:** Operator summary default; technician diagnostics (raw payload, seq gaps, clock delta) behind toggle. 1 layout.
**White-label:** Config (`/config`), not conditionals (Principle 13). Theme/wordmark/features swap together. Per-tenant conditional = defect. Config covers theming/features, NOT authorization (server concern, Principle 7).

---

## 8. AI Usage

> **[FILL]** Probe in follow-up: agent-generated kept files, rejected output, hand-written, line-by-line reviewed. Specific rejections > general claims.

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

> **[FILL]** Run load mode, fill table. Claims need measurements (Principle 12).

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
**Virtualization:** Ships unvirtualized if 500-robot measurement allows. Absolute positioning conflicts with semantic `<table>` layout. Deferred behind numbers, amends ADR.

---

## Testing

Deliberate scope (Principle 10):

- Adapter contract tests (recorded fixture → exact output).
- Envelope validation (valid, missing, malformed, boundary, unknown).
- Idempotent ingest (no double-apply, no backwards state).
- Freshness machine (injected time, threshold boundaries).
- E2E (simulator → visibly stale row).
- Boundary lint (violation fails, legal passes).
- **No component snapshots** (asserts no-change, not correctness; trains blind diff acceptance).

## Licence

[MIT.](./LICENSE)
