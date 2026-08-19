# Fleet Console

Multi-vendor robot fleet telemetry console. Canonical contracts, vendor adapters, thin simulator/server, React + Material UI console.

**Core guarantees:**
1. The console never presents stale state as current; enforced by tooling, survives team turnover/agent-written code.
2. Vendor differences are normalized where shared and preserved as declared capabilities where not (flattening differences deletes the product).

Sections 2-3 cover freshness; 4 covers normalization; 7 covers scale.

---

## 1. Architecture

Fleet operators watch robots from three manufacturers with different wire dialects. The console shows one coherent fleet, explicit about data age and machine capabilities.

Two deliberate hard problems:
- **Silence is an event:** Freshness derived on a timer, not arrival. Robots degrade LIVE → STALE → UNREACHABLE autonomously. Systems reacting only to arrivals miss silence, showing stale data as current.
- **Vendors disagree:** Three awkward dialects normalized into a canonical envelope (core shared data) + declared capabilities. UI renders from declarations, not hard-coded lists.

|             |                                                                                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack       | React · TypeScript · Vite · Material UI with design-token layer                                                                                                                                                       |
| Layout      | pnpm workspace, feature-sliced web package                                                                                                                                                                            |
| Enforcement | `eslint-plugin-boundaries`, token/hex lint, `strictTypeChecked`, CI                                                                                                                                                   |
| Docs        | [`PRINCIPLES.md`](PRINCIPLES.md) · [ADRs](docs/00_adr/) · [page specs](docs/01_page-specs/) · [component specs](docs/02_component-specs/) · [design system](docs/DESIGN_SYSTEM.md) · [wireframes](docs/WIREFRAMES.md) |

```
/packages
  /contracts    canonical envelope, capability types, freshness machine, Zod schemas
  /adapters     one module per vendor dialect, plus recorded vendor fixtures
  /simulator    multi-vendor telemetry producer with fault injection
  /server       ingest, adapter dispatch, current state, WebSocket fan-out, health
  /web          the console — primary deliverable
PRINCIPLES.md   binding engineering principles
CLAUDE.md       agent routing and hard rules (AGENTS.md mirrors this)
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
2. Filter Vendor C: water-level panel, absent lidar-health. Filter Vendor A: reverse. Absence is the interface (no disabled placeholders). Cannot offer unsupported actions.
3. Simulator `--drop` 3 robots. No message sent to console.
4. Watch 3 rows degrade on timer (`STALE` → `UNREACHABLE`). Others stay `LIVE`. Status chips hollow, batteries em-dash. Caused by message absence.
5. Kill stream. Connection banner appears, table retains last-known data, rows degrade honestly. No blank page or frozen lies.
6. Restore stream. Rows return to `LIVE` (no reload).
> **[FILL]** Exact simulator flags (`pnpm --filter simulator dev --drop R-204,R-087,R-301`).

---

## 4. Vendors & Adapter Layer

Multi-manufacturer normalization is the business. 3 producers disagree on purpose.

| Dialect      | How it differs                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Vendor A** | Nested payload · battery 0–1 fraction · position in meters · ISO 8601 timestamps · status enum `idle` / `busy` / `charging` / `fault`                              |
| **Vendor B** | Flat payload · battery int percentage · position in cm · epoch-ms timestamps · status numeric code · **no sequence** (adapter synthesizes ordering from timestamp) |
| **Vendor C** | Like A, but declares `waterLevel`, omits `lidarHealth`, sends undocumented field                                                                                   |

**Adapter jobs:** Identify, convert telemetry/errors to envelope, declare capabilities, retain raw payload for diagnosis (hidden from read model).
**Canonical envelope:** id, site, vendor, model, adapter version, sequence, timestamps, schema version, normalized core, capability set, raw payload. Core: identity, connectivity, battery, position, status, health.

**Consequences:**
- **Capabilities drive UI, not vendor names.** `if (vendor === …)` in `features/` is a defect.
- **Unknown fields counted.** Vendor C's undocumented field increments a per-adapter counter on `GET /api/health`. Quietly discarding data rots integrations.
- **Vendor B's synthesized sequence is weaker.** Timestamp ordering can not distinguish duplicates from same-ms events. Recorded as a known limitation.

Adapter contract tests verify normalization: recorded vendor payload → exact canonical event. 3 fixtures, 3 assertions.
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

[`PRINCIPLES.md`] is binding. Every rule names an enforcement mechanism (static check, type, test, runtime, review). Review-only rules are conventions, not guarantees.

- **§1 Dependencies:** `shared/ui` gets display data/callbacks only. No domain imports. No cross-feature imports. Lint-checked.
- **§5 Canonical model:** Normalizes shared meaning, preserves differences as typed capabilities. Capabilities limit UI offerings, not server authorization or current availability.
- **§6 Provenance/Freshness:** Values carry source timestamps. Freshness derived from injected clock/policy. Rejects absolute version: badges aren't needed everywhere, only at smallest scope needed to act.
- **§15 Enforcement:** Custom lint/rules tested with valid/invalid fixtures. Forbids claiming all principles are build-enforced (auth, runtime validation, design judgment aren't).

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

**Dependency rule:** `app` → any; `features` → `entities`, `shared`; `entities` → `shared`; `shared` → nothing up; no cross-feature.
**Enforcement:** Lint/CI tested. `__boundary-violation__/` tests cross-feature rejection + legal import non-error. Agent slop fails builds.
**Lint pass:** Rejects raw hex/px outside `shared/ui`/`config`, forbids `enum` (string-literal unions), runs `strictTypeChecked` + `jsx-a11y`.
**Agent governance:** `CLAUDE.md`/`AGENTS.md` have hard rules + routing table (what → which package). Per-package overrides alongside code. Exported symbols = 1-sentence doc comment. Cross-package coupling documented on both sides (searchable).
**ADRs:** Precede implementation. Amended under `## Observed consequences` if changed. Never claim ADR describes reality if diverged.
**Personas:** Operator summary default; technician diagnostics (raw payload, seq gaps, clock delta) behind toggle. 1 layout.
**White-label:** Config (`/config`), not conditionals. Theme/wordmark/features swap together. Per-tenant conditional = defect. Config covers theming/features, NOT authorization (server concern).

---

## 8. AI Usage

> **[FILL]** Probe in follow-up: agent-generated kept files, rejected output, hand-written, line-by-line reviewed. Specific rejections > general claims.

Repo assumes agents write large share of code (that's what `CLAUDE.md`, routing, doc-comments, boundaries are for). Claim isn't "no AI", it's "structure makes agent code checkable":
- Boundary rule fails build.
- Token lint rejects agent hex literals.
- Contract tests pin canonical output.
- Doc comments ground next agent.

---

## 9. Not Built

| Cut                               | Reason                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Robot discovery/commissioning** | Highest-value front-end, cut because provisioning/credentials is a different exercise.                                                                             |
| **Schema-driven config forms**    | Right answer for differing vendor schemas, cut for time. Capability model is foundation.                                                                           |
| **Auth/multi-tenancy**            | Real tenancy is auth model, not filter. Config = theming/features only.                                                                                            |
| **Commands to robots**            | Requires state machine (requested, ack, executing, completed, failed, unknown) + audit. Fake buttons reporting unverifiable success violates anti-stale principle. |
| **Cloud/on-prem skew**            | Envelope has schema version for this, but full compatibility window out of scope.                                                                                  |
| **Floor plans/calibration**       | Transform robot map → building drawing per site/floor is real problem. Positions shown native map frame + frame name. Abstract bounds used.                        |
| **Horizontal scale/broker**       | Correct at this size. Seam named: ingest stateless, state/fan-out partition. In-memory state won't scale across instances.                                         |
| **Alerting/escalation**           | Different product than live view.                                                                                                                                  |
| **Persistent history**            | In-memory current state, rebuildable. History = bounded per-robot ring buffer (decimated sparkline). [ADR 6].                                                      |

---

## 10. Measurements

> **[FILL]** Run load mode, fill table. Claims need measurements.

|                                       | 50 robots @ 1 Hz | 500 robots @ 5 Hz |
| ------------------------------------- | ---------------- | ----------------- |
| Ingest throughput (events/s)          |                  |                   |
| Ingest → fan-out latency (p50 / p95)  |                  |                   |
| WebSocket messages/s after coalescing |                  |                   |
| Client frame time under load (p95)    |                  |                   |
| Table rows rendered / virtualized     |                  |                   |
| Memory, server / client               |                  |                   |

**Contrast verification** (WCAG 2.2 AA):

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

Deliberate scope:
- Adapter contract tests (recorded fixture → exact output).
- Envelope validation (valid, missing, malformed, boundary, unknown).
- Idempotent ingest (no double-apply, no backwards state).
- Freshness machine (injected time, threshold boundaries).
- E2E (simulator → visibly stale row).
- Boundary lint (violation fails, legal passes).
- **No component snapshots** (asserts no-change, not correctness; trains blind diff acceptance).

## Licence

[MIT.](./LICENSE)
