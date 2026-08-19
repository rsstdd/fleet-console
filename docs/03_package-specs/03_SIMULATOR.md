# 03 — `@fleet/simulator`

- **Status:** implemented and runnable
- **Package:** `packages/simulator`
- **Governing documents:** ADR 1 (vendor dialects), ADR 2 (HTTP ingest, load profile),
  ADR 3 (silence is absence), ADR 9 (runtime); Principles 2, 10, 12, 13, 14

## 1. Responsibility

`@fleet/simulator` is a deterministic multi-vendor telemetry producer. It emits raw
Vendor A, B and C wire payloads over HTTP so the adapter boundary, the freshness sweep,
the console demonstration and the documented load profile all have something real to run
against.

It does **not**: normalize telemetry, define canonical contracts, derive freshness, store
fleet state, fan out WebSocket data, or know anything about the console.

The single most important non-responsibility: **the simulator never computes or sends
freshness.** A robot that has gone quiet is represented by _sending nothing_. The server
derives `live` / `stale` / `unreachable` from the arrivals it does and does not receive
(ADR 3). A synthetic `"unreachable"` in a payload would hand the server a conclusion it
exists to reach on its own, and would make the freshness demonstration circular.

## 2. Position in the dependency graph

Imports **no workspace package in production**. `@fleet/server` and `web` remain
lint-banned imports. `@fleet/adapters` is a dev dependency permitted only in tests so
`src/fleet/vendorId.test.ts` can compare the independent vendor literals; lint bans it
from production code and `src/__enforcement__/` proves that boundary still fires (ADR
16, resolving **D7** as Option 1).

The absence of production workspace imports is what keeps the executable on plain
`node` rather than `tsx` (ADR 9 § Implications). The test runner resolves the source
export of the dev dependency separately.

The three vendor identifiers are restated locally in
`src/fleet/simulatedRobot.ts` rather than imported from adapters or contracts. A
production import would invert the dependency this package exists to exercise: the
simulator must be able to emit a payload the adapters reject, which it could not do if it
shared their literal. The named parity test keeps this deliberate duplication honest in
both directions.

Nothing imports this package.

## 3. Public API

The executable is the product. `src/index.ts` exports `main(argv, env)` and starts nothing
on import — the entry-point guard compares `import.meta.url` against
`pathToFileURL(process.argv[1])`, which is what keeps the module safe to import from a
test.

Reusable primitives are exported for tests and tooling only: `startSimulator`,
`renderFleetManifest`, `parseArgs`, `createFleet`, `evolveRobot`, `buildPayload`, the
three vendor builders, `createEmissionSchedule`, `startScheduler`, `createIngestClient`,
`createMetrics`, `createFaultPolicy`, the clock and random interfaces.

No vendor payload type is exported as a canonical or domain type. They are wire shapes.

## 4. Internal structure

```
src/
  runtime/      clock.ts, random.ts — the ONLY place ambient time or randomness is read
  config/       simulatorConfig.ts — defaults, limits, ingestUrlFor
  cli/          parseArgs.ts — pure argv + env parsing
  fleet/        simulatedRobot.ts (state + evolution), createFleet.ts
  vendors/      vendorA.ts, vendorB.ts, vendorC.ts, buildPayload.ts, readRobotId.ts
  faults/       faultPolicy.ts
  scheduling/   emissionScheduler.ts
  transport/    ingestClient.ts
  observability/ simulatorMetrics.ts, logger.ts
  integration/  ingest.integration.test.ts — the only real socket and real process
  app.ts        composition and lifecycle
  index.ts      process globals: argv, env, signals, exit codes, real fetch
```

Orchestration sits at the edge; every behavioural module is pure over injected
dependencies. `app.ts` composes and owns lifecycle but holds no generation rules.

Each vendor owns its own serializer. A and C are close in shape, and that near-miss is
exactly why they are not shared: a common "nested payload" helper would make the two
dialects move together, which is the coupling the fixtures exist to disprove.

## 5. Contracts owned — the three wire dialects

These are the producer side of the schemas planned as
`packages/adapters/src/vendors/<a|b|c>/schema.ts`. A field name or unit change here
requires the adapter schema, its fixtures and its exact-output contract test to change in
the same commit.

**Vendor A** — nested, fraction battery, metres, ISO 8601, string status, real sequence.

```json
{ "robot_id", "site", "model", "seq", "timestamp",
  "telemetry": { "battery": { "level" }, "pose": { "x_m", "y_m", "heading_deg" },
                 "state", "health": { "level" },
                 "dock": { "docked", "dock_id" }, "lidar": { "rpm", "fault" } } }
```

**Vendor B** — flat, integer percent, centimetres, epoch ms, numeric codes, **no
sequence**, **no lidar**.

```json
{ "id", "site", "model", "ts", "batt_pct", "x_cm", "y_cm", "heading_cdeg",
  "status_code", "health_code", "dock_state" }
```

Status codes `0..3` = idle, busy, charging, fault. Health codes `0..2` = nominal,
degraded, critical. Every numeric field is an integer, asserted by test.

**Vendor C** — A-shaped, carrying water level, **omitting lidar entirely**, plus one
undocumented field.

```json
{ "robot_id", "site", "model", "seq", "timestamp",
  "telemetry": { "battery", "pose", "state", "health",
                 "dock", "water": { "level_pct" }, "firmware_channel" } }
```

The resulting capability profiles are distinct for all three vendors — `dock` universal,
`lidarHealth` A only, `waterLevel` C only, `sequence` A and C — so robot detail's
capability grid differs across three vendors rather than two (ADR 1 § Observed
consequences, 19 August 2026).

**Transport.** One JSON `POST` per reading to `{endpoint}/api/telemetry/{vendor}` with
`content-type: application/json` (ADR 2). ADR 8's D9 amendment ratifies **Option 1 — the
path segment**: the segment is validated against the adapter registry before any body
decoding, so adapter selection never depends on unvalidated payload contents. The route
is a two-package contract; `ingestUrlFor`, the server route, the selector, and their tests
change together.

## 6. Governing decisions

- **ADR 1** — the dialects and their deliberate disagreements.
- **ADR 2** — one reading per HTTP request; the 50 @ 1 Hz and 500 @ 5 Hz measurement
  points; batch ingest would require a distinct mode and an ADR amendment.
- **ADR 3** — `--drop` is targeted absence, never a synthetic freshness value.
- **ADR 9** — this package runs on plain `node` and is correct **only while it imports no
  workspace package**. The day it imports `@fleet/contracts`, its scripts must move to
  `tsx` in the same change, or it breaks with `ERR_MODULE_NOT_FOUND` on a `.js` specifier
  that nothing emits. ADR 9 § Open questions leans toward moving it now on consistency
  grounds.
- **ADR 14** — the simulator keeps explicit fleet inputs and produces the committed
  roster in the server's canonical spelling; CI asserts byte equality without adding a
  runtime dependency between packages.
- **Principle 12** — measurement output must distinguish simulator underproduction from
  server degradation.
- **Principle 13** — endpoint and workload are validated configuration, not literals in
  generators.

## 7. Enforcement

| Rule                                                      | Mechanism | Where                                                                   |
| --------------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| No import of server or web                                | Static    | `no-restricted-imports`                                                 |
| No `Math.random()` or `Date.now()` outside `src/runtime/` | Static    | `no-restricted-properties`, with the exception scoped to that directory |
| No floating promise in the emission loop                  | Static    | `no-floating-promises`, `no-misused-promises`                           |
| A response body cannot be asserted into shape             | Static    | `no-unsafe-type-assertion`                                              |
| Vendor dispatch is exhaustive                             | Types     | `switch-exhaustiveness-check`                                           |
| Determinism actually holds                                | Test      | same seed → byte-identical run                                          |
| The executable stays alive                                | Test      | subprocess integration test                                             |
| Generated roster equals the server's committed input      | Test      | `src/fleet/manifestParity.test.ts` (ADR 14)                             |
| Vendor set agrees with the adapter set                    | —         | **Not enforced.** See below                                             |

**The vendor-set guard does not exist.** `VENDOR_IDS` here and `SUPPORTED_VENDORS` in
`@fleet/adapters` are identical literals maintained independently, deliberately, so this
package carries no production dependency on adapters. Nothing checks that they agree, so a
fourth vendor added to one and not the other would be caught by no test — the simulator
would emit a dialect no adapter can decode, and the failure would surface as ingest
rejections at demo time. Closing it means choosing between a test-only adapters dependency
and an integration fixture test, which is decision **D7** in
`docs/PENDING_ARCHITECTURE_DECISIONS.md`.

The determinism ban is lifted in exactly one directory. `src/runtime/` adapts the ambient
platform — real clock, real randomness — into the injectable interfaces every other module
takes; move the directory and the exception moves with it. `src/index.ts` has the same
lift for process globals.

## 8. State, lifecycle and configuration

**Simulated robot state** is deliberately _not_ the canonical envelope. Vendor payloads
are produced from internal state going outward; deriving them from a normalized envelope
would make the raw dialects a reverse mapping of normalized data and hollow out the
adapter boundary the fixtures prove.

Internal units are the simulation's own frame: battery as a fraction, position in metres,
heading in degrees. Each serializer converts into its dialect's units.

Simulator **control** state — rate, seed, dropped ids, scheduler state, in-flight count,
counters — is kept separate from observed robot values (Principle 11).

**Determinism.** The same seed and robot count always produce the same fleet, initial
state and evolution. Each robot draws from its own stream derived from the run seed and
its identifier, so adding a robot does not perturb the history of robots already there.
The PRNG is mulberry32 with pinned test vectors, so an algorithm change is a visible
failure rather than a silently different fleet everywhere downstream.

**Bounds.** Battery is clamped to `[0,1]`; position reflects off the site boundary rather
than wrapping, so a robot never teleports between two readings; sequence advances by
exactly one per reading and never regresses.

**Scheduling.** One timer for the whole fleet, not one per robot. Due work is computed
from monotonic elapsed time, so callback jitter does not accumulate into permanent rate
drift. Robots are phase-offset across the period, so 500 robots at 5 Hz produce a steady
2,500 req/s rather than 500 simultaneous requests five times a second. Overdue work is
**coalesced, not queued** — replaying three lost intervals would send three readings a
second apart carrying the same timestamp, which no real robot would have done.

**Configuration.** Defaults → environment (`FLEET_INGEST_URL`, `FLEET_SIM_SEED`) → flags,
most specific wins. Every value validated at startup; an invalid one names the option and
its accepted range and exits `2` without starting a timer or opening a connection.

| Flag                  | Default                 | Notes                                                    |
| --------------------- | ----------------------- | -------------------------------------------------------- |
| `--robots <n>`        | 50                      | 1–5000                                                   |
| `--hz <n>`            | 1                       | **per robot**; total rate is `robots × hz`; ceiling 50   |
| `--seed <n>`          | 1                       |                                                          |
| `--drop <ids>`        | none                    | comma-separated, repeatable; unknown id fails at startup |
| `--endpoint <url>`    | `http://127.0.0.1:8080` |                                                          |
| `--timeout <ms>`      | 2000                    |                                                          |
| `--max-in-flight <n>` | 64                      |                                                          |
| `--retries <n>`       | **0**                   | see § 9                                                  |
| `--summary <ms>`      | 5000                    |                                                          |
| `--print-manifest`    | —                       | prints the roster and exits                              |

**Lifecycle.** Startup order is configuration → fleet → drop-target validation →
transport/metrics → scheduler, so a `--drop` typo fails before a single request is sent.
Shutdown stops scheduling, drains in-flight work to the deadline, aborts the remainder and
emits a final summary. Repeated signals are idempotent.

**Fleet roster handoff.** `--print-manifest` emits the roster as JSON so the server can
seed its current-state map and show a never-reported robot as `unknown` rather than
absent (ADR 3, server § E1). Roster ownership is an explicit handoff, not something the
server infers from whichever robot reports first.

## 9. Failure behaviour

**Faults are control state, never telemetry values.** `--drop` means no reading is
generated and no request is sent. A dropped robot's state is **frozen** — sequence and
battery do not advance while it is silent — so restarting without the flag resumes where
it stopped rather than jumping forward. Removal is by restart; there is no runtime
control. An unknown id fails at startup naming the id and the fleet's range, because a
mistyped `--drop R-2O4` that silently dropped nothing would surface much later as "the
freshness demo does not work".

**Transport outcomes** are classified into `success`, `rejected` (4xx), `server-failure`
(5xx), `timeout`, `network-failure`, `cancelled` and `shed`. Retries default to **0**: a
telemetry reading is superseded within a second, so re-sending a failed one delivers a
value the server is about to overwrite while adding load exactly when the server is
already struggling. Only 5xx, timeouts and network failures are retryable; a 4xx is never
retried, because a malformed payload will be malformed again. Backoff is exponential with
full jitter drawn from the injected source, so a retry storm is as reproducible as the run
that caused it.

**Backpressure.** At the in-flight ceiling a reading is _shed_ — refused outright and
counted — never queued. An unbounded queue would turn a slow server into a simulator
memory fault and destroy the measurement.

**Observability.** One JSON object per line plus a periodic summary. There is deliberately
**no per-reading success log**: at 500 robots and 5 Hz that is 2,500 lines a second, and
the formatting alone would make the simulator the bottleneck it exists to measure.
`readingsAttempted`, `requestsSent`, `retriesSent` and `sendSucceeded` are separate so
underproduction, retrying and rejection can be told apart. `skippedOverdue` (a robot's
previous send was still outstanding) and `coalescedOverdue` (the process woke late) are
separate because they point at different layers. Rates come from a monotonic clock, never
from the configured rate, because the whole purpose of the number is to show when the two
disagree. The endpoint is credential-stripped before it is logged.

## 10. Verification matrix

| Concern               | Check                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Dialect exactness     | Full payload equality per vendor, against a fixed instant                                |
| Load-bearing absences | B has no `seq` and no `lidar`; C has no `lidar` — by key absence and by string search    |
| Unit disagreement     | Same state → 0.5 fraction (A, C) vs 50 percent (B); metres vs centimetres                |
| No canonical leakage  | No emitted payload contains `batteryPercent`, `receivedAt`, `capabilities`, `robotId`, … |
| Determinism           | Same seed → identical fleet and identical send sequence                                  |
| Fleet allocation      | Vendor mix even to within one for every count; identity stable across runs               |
| Rate accuracy         | 50 @ 1 Hz and 500 @ 5 Hz over controlled virtual time                                    |
| Per-robot fairness    | Distribution asserted, not only the aggregate                                            |
| Drop targeting        | Only named robots silent; others at full rate; dropped state frozen                      |
| Bounded transport     | Ceiling never exceeded; burst sheds; capacity released after failure                     |
| Retry policy          | Bounded, 4xx never retried, backoff reproducible                                         |
| CLI                   | Defaults, every flag, every rejection, `--help` starts nothing                           |
| Real HTTP             | Method, headers, route, JSON body over a real socket                                     |
| The process runs      | Subprocess test: still alive and delivering after N readings                             |

182 tests. Two of them exist because a bug got past every other test:

- **The subprocess test.** The scheduler's interval was `unref()`d, so nothing held the
  event loop open — the process logged a healthy startup and exited before sending a
  single reading, while every fake-timer test passed. Only a real process can demonstrate
  the behaviour, and the test is verified to fail when the `unref()` is reintroduced.
- **The in-flight gauge test.** The gauge was predicted as `inFlight + 1` before the send,
  so it reported a peak one above the configured ceiling — a number the transport never
  reached, in the output a measurement harness reads.

## 11. Implementation status

**Complete and runnable.** Verified against a live HTTP receiver, not only by tests:

| Profile            | Result                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 10 robots @ 2 Hz   | 20.0 readings/s achieved vs 20 configured; even distribution; clean `SIGTERM` drain                                                       |
| 500 robots @ 5 Hz  | **2,499 readings/s vs 2,500 configured**; 39,710 requests; all 500 robots; `peakInFlight` exactly at the ceiling; no retries, no failures |
| `--drop` (3 of 50) | exactly those three silent; other 47 at full rate; process healthy                                                                        |
| Root `pnpm dev`    | starts the simulator alongside `web`, non-interactively                                                                                   |

**Blocked, not skipped:**

- **Adapter contract tests** — no vendor schemas exist in `@fleet/adapters`. The dialect
  tests assert exact wire shape instead, which is the half checkable from this side.
  Copying schemas in would create the second definition Principle 1 forbids.
- **Server integration and the freshness E2E** — `POST /api/telemetry/:vendor` does not
  exist. The fast integration test against an in-process receiver is done; there is no
  sweep to observe.
- **Load measurement of the server** — the numbers above describe _the simulator_,
  measured against a trivial receiver. Server ingest throughput and ingest-to-fan-out
  latency must come from the complete harness (Principle 12), which is why the root
  README's measurement table is still `[FILL]`.

## 12. Change rules

- A new vendor generator lands here **only after** its adapter module and fixtures are
  designed in `@fleet/adapters`. It must not require a canonical-model change.
- A dialect change updates this generator, the adapter schema, its fixtures and its
  exact-output test in the same commit, commented on both sides.
- A new fault mode defines its scope, activation, recovery, interaction with load mode and
  observable server outcome **before** implementation. Malformed-payload modes are
  explicit and opt-in; normal and load modes emit schema-valid data.
- Ingest shape or batching changes follow ADR 2 and are coordinated with `@fleet/server`.
- **The day this package imports any workspace package, its `dev` and `start` scripts move
  to `tsx` in the same change** (ADR 9 § Implications).
