# `@fleet/simulator`

Deterministic multi-vendor telemetry producer. It emits raw Vendor A, B and C wire
payloads over HTTP so the adapter boundary, the freshness sweep, the console demo and
the load profile all have something real to run against.

## What it is not

It does not normalize telemetry, define canonical contracts, derive freshness, store
fleet state, fan out WebSocket data, or know anything about the console. Those belong
to `packages/adapters`, `packages/contracts`, `packages/server` and `packages/web`.

The single most important non-responsibility: **the simulator never computes or sends
freshness.** A robot that has gone quiet is represented by sending nothing. The server
derives LIVE / STALE / UNREACHABLE from the arrivals it does and does not receive
(ADR 3). A synthetic `"unreachable"` in a payload would hand the server a conclusion it
is supposed to reach on its own.

## Commands

```bash
pnpm --filter @fleet/simulator dev        # run, restarting on change
pnpm --filter @fleet/simulator start      # run once
pnpm --filter @fleet/simulator test       # unit + integration
pnpm --filter @fleet/simulator lint       # eslint + typecheck
pnpm --filter @fleet/simulator build      # typecheck only; Node runs the TS directly
```

There is no build artefact. Node 24 executes the TypeScript source by type stripping,
which is why `tsconfig.base.json` sets `erasableSyntaxOnly` and why every relative
import here carries an explicit `.ts` extension.

## Profiles

```bash
# Normal — the demo workload: 50 robots, 1 Hz each
pnpm --filter @fleet/simulator dev

# Load — the documented measurement point: 500 robots, 5 Hz each (~2,500 req/s)
pnpm --filter @fleet/simulator start -- --robots 500 --hz 5

# Silence — three robots stop reporting; everything else stays healthy
pnpm --filter @fleet/simulator start -- --drop R-007,R-023,R-041
```

## Options

| Flag                  | Meaning                                  | Default                 |
| --------------------- | ---------------------------------------- | ----------------------- |
| `--robots <n>`        | Robots to simulate, 1–5000               | `50`                    |
| `--hz <n>`            | Emission rate **per robot**, 0 < n ≤ 50  | `1`                     |
| `--seed <n>`          | Seed for fleet layout and evolution      | `1`                     |
| `--drop <ids>`        | Robot ids that emit nothing at all       | none                    |
| `--endpoint <url>`    | Server ingest origin                     | `http://127.0.0.1:8080` |
| `--timeout <ms>`      | Per-request timeout                      | `2000`                  |
| `--max-in-flight <n>` | Concurrent request ceiling               | `64`                    |
| `--retries <n>`       | Bounded retries, retryable outcomes only | `0`                     |
| `--summary <ms>`      | Interval between structured summaries    | `5000`                  |
| `--print-manifest`    | Print the fleet roster as JSON and exit  | —                       |
| `--help`              | Print usage and exit                     | —                       |

`FLEET_INGEST_URL` and `FLEET_SIM_SEED` set the endpoint and seed from the
environment. Precedence is defaults → environment → flags, so a flag in a `dev` script
is never silently overridden by a stale shell export. Every value is validated at
startup; an invalid one names the option and its accepted range and exits `2` without
starting a timer or opening a connection.

`--hz` is **per robot**. The total request rate is `robots × hz`.

## Vendor dialects

The three dialects disagree on purpose. Each disagreement is the evidence a specific
adapter contract test consumes (ADR 1), so none of them is a rough edge to smooth.

|                        | Vendor A        | Vendor B            | Vendor C                         |
| ---------------------- | --------------- | ------------------- | -------------------------------- |
| Shape                  | nested          | **flat**            | nested                           |
| Identity key           | `robot_id`      | **`id`**            | `robot_id`                       |
| Battery                | fraction `0..1` | **integer percent** | fraction `0..1`                  |
| Position               | metres          | **centimetres**     | metres                           |
| Timestamp              | ISO 8601        | **epoch ms**        | ISO 8601                         |
| Status                 | strings         | **numeric codes**   | strings                          |
| Sequence               | yes             | **absent entirely** | yes                              |
| Capability source data | `dock`, lidar   | **`dock` only**     | `dock`, **water**, no lidar      |
| Undocumented field     | —               | —                   | **`telemetry.firmware_channel`** |

Each vendor therefore has a distinct capability profile — `dock` universal,
`lidarHealth` vendor A only, `waterLevel` vendor C only, `sequence` A and C — so robot
detail's capability grid differs across all three rather than only two. `sequence` is
excluded from that grid (page spec 03 § 6), which is why vendor B carrying lidar health
would have made its Capabilities section identical to vendor A's. Settled in ADR 1
§ Observed consequences, 19 August 2026.

Three absences carry weight:

- **Vendor B has no sequence field.** Its adapter synthesizes weaker ordering from the
  timestamp, which cannot separate a duplicate from two events in the same
  millisecond. Adding any simulator-only uniqueness would hide exactly the limitation
  vendor B exists to demonstrate.
- **Vendor C omits lidar health completely** — not `null`, not `{}`, not a disabled
  placeholder. The key is absent, so no `lidarHealth` capability is declared and the
  console renders no lidar panel.
- **Vendor B carries no lidar source data either**, so its adapter declares `dock` and
  nothing else. This is the difference that makes vendor B's capability panel section
  distinct from vendor A's rather than identical to it.

Vendor C's undocumented field is nested rather than top-level, so the adapter's
unknown-field walk has to produce the dotted path `telemetry.firmware_channel` and
cannot pass by comparing top-level keys alone.

## Determinism

The same `--seed` and `--robots` always produce the same fleet, the same initial state
and the same evolution. Each robot draws from its own stream derived from the run seed
and its identifier, so adding a robot does not perturb the history of the robots
already there. Nothing in generation reads the wall clock or `Math.random()`; lint
enforces that outside `src/runtime`.

## Fault semantics

`--drop` is targeted absence. Selected robots produce no reading and send no request.
Everything else — the process, the ingest connection, every other robot — stays
healthy, which is what lets the console distinguish "this robot went quiet" from "the
console's stream went down" (ADR 3).

A dropped robot's state is **frozen**: its sequence and battery do not advance while it
is silent, so restarting without the flag resumes from where it stopped rather than
jumping forward. Removal is by restart; there is no runtime control.

An unknown id in `--drop` fails at startup naming the id and the fleet's range. A
mistyped `--drop R-2O4` that silently dropped nothing would surface much later as "the
freshness demo does not work".

## Transport

One JSON `POST` per reading to `{endpoint}/api/telemetry/{vendor}` with
`content-type: application/json` (ADR 2).

Vendor identity travels in the route. ADR 8 ratifies this as D9 **Option 1 — the path
segment** and closes server question **M7**: the segment is validated against the adapter
registry before any body decoding, so adapter selection never depends on unvalidated
payload contents. Changing this contract requires `ingestUrlFor`, the server route,
`selectIngestVendor`, and their tests to change together.

Concurrency is capped by `--max-in-flight`. At the ceiling a reading is _shed_ — refused
outright and counted — rather than queued. An unbounded queue would turn a slow server
into a simulator memory fault and destroy the measurement.

Retries default to **0**. A telemetry reading is superseded within a second, so
re-sending a failed one delivers a value the server is about to overwrite while adding
load exactly when the server is already struggling. `--retries` raises the bound for
tests that need the path. Only 5xx, timeouts and network failures are retried; a 4xx is
never retried, because a malformed payload will be malformed again.

## Observability

One JSON object per line, plus a periodic summary. There is deliberately **no
per-reading success log**: at 500 robots and 5 Hz that is 2,500 lines a second and the
formatting alone would make the simulator the bottleneck it is meant to measure.

The counters that earn their keep are `readingsAttempted`, `requestsSent`, `retriesSent`
and `sendSucceeded`. If they diverge, the simulator is underproducing, retrying, or
being rejected — and a measurement reporting only one of them could not tell those
apart. `skippedOverdue` (a robot's previous send was still outstanding) and
`coalescedOverdue` (the process itself woke late) are separate for the same reason:
they point at different layers.

Rates are computed from a monotonic clock, never from the configured rate, because the
whole purpose of the number is to show when configured and achieved disagree.

## Load-mode cautions

Expect a burst of `skippedOverdue` in the first seconds of a load run as in-flight
reaches the ceiling, then a flat count. A count that keeps climbing means the server is
not keeping up.

**Numbers from this package describe the simulator, not the server.** Server ingest
throughput and ingest-to-fan-out latency must come from the complete harness once
`packages/server` exists; they cannot be inferred from a configured send rate
(Principle 12).

## Graceful shutdown

`SIGINT` or `SIGTERM` stops scheduling, drains in-flight requests up to the shutdown
deadline, aborts whatever is still outstanding, and emits a final summary. Repeated
signals are idempotent — the second one does not start a second drain.

## Fleet roster handoff

`--print-manifest` prints the roster as JSON and exits without starting a timer or
opening a connection. The server seeds its current-state map from this so a robot that
has never reported reads UNKNOWN rather than being absent (ADR 3, server TODO § E1).
Roster ownership is an explicit handoff rather than something the server infers from
whichever robot happens to report first.

The printed document is exactly what the server's `fleetManifestSchema` accepts —
a `robots` array of `{ robotId, siteId, vendorId, model }`, no wrapper. The server's
spelling is canonical (ADR 14). The seed that produced the roster goes to **stderr**,
so the redirect below writes a file the server boots on while the operator still sees
the provenance:

```bash
pnpm --filter @fleet/simulator start -- --print-manifest > config/fleet-manifest.json
```

Defaults are `--robots 50 --seed 1`, which are the recorded inputs behind the
committed `config/fleet-manifest.json`; a bare `--print-manifest` reproduces that file
byte for byte. `src/fleet/manifestParity.test.ts` asserts it, and
`packages/server/src/config/fleetManifest.test.ts` asserts the committed file parses,
so the handoff is checked from both ends in CI rather than promised here (ADR 14).
Re-record with the command above whenever a change to the defaults or the generator is
intended to change the shipped roster.
