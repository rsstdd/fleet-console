# Fleet Console — Demonstration Guide

A presenter's walkthrough of the whole stack — contracts, adapters, simulator, server,
and above all the **console** — organized as seven acts that put the system into every
server state it has and every adapter dialect it speaks. Each act says what to run,
what to watch in the frontend, and why it matters.

`demo/demo.sh` drives the whole sequence interactively; every act also lists its manual
commands so you can run it from three terminals instead.

**Duration:** ~12 minutes for Acts 1–6; Act 7 is optional.
**Companion script:** [`demo/demo.sh`](./demo.sh)

---

## 1. What this demo proves

Two guarantees, both enforced by tooling rather than discipline:

1. **The console never presents stale state as current** (Principle 4). Freshness is
   derived by a recurring server sweep, not on message arrival, and the frontend never
   recomputes it — it renders exactly what the sweep decided (ADR 3).
2. **Vendor differences are normalized where shared and preserved as declared
   capabilities where not** (Principle 3). Three deliberately incompatible wire dialects
   render in one table with zero vendor conditionals in the UI.

The heart of the demo is a contrast between two failures that most dashboards conflate:

| Failure                    | What the frontend shows                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A robot goes silent**    | Its row degrades `Live → Stale → Unreachable` **while the banner stays "Stream connected"** — the server still has a current answer about that robot.              |
| **The console goes blind** | Every per-robot freshness label is suppressed, rows retain last-known data, and the banner says so at the connection level — the console refuses to guess per row. |

Deriving freshness server-side is what makes those two distinguishable at all. That
contrast is Acts 4 and 5.

## 2. The cast

| Package     | Role in the demo                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `contracts` | Canonical envelope, capability model, the pure freshness function, Zod schemas.                                       |
| `adapters`  | One module per vendor dialect (A, B, C), recorded fixtures, unknown-field ledger, dispatch registry.                  |
| `simulator` | Deterministic multi-vendor telemetry producer with fault injection (`--drop`, `--robots`, `--hz`).                    |
| `server`    | Ingest, adapter dispatch, in-memory state, the 500 ms freshness sweep, WebSocket fan-out, `/api/health`.              |
| `web`       | **The deliverable.** React + MUI console: fleet table, robot detail, capability panels, personas, connection honesty. |

## 3. State vocabulary

Two orthogonal state families. Keeping them separate is the product.

### Per-robot freshness — owned by the server

Derived every 500 ms by the sweep from `receivedAt` against the deployed policy
(`config/freshness.json`: LIVE through 2 s of silence, STALE through 10 s, then
UNREACHABLE). It travels as a field on the envelope; the frontend holds **no freshness
timer** and never computes it.

| State         | Meaning                                     | Frontend rendering                                                       |
| ------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `UNKNOWN`     | Never heard from (seeded from the manifest) | Row exists with identity, no telemetry presented as fact                 |
| `LIVE`        | Heard from within 2 s                       | Filled status chip, numeric battery, `Live` label                        |
| `STALE`       | Silent for 2–10 s                           | Outline chip with `(last known)`, battery em-dashed, `Stale` label       |
| `UNREACHABLE` | Silent beyond 10 s                          | Outline chip with `(last known)`, battery em-dashed, `Unreachable` label |

The summary strip counts exactly these four — mutually exclusive, totalling the fleet.

### Stream connection — owned by the client, fail-closed

`connecting → connected → reconnecting → disconnected`, defaulting to disconnected
until a real socket proves otherwise (ADR 23). Reconnection is automatic on a
full-jitter schedule; a restarted server is detected by its `serverSessionId` and the
console re-joins from the new snapshot without a reload (ADR 31). `disconnected` is
terminal, names its cause, and offers **Retry now**.

While the stream is anything but connected, per-robot freshness labels are suppressed
and the summary heading becomes **"Fleet freshness · last known"** — the console never
asserts a currency the socket cannot support.

## 4. The adapters: three dialects that disagree on purpose

|                    | Vendor A                          | Vendor B                                        | Vendor C                         |
| ------------------ | --------------------------------- | ----------------------------------------------- | -------------------------------- |
| Shape              | nested                            | **flat**                                        | nested                           |
| Battery            | fraction 0–1                      | **integer percent**                             | fraction 0–1                     |
| Position           | metres                            | **centimetres**                                 | metres                           |
| Timestamp          | ISO 8601                          | **epoch ms**                                    | ISO 8601                         |
| Status             | strings                           | **numeric codes**                               | strings                          |
| Sequence           | yes                               | **absent** (adapter synthesizes from timestamp) | yes                              |
| Capabilities       | `dock`, `lidarHealth`, `sequence` | `dock` only                                     | `dock`, `waterLevel`, `sequence` |
| Undocumented field | —                                 | —                                               | **`telemetry.firmware_channel`** |

Each adapter identifies its dialect, converts to the canonical envelope, declares
capabilities, and retains the raw payload for technician diagnosis only. Vendor C's
undocumented field is not discarded — it increments a per-adapter counter surfaced on
`GET /api/health` with its scope stated in `unknownFieldScope` (ADRs 15, 25).

**Frontend consequence:** capability panels render from declarations, never from vendor
names. `if (vendor === …)` inside `features/` is a lint-visible defect.

## 5. Preflight

```bash
node --version    # >= 24.15.0
pnpm --version    # >= 11.20.0
pnpm install
```

Ports 8080 (server) and 5173 (console) must be free. The server boots on the committed
`config/fleet-manifest.json` (50 robots, `R-001`–`R-050`) and `config/freshness.json`.

**`demo.sh` clears the field itself.** Its preflight stops any leftover process from
this repo — a `pnpm dev` stack (whose watch-mode simulator is a client no port check
can see, and would feed the demo's fresh server until Act 1 reads Live instead of
Unknown), or a previous demo's server, console, or simulator — then verifies ports
8080 and 5173 are free. It matches by command line _and_ working directory, so it
never touches processes from other repos; anything foreign still holding a port
aborts the run with the kill command to run yourself.

Then either run the guided script:

```bash
./demo/demo.sh
```

…or open three terminals and follow the manual commands in each act:

```bash
# Terminal 1 — server
pnpm --filter @fleet/server start

# Terminal 2 — console (Vite proxies /api and /ws to the server)
pnpm --filter web dev

# Terminal 3 — simulator (started/stopped per act)
pnpm --filter @fleet/simulator start
```

---

## 6. The acts

### Act 1 — Cold start: UNKNOWN is honest

**Run:** server and console only. **Do not start the simulator yet.**
Open `http://localhost:5173`.

**Watch the frontend:**

- All 50 robots are present — the server seeded its state map from the fleet manifest,
  so a robot nobody has heard from is a **row**, not an absence.
- Every row reads `Unknown`; the summary strip shows `Unknown: 50`.
- The banner shows the stream connecting, then `Stream connected`.

**Say:** "UNKNOWN is a real state, not missing data. The console distinguishes 'never
reported' from 'stopped reporting' — they will look different all demo long."

### Act 2 — Live fleet: three dialects, one table

**Run:**

```bash
pnpm --filter @fleet/simulator start        # 50 robots at 1 Hz
```

**Watch the frontend:**

- The summary strip flips to nearly all `Live` within a sweep or two; rows update from
  the WebSocket delta stream (coalesced, up to 10 Hz) with no reload. Expect a few rows
  to flicker `Stale` at this cadence — the README's observed run read
  `{Live: 46, Stale: 4}`, because a 1 Hz emission rate sits close to the 2 s live
  threshold. That flicker is the sweep working, not a fault.
- One table carries all three dialects normalized: `R-001` (Vendor A, fractional
  battery), `R-002` (Vendor B, integer percent over a flat payload), `R-003` (Vendor C)
  — same columns, same formatting, no vendor branch anywhere in the rendering path.
- Work the **filters**: site, vendor, freshness, and free-text search compose; filter to
  a single robot and back. Filtered-to-nothing renders a designed empty state, not a
  blank table.
- Keyboard-only pass: tab through filters and row links — focus is visible and logical
  throughout (WCAG 2.2 AA target, Principle 6).

**Say:** "Vendor B sends flat payloads, centimetres, epoch timestamps, numeric status
codes, and no sequence number at all. You cannot tell from this table — that's the
adapters' job, done before the frontend ever sees the data."

### Act 3 — Adapters up close: capability panels and the technician persona

**Run:** nothing new. Click into three robots in turn: `R-001` (A), `R-002` (B),
`R-003` (C).

**Watch the frontend:**

- **Capability panels differ because the robots differ:** A shows dock + lidar health,
  B shows dock alone, C shows dock + water level. Absence is the interface — no
  disabled placeholders, no greyed-out lidar panel for Vendor C. The UI cannot offer
  what the robot cannot do.
- Flip the **persona toggle**. Operator view is the default summary; **Technician**
  reveals diagnostics: adapter id and version, raw vendor payload (served only by the
  single-robot endpoint, never in the fleet read model or delta stream), sequence
  evidence, and receipt times. Severity is carried by words, never by colour alone.
- The **battery history sparkline** fetches on visit from
  `GET /api/robots/:id/history` — a bounded ring buffer, decimated to at most 60
  extrema-preserving points (ADR 33).

**Then show the ledger:**

```bash
curl -s http://127.0.0.1:8080/api/health
```

Vendor C's undocumented `telemetry.firmware_channel` is being **counted**, per adapter,
with the scope declared in `unknownFieldScope`. Vendors A and B sit at zero.

**Say:** "Quietly discarding fields rots integrations. The unknown-field ledger is how
the next engineer finds out Vendor C's firmware started sending something new — from a
counter, not from a customer call."

### Act 4 — Robots go silent: degradation with the stream up

> ⚠️ **Order matters.** Robots must have been LIVE before you drop them. Running
> `--drop` from a cold fleet leaves those robots at `UNKNOWN` — which is correct
> behaviour (they never reported) but makes the demo look broken. Act 2 must run first.

**Run:**

```bash
# Stop the simulator (Ctrl-C), then restart with three robots silenced:
pnpm --filter @fleet/simulator start -- --drop R-007,R-023,R-041
```

**Watch the frontend (~15 seconds of theatre):**

- ~2 s of silence: `R-007`, `R-023`, `R-041` flip to `Stale` — outline chips,
  `(last known)`, batteries em-dashed. Summary: `Live: 47 · Stale: 3`.
- ~10 s: the three degrade to `Unreachable`. Summary: `Live: 47 · Unreachable: 3`.
- **The banner never moves.** `Stream connected` the whole time — the server is
  reachable and is _positively reporting_ that these three robots are not.
- Every other row keeps updating live throughout.

**Say:** "Nothing was sent to the console about these robots — that's the point.
Silence is an event. The server's sweep noticed the absence and told the console.
A system that reacts only to arrivals would still be showing them as fine."

### Act 5 — The console goes blind: stream loss

**Run:** kill the server (Ctrl-C in its terminal, or the script does it for you).
Leave the simulator running — its sends fail; that's fine.

**Watch the frontend:**

- The banner flips to **`Stream reconnecting`** and the console starts jittered
  reconnect attempts.
- **Every per-robot freshness label disappears.** No `Live`, no `Stale` — the console
  has no current answer about any robot and refuses to guess per row.
- The table **retains** last-known data — identity, last battery, last status — and the
  summary heading becomes **"Fleet freshness · last known"**.

**Say:** "Compare with Act 4. There, three labels changed and the banner held. Here,
every label is gone and the banner explains why. Same underlying phenomenon — missing
messages — but two different failures, and the operator can tell them apart because
freshness is derived server-side."

### Act 6 — Recovery: no reload, no retry button

**Run:** restart the server:

```bash
pnpm --filter @fleet/server start
```

**Watch the frontend:**

- The console's reconnect loop finds the new process, detects the changed
  `serverSessionId`, and replaces its picture from the fresh snapshot — **no page
  reload, no manual retry** (ADR 31).
- Freshness labels return. The dropped trio reads `Unknown` on the restarted server
  (fresh process, never heard from them) — honest again.
- Restart the simulator **without** `--drop`: within seconds every robot returns to
  `Live`. Dropped robots resume from frozen state — their sequence and battery did
  not advance while silent.

**Say:** "Recovery is symmetric with failure: the transport reconciles, the sweep
re-derives, the rows resume. The whole loop — kill, restart, rejoin — is committed
Playwright automation against the real stack, in three browser engines (ADR 32)."

### Act 7 (optional) — Scale and tenancy

**Scale.** The documented load profile:

```bash
pnpm --filter @fleet/simulator start -- --robots 500 --hz 5   # ~2,500 req/s
```

One prerequisite the command alone hides: the server only accepts robots its
manifest lists, and the committed `config/fleet-manifest.json` holds 50 — run
against it, the other 450 robots are 404-rejected at ingest and the table never
grows past 50. `demo.sh` handles this: it generates a 500-robot roster with the
simulator's own `--print-manifest` (same seed, so the first 50 robots are
identical), swaps it in, restarts the server on it, and restores the committed
file on exit. Doing it by hand means the same swap-and-restart before starting
the load simulator.

The un-virtualized table absorbs it by measurement, not hope: 500 robots at ten
WebSocket frames/second in production Chromium applied 120 of 120 frames at 9.79 Hz
with p95 delta-to-paint of 53.7 ms (`pnpm test:e2e:scale`, ADR 24/32). Server-side,
ingest accepted ~5,971 req/s at concurrency 128 with **zero late sweep ticks** — the
failure mode that matters, because a sweep that stops firing is stale-shown-as-live.

**Tenancy.** Tenant is a build-time, schema-validated profile — theme, wordmark, and
flags selected together; unknown values fail the build (ADR 17):

```bash
pnpm dev:tenant-b                            # whole stack as tenant B
VITE_TENANT=tenant-b pnpm --filter web dev   # console only
```

`demo.sh` offers this as its second Act 7 extra: it starts a tenant-B console on
port 5174 next to tenant A on 5173, both against the same server, so the audience
compares the builds side by side — light theme, the "Northwind Robotics" wordmark,
and no lidar panel on `R-001`, gated by `flags.lidarHealthPanel` with **no tenant
conditional in any component** (Principle 13).

**Dev extras:** `/dev/ui` (dev builds only) renders the shared component gallery —
every chip, label, banner state, and empty state in one place.

---

## 7. The frontend, structurally

What to point at if the audience wants to know _why_ the console holds up:

- **Feature-sliced layers, lint-enforced** (Principle 9): `app → features → entities →
shared`; no cross-feature imports; `shared/ui` is presentational-only and receives
  display data and callbacks, never domain imports. `__boundary-violation__` fixtures
  prove the lint fails on violations and passes legal imports.
- **Complete async state surfaces** (Principle 5): every surface defines loading,
  empty, stale, offline, recoverable error, and terminal error. You saw most of them:
  cold-start UNKNOWN (Act 1), filtered-empty (Act 2), stale/last-known (Act 4),
  offline with retained data (Act 5), terminal disconnect with Retry (banner).
- **No freshness computation client-side** (ADR 3): `packages/web` holds no freshness
  timer. Search the tree — the only freshness logic is rendering the server's field.
- **Design tokens, not hex** (Principle 8): raw hex/px are lint-rejected outside
  `shared/ui`/`config`; theming is MUI tokens plus the tenant profile.
- **Accessibility as a target, not a vibe** (Principle 6): semantic `<table>` (one
  reason the table isn't virtualized), keyboard operability without focus theft
  (a committed e2e scenario), `jsx-a11y` in the lint pass.
- **Evidence in browsers** (ADR 32): `pnpm test:e2e` drives the real server, simulator,
  and production bundle through seven scenarios — including Acts 4, 5, and 6 — in
  Chromium, Firefox, and (CI) WebKit. The demo you just gave runs unattended on every
  merge.

## 8. Troubleshooting

| Symptom                                          | Cause / fix                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Dropped robots show `Unknown`, not `Unreachable` | Cold start with `--drop` — they were never LIVE. Run the simulator once without the flag first (Act 2 before Act 4).     |
| `--drop R-2O4` exits with code 2                 | Deliberate: unknown ids fail at startup naming the id and fleet range, rather than silently dropping nothing.            |
| Server won't start                               | Port 8080 busy, or invalid `config/freshness.json` — startup validation fails loudly instead of coercing (Principle 13). |
| Banner stuck on `Stream reconnecting`            | The server really is down, or the Vite proxy target moved — check `FLEET_SERVER_HOST`/`FLEET_SERVER_PORT` on both sides. |
| Demo feels slow to degrade                       | It's the policy, not lag: STALE at 2 s of silence, UNREACHABLE at 10 s, swept every 500 ms.                              |
