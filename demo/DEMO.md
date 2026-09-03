# Fleet Console Demonstration Guide

This guide walks through the full stack: contracts, adapters, the simulator, the server, and, most importantly, the console. The demonstration is divided into seven acts that cover every server state and adapter dialect. Each act explains what to run, what to watch in the frontend, and why the behavior matters.

Run the full sequence interactively with `demo/demo.sh`. If you prefer to control each service yourself, every act also includes the commands needed to run the demonstration from three terminals.

**Duration:** About 12 minutes for Acts 1–6. Act 7 is optional.
**Companion script:** [`demo/demo.sh`](./demo.sh)
**Architecture and UI companion:** [`demo/PROJECT_GUIDE.md`](./PROJECT_GUIDE.md)

---

## 1. What this project demonstrates

The project makes two central claims:

1. **The console never presents stale state as current** (Principle 4). A recurring server-side sweep determines freshness; message arrival does not. The frontend displays the resulting state without recomputing it (ADR 3).
2. **Shared vendor behavior is normalized, while genuine differences remain explicit capabilities** (Principle 3). Three deliberately incompatible wire formats appear in one table without vendor-specific conditions in the UI.

The key demonstration is the difference between two failures that most dashboards treat as the same:

| Failure                    | What the frontend shows                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A robot goes silent**    | Its row degrades from `Live` to `Stale` to `Unreachable`, while the banner continues to show `Stream connected`. The server still has a current answer about that robot.              |
| **The console goes blind** | The console suppresses every per-robot freshness label, retains the last-known row data, and reports the connection failure in the banner. It does not guess about individual robots. |

The console can distinguish these failures because freshness is derived on the server. Acts 4 and 5 show the contrast directly.

## 2. The components

| Package     | Role in the demonstration                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts` | Defines the canonical envelope, capability model, pure freshness function, and Zod schemas.                                                       |
| `adapters`  | Contains one module for each vendor dialect (A, B, and C), recorded fixtures, the unknown-field ledger, and the dispatch registry.                |
| `simulator` | Produces deterministic, multi-vendor telemetry and supports fault injection through `--drop`, `--robots`, and `--hz`.                             |
| `server`    | Handles ingest, adapter dispatch, in-memory state, the 500 ms freshness sweep, WebSocket fan-out, and `/api/health`.                              |
| `web`       | **The deliverable.** A React and MUI console with the fleet table, robot details, capability panels, personas, and accurate connection reporting. |

## 3. State model

The product keeps two independent kinds of state separate: per-robot freshness and the client’s connection to the stream.

### Per-robot freshness: owned by the server

Every 500 ms, the server compares `receivedAt` with the policy in `config/freshness.json`. A robot remains LIVE through two seconds of silence, becomes STALE for the next eight seconds, and becomes UNREACHABLE after ten seconds.

Freshness travels as a field in the envelope. The frontend has no freshness timer and does not calculate the state itself.

| State         | Meaning                                              | Frontend rendering                                                                 |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `UNKNOWN`     | The robot is in the manifest but has never reported. | The row shows its identity without presenting telemetry as fact.                   |
| `LIVE`        | The robot reported within the past two seconds.      | Filled status chip, numeric battery value, and `Live` label.                       |
| `STALE`       | The robot has been silent for 2–10 seconds.          | Outline chip with `(last known)`, an em dash for battery, and `Stale` label.       |
| `UNREACHABLE` | The robot has been silent for more than ten seconds. | Outline chip with `(last known)`, an em dash for battery, and `Unreachable` label. |

The summary strip counts these four mutually exclusive states, which always total the full fleet.

### Stream connection: owned by the client and closed by default

The connection moves through `connecting → connected → reconnecting → disconnected`. It begins as disconnected until a real socket proves otherwise (ADR 23).

Reconnection uses a full-jitter schedule. When the server restarts, the client detects the new `serverSessionId` and replaces its state from the new snapshot without reloading the page (ADR 31). The terminal `disconnected` state names the cause and provides a **Retry now** action.

Whenever the stream is not connected, the console suppresses per-robot freshness labels and changes the summary heading to **Fleet reporting status · last known**. The socket cannot support a current claim, so the console does not make one.

## 4. Three deliberately incompatible adapter dialects

|                    | Vendor A                          | Vendor B                                              | Vendor C                         |
| ------------------ | --------------------------------- | ----------------------------------------------------- | -------------------------------- |
| Shape              | Nested                            | **Flat**                                              | Nested                           |
| Battery            | Fraction from 0–1                 | **Integer percentage**                                | Fraction from 0–1                |
| Position           | Metres                            | **Centimetres**                                       | Metres                           |
| Timestamp          | ISO 8601                          | **Epoch milliseconds**                                | ISO 8601                         |
| Status             | Strings                           | **Numeric codes**                                     | Strings                          |
| Sequence           | Present                           | **Absent**; the adapter derives it from the timestamp | Present                          |
| Capabilities       | `dock`, `lidarHealth`, `sequence` | `dock` only                                           | `dock`, `waterLevel`, `sequence` |
| Undocumented field | —                                 | —                                                     | **`telemetry.firmware_channel`** |

Each adapter identifies its dialect, converts the payload into the canonical envelope, declares the available capabilities, and retains the raw payload for technician diagnostics only.

Vendor C’s undocumented field is not discarded. It increments a counter for that adapter, exposed through `GET /api/health`, with the counting scope stated in `unknownFieldScope` (ADRs 15 and 25).

**Frontend consequence:** Capability panels depend on declarations, not vendor names. Any `if (vendor === …)` condition inside `features/` is a lint-visible defect.

## 5. Preflight

```bash
node --version    # >= 24.15.0
pnpm --version    # >= 11.20.0
pnpm install
```

Ports 8080 for the server and 5173 for the console must be available. The server starts with the committed `config/fleet-manifest.json`, which defines 50 robots from `R-001` through `R-050`, and the policy in `config/freshness.json`.

### Cleanup performed by `demo.sh`

The script stops leftover processes from this repository before starting the demonstration. This includes a `pnpm dev` stack, a previous demonstration server, the console, or the simulator.

This cleanup matters because a simulator running in watch mode is only a client and does not hold a port. Without the cleanup, it could feed the new server before Act 1 and make robots appear Live instead of Unknown.

The script matches both the command line and working directory, so it does not stop processes from other repositories. If an unrelated process still holds port 8080 or 5173, preflight stops and prints the command you can use to end it.

Run the guided demonstration with:

```bash
./demo/demo.sh
```

Alternatively, open three terminals and use the following commands throughout the acts:

```bash
# Terminal 1 — server
pnpm --filter @fleet/server start

# Terminal 2 — console; Vite proxies /api and /ws to the server
pnpm --filter web dev

# Terminal 3 — simulator; start and stop it as directed in each act
pnpm --filter @fleet/simulator start
```

---

## 6. Demonstration walkthrough

### Act 1 — Cold start: UNKNOWN is honest

**Run:** Start the server and console only. Do not start the simulator. Then open `http://localhost:5173`.

**Watch the frontend:**

- All 50 robots appear because the server seeds its state from the fleet manifest. A robot that has never reported is a row, not an absence.
- Every row shows `Unknown`, and the summary strip shows `Unknown: 50`.
- The banner moves from connecting to `Stream connected`.

**Say:** “UNKNOWN is a real state, not missing data. The console distinguishes a robot that has never reported from one that stopped reporting, and that distinction remains visible throughout the demonstration.”

### Act 2 — Live fleet: three dialects, one table

**Run:**

```bash
pnpm --filter @fleet/simulator start        # 50 robots at 1 Hz
```

**Watch the frontend:**

- Within one or two sweeps, the summary changes to almost entirely `Live`. Rows update through the WebSocket delta stream, coalesced at up to 10 Hz, without a reload.
- A few rows may briefly become `Stale`. In one observed run, the summary showed `{Live: 46, Stale: 4}` because a 1 Hz emission rate is close to the two-second live threshold. The flicker shows that the sweep is working; it is not a fault.
- `R-001` uses Vendor A’s fractional battery value, `R-002` uses Vendor B’s integer percentage and flat payload, and `R-003` uses Vendor C. All three appear with the same columns and formatting because the rendering path contains no vendor branch.
- Combine the site, vendor, freshness, and free-text filters. Filter down to one robot, return to the full fleet, and then produce no matches. The final case shows a designed empty state rather than a blank table.
- Complete a keyboard-only pass through the filters and row links. Focus remains visible and follows a logical order, supporting the WCAG 2.2 AA target in Principle 6.

**Say:** “Vendor B sends a flat payload with centimetres, epoch timestamps, numeric status codes, and no sequence number. The table does not expose those differences because the adapter resolves them before the frontend receives the data.”

### Act 3 — Capabilities and the technician view

**Run:** Leave the current services running. Open `R-001` for Vendor A, `R-002` for Vendor B, and `R-003` for Vendor C.

**Watch the frontend:**

- The capability panels differ because the robots differ. Vendor A shows dock and lidar health, Vendor B shows dock only, and Vendor C shows dock and water level. Missing capabilities do not produce disabled placeholders or irrelevant panels.
- Switch from the default Operator view to **Technician**. The technician view adds the adapter ID and version, raw vendor payload, sequence evidence, and receipt times. Raw payloads come only from the single-robot endpoint; they never enter the fleet read model or delta stream. Words carry severity, not color alone.
- The battery history sparkline loads on visit from `GET /api/robots/:id/history`. The endpoint uses a bounded ring buffer and reduces the result to no more than 60 extrema-preserving points (ADR 33).

Then show the unknown-field ledger:

```bash
curl -s http://127.0.0.1:8080/api/health
```

Vendor C’s undocumented `telemetry.firmware_channel` field is counted by adapter, with the scope defined in `unknownFieldScope`. Vendors A and B remain at zero.

**Say:** “Silently discarding fields weakens integrations. The unknown-field ledger tells the next engineer that Vendor C’s firmware started sending something new. They learn from a counter instead of a customer report.”

### Act 4 — Robots go silent while the stream remains connected

> **Order matters:** The robots must have been LIVE before they are dropped. Starting a cold fleet with `--drop` leaves those robots at `UNKNOWN`, which is correct because they never reported, but it does not demonstrate degradation. Run Act 2 before Act 4.

**Run:** Stop the simulator with Ctrl+C, then restart it with three robots silenced:

```bash
pnpm --filter @fleet/simulator start -- --drop R-007,R-023,R-041
```

**Watch the frontend for about 15 seconds:**

- After about two seconds of silence, `R-007`, `R-023`, and `R-041` become `Stale`. Their chips switch to outlines, status text gains `(last known)`, and battery values become em dashes. The summary shows `Live: 47 · Stale: 3`.
- After about ten seconds, the same robots become `Unreachable`. The summary shows `Live: 47 · Unreachable: 3`.
- The banner remains `Stream connected` throughout. The server is reachable and is positively reporting that the robots are not.
- Every other row continues to update.

**Say:** “The simulator sent nothing about these robots, which is precisely the point. Silence is an event. The server sweep detected the absence and reported it to the console. A system that responds only to incoming messages would still show these robots as healthy.”

### Act 5 — The console loses the stream

**Run:** Stop the server with Ctrl+C in its terminal, or allow the script to stop it. Leave the simulator running; its requests will fail temporarily.

**Watch the frontend:**

- The banner changes to `Stream reconnecting`, and the client begins jittered reconnect attempts.
- Every per-robot freshness label disappears. The console has no current answer about any robot, so it makes no claim at the row level.
- The table retains last-known identity, battery, and status data. The summary heading changes to **Fleet reporting status · last known**.

**Say:** “Compare this with Act 4. There, three freshness labels changed while the connection remained healthy. Here, every label disappears and the banner explains why. Both failures involve missing messages, but the operator can distinguish them because the server owns freshness.”

### Act 6 — Recovery without a reload

**Run:** Restart the server:

```bash
pnpm --filter @fleet/server start
```

**Watch the frontend:**

- The reconnect loop finds the new process, detects the changed `serverSessionId`, and replaces its state from the new snapshot. No page reload or manual retry is required (ADR 31).
- Freshness labels return. The three dropped robots show `Unknown` because the restarted server has never heard from them.
- Restart the simulator without `--drop`. Within seconds, every robot returns to `Live`. The previously dropped robots resume from their frozen state because their sequence and battery values did not advance while they were silent.

**Say:** “Recovery mirrors failure: the transport reconnects, the server derives freshness again, and the rows resume. Playwright runs this complete sequence against the real stack in three browser engines as committed automation (ADR 32).”

### Act 7 — Optional scale and tenancy demonstrations

#### Scale

The documented load profile is:

```bash
pnpm --filter @fleet/simulator start -- --robots 500 --hz 5   # ~2,500 req/s
```

The command has one important prerequisite: the server accepts only robots listed in its manifest. The committed `config/fleet-manifest.json` contains 50 robots, so the server rejects the remaining 450 with 404 responses and the table does not grow beyond 50.

`demo.sh` handles the prerequisite automatically. It uses the simulator’s `--print-manifest` option to generate a 500-robot roster from the same seed, preserving the first 50 robots, then swaps in the new manifest and restarts the server. The script restores the committed file when it exits. A manual run requires the same manifest swap and server restart before the load simulator begins.

The unvirtualized table is supported by measurement. With 500 robots and ten WebSocket frames per second in production Chromium, the console applied 120 of 120 frames at 9.79 Hz, with a p95 delta-to-paint time of 53.7 ms (`pnpm test:e2e:scale`, ADRs 24 and 32).

On the server, ingest accepted about 5,971 requests per second at concurrency 128 with zero late sweep ticks. That result matters because a delayed sweep can present stale data as live.

#### Tenancy

Tenant configuration is a build-time, schema-validated profile that selects the theme, wordmark, and feature flags together. Unknown values fail the build (ADR 17).

```bash
pnpm dev:tenant-b                            # entire stack as tenant B
VITE_TENANT=tenant-b pnpm --filter web dev   # console only
```

The second optional Act 7 demonstration in `demo.sh` starts the Tenant B console on port 5174 beside Tenant A on port 5173. Both use the same server, allowing the audience to compare the builds directly.

Tenant B uses a light theme, displays the “Northwind Robotics” wordmark, and hides the lidar panel for `R-001`. The `flags.lidarHealthPanel` setting controls the panel without a tenant-specific condition in any component (Principle 13).

**Development extra:** In development builds, `/dev/ui` displays the shared component gallery, including every chip, label, banner state, and empty state.

---

## 7. Why the frontend holds up

If the audience wants to examine the implementation, focus on these decisions:

- **Feature-sliced, lint-enforced layers** (Principle 9): Dependencies flow through `app → features → entities → shared`. Cross-feature imports are prohibited. `shared/ui` remains presentational and receives display data and callbacks without importing domain logic. The `__boundary-violation__` fixtures prove that linting rejects invalid imports and permits valid ones.
- **Complete asynchronous states** (Principle 5): Every surface defines loading, empty, stale, offline, recoverable error, and terminal error behavior. The demonstration covers cold-start UNKNOWN in Act 1, a filtered empty state in Act 2, stale and last-known data in Act 4, and retained offline data in Act 5. The banner also covers a terminal disconnect with a Retry action.
- **No client-side freshness calculation** (ADR 3): `packages/web` contains no freshness timer. The frontend only renders the field supplied by the server.
- **Design tokens instead of raw values** (Principle 8): Linting rejects raw hex and pixel values outside `shared/ui` and `config`. MUI tokens and the tenant profile provide theming.
- **Accessibility as a defined target** (Principle 6): The console uses a semantic `<table>`, which is one reason it is not virtualized. It also supports keyboard operation without stealing focus, includes a committed end-to-end keyboard scenario, and runs `jsx-a11y` during linting.
- **Browser-level evidence** (ADR 32): `pnpm test:e2e` runs the real server, simulator, and production bundle through seven scenarios, including Acts 4–6, in Chromium, Firefox, and WebKit in CI. The demonstration runs unattended on every merge.

## 8. Troubleshooting

| Symptom                                                 | Cause and fix                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dropped robots show `Unknown` instead of `Unreachable`. | The fleet started cold with `--drop`, so those robots never became LIVE. Run the simulator without the flag first; Act 2 must precede Act 4.          |
| `--drop R-2O4` exits with code 2.                       | This is deliberate. Unknown IDs fail at startup and identify both the invalid ID and valid fleet range instead of silently dropping nothing.          |
| The server does not start.                              | Port 8080 is occupied, or `config/freshness.json` is invalid. Startup validation fails explicitly rather than coercing invalid values (Principle 13). |
| The banner remains on `Stream reconnecting`.            | The server is still down, or the Vite proxy target changed. Check `FLEET_SERVER_HOST` and `FLEET_SERVER_PORT` on both sides.                          |
| Degradation feels slow.                                 | The timing comes from policy, not lag: STALE begins after two seconds of silence, UNREACHABLE after ten seconds, and the sweep runs every 500 ms.     |
