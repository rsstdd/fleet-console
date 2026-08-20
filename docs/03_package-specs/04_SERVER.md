# 04 — `@fleet/server`

- **Status:** partially implemented — framework-independent pieces only; no listener yet
- **Package:** `packages/server`
- **Governing documents:** ADR 2 (HTTP ingest, WS fan-out), ADR 3 (freshness is derived
  here), ADR 6 (bounded in-memory history, no database), ADR 8 (Hono + `ws`), ADR 9
  (runtime), ADR 20 (the error body), ADR 21 (validated runtime endpoints), ADR 22
  (validation-cost gate); Principles 1, 2, 4, 5, 7, 11, 12, 13

## 1. Responsibility

`@fleet/server` is the runtime authority. It accepts vendor telemetry over HTTP, stamps
receipt time, dispatches to the correct adapter, holds current fleet state in memory,
sweeps that state for freshness, serves canonical read endpoints, fans out coalesced
deltas over WebSocket, and reports operational health.

It does **not**: define the canonical model (`@fleet/contracts`), decode vendor dialects
(`@fleet/adapters`), produce telemetry (`@fleet/simulator`), or implement UI behaviour
(`web`). It is thin by design — transport in, decoded value out, state transition in a
framework-independent function with its own test.

**It is the sole authority on freshness derivation and on authorization.** Both are
non-negotiable. The UI may hide or disable actions; it never authorizes them (Principle 7).

## 2. Position in the dependency graph

Imports `@fleet/contracts` and `@fleet/adapters`. Imported by nothing.

Reached by `@fleet/simulator` over HTTP only — the ingest endpoint is the package
boundary, and the simulator may not import server internals or write to server state.

## 3. Public API

The runtime composition root does not exist yet. `src/index.ts` currently exports the
framework-independent pieces it will be assembled from, kept separately testable:

**Configuration** — `parseFreshnessPolicy`, `freshnessPolicySchema`,
`ADR3_BASELINE_FRESHNESS_POLICY`, `parseFleetManifest`, `fleetManifestSchema`,
`loadServerConfiguration`, `ConfigValidationError`, `ENDPOINT_ENV_KEYS`,
`ENDPOINT_DEFAULTS`, `parseRuntimeEndpoints`, `loadRuntimeEndpoints`. Types:
`FreshnessPolicy`, `FleetManifest`, `ServerConfiguration`, `RuntimeEndpoints`.

**State** — `CurrentStateStore`, `RingBuffer`, `HISTORY_CAPACITY`. Types:
`CurrentRobotState`, `UnobservedRobotState`, `ManifestRobot`, `UpsertResult`.

**Freshness** — `FreshnessSweep`. Type: `FreshnessSweepOptions`.

**Fan-out** — `PendingDeltaSet<TState>`.

**Health** — `HealthMetrics`. Types: `HealthSnapshot`, `SequenceObservation`.

**Runtime** — `systemClock`, `fixedClock`, `manualClock`. Type: `Clock`.

## 4. Internal structure

```
src/
  runtime/clock.ts          the one place the wall clock is read
  config/                   freshnessPolicy, fleetManifest, serverConfiguration
  state/                    currentStateStore, ringBuffer
  freshness/freshnessSweep  the recurring interval that calls contracts
  fanout/pendingDeltas      coalescing keyed by robot id
  health/healthMetrics      counters at their true scope
  __boundary-violation__/   deliberate lint violations that prove the rules fire
  index.ts
```

Planned and not yet present: the HTTP layer (Hono on `node:http`), the WebSocket server
(`ws` attached to the same listener), the ingest handler, the adapter registry dispatch,
and the composition root.

## 5. Contracts owned and consumed

**Consumed:** the canonical envelope and `deriveFreshness` from `@fleet/contracts`; the
adapter result union, vendor narrowing and unknown-field ledger from `@fleet/adapters`.

**Owned — the HTTP and WebSocket surface** (planned, per ADR 2 and the package TODO):

| Endpoint                      | Purpose                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `POST /api/telemetry/:vendor` | Ingest, one reading per request                                                                     |
| `GET /api/fleet`              | Canonical read model for every registered robot. No raw payload                                     |
| `GET /api/robots/:id`         | The same canonical robot **plus** the retained raw payload                                          |
| `GET /api/health`             | Malformed-ingest, unsupported-vendor, per-adapter unknown fields, sequence health, late sweep ticks |
| WebSocket                     | Coalesced deltas — changed robots only — flushed at up to 10 Hz                                     |

Vendor identity travels in the **route**, validated against the adapter registry's key set
before any body decoding. ADR 8's D9 amendment ratifies this as **Option 1 — the path
segment** and closes **M7**; `@fleet/simulator` already ships against it. Changing the
route requires a coordinated server-and-simulator change in one commit. The body is
untrusted and the vendor determines which schema decodes it, which is circular — a
validated path segment breaks the circle.

**The raw payload is retained for technician diagnosis only.** It is excluded from the
fleet read model, from history and from every delta; it is served only as a separate field
on the single-robot endpoint (ADR 1). This is asserted by test rather than trusted to
shape.

## 6. Governing decisions

- **ADR 2** — HTTP POST ingest one reading per request; WebSocket delta fan-out, not full
  snapshots, because the client store already applies deltas keyed by robot id. The
  identified ceiling is the ingest path — per-request HTTP overhead or CPU-bound
  validation — named explicitly with a staged mitigation path recorded rather than
  implemented: batch ingest first, then `node:cluster` forking or worker-pooled
  validation, then Rust with Axum and Tokio.
- **ADR 3** — freshness is derived **here and only here**, by a recurring sweep over
  `receivedAt` that calls the pure function in `@fleet/contracts`. It travels as a field
  on the envelope. A freshness-only transition must be treated as a changed robot by the
  coalescing logic, even when no telemetry field changed — a direct dependency from ADR 3
  onto ADR 2's implementation.
- **ADR 6** — bounded in-memory history, no database. History stores canonical envelopes,
  not raw payloads, which is part of why it stays small.
- **ADR 8** — Hono via `@hono/node-server` for HTTP, `ws` for WebSocket, attached to the
  same Node HTTP server.
- **ADR 9** — runs through `tsx`, which is what makes ADR 8's listener runnable. Plain
  `node` fails on this package's `@fleet/contracts` import with `ERR_MODULE_NOT_FOUND`.
- **ADR 21** — resolves D13 as Option 2: host, port and allowed origins come from
  environment variables validated once at startup, while Vite proxies the console's
  same-origin `/api` and `/ws` paths to the same host and port in development.

## 7. Enforcement

| Rule                                     | Mechanism | Where                                                                 |
| ---------------------------------------- | --------- | --------------------------------------------------------------------- |
| No database or persistence import        | Static    | `no-restricted-imports`; fixture `__boundary-violation__/database.ts` |
| Wall clock only via `runtime/clock.ts`   | Static    | `no-restricted-globals`; fixture `wallClock.ts`                       |
| No import of web or simulator            | Static    | `no-restricted-imports`                                               |
| Payload is `unknown` until decoded       | Static    | no-unsafe-assertion rules                                             |
| `process.env` only in configuration      | Static    | `no-restricted-properties`; `src/config/**` override                  |
| **The rules above still fire**           | Test      | `__boundary-violation__/enforcement.test.ts`                          |
| Raw payload absent from fleet and deltas | Test      | asserted, not assumed                                                 |

The clock rule is the one worth restating. Everything that needs the time takes a `Clock`
rather than reading one, which is what makes freshness transitions, late-tick detection,
coalescing and shutdown testable with an injected clock instead of a wall-clock sleep.
`runtime/clock.ts` is named in `eslint.config.js` as the single place the ban is lifted;
move the file and the exception moves with it.

**Known gap.** `@fleet/adapters` and `web` each pair their violation fixtures with a
`legal.ts` control that violates nothing; this package has none. Its assertions are
`toHaveLength(1)` on a named message rather than a bare non-empty check, so the silent-rule
failure mode ADR 7 was written about _is_ caught here — a rule reporting nothing fails on
length. What is not covered is the opposite failure: a rule that over-fires and also
reports on legal code. Adding a control file would close it, and would make the three
packages' enforcement suites consistent.

## 8. State, lifecycle and configuration

**Current-state store.** One entry per **registered** robot, seeded from the fleet
manifest at startup — so a robot that has never reported reads `unknown` rather than being
absent (ADR 3). `CurrentRobotState` is a union of `UnobservedRobotState` (a registered
robot with no telemetry instant to null out) and `CanonicalEnvelope`. Modelling the
unobserved case as its own type rather than an envelope with nulled provenance is what
prevents a nullable-provenance field from existing at all.

**History** is a `RingBuffer` per robot, capacity 60. Bounded by construction: there is no
path by which a long-running process grows history without limit (ADR 6).

**Upsert is idempotent.** Duplicate or out-of-order input must not roll observed state
backward or append misleading history. The comparison is against the current stored
sequence for that robot only — there is no sequence log, per ADR 6.

**Sequence health is three-valued**: `gap`, `duplicate`, `not-evaluated`. The third exists
because Vendor B has no sequence and its adapter synthesizes ordering from timestamps,
which cannot distinguish a duplicate from two events in the same millisecond. Showing
"0 gaps" for such a robot is a false statement to an operator, so "not evaluated" is
represented distinctly from zero — in the health payload and in the robot-detail
diagnostics field alike (ADR 1 § Implications).

**Freshness sweep.** Its own recurring interval, independent of ingest. Reads `receivedAt`,
calls `deriveFreshness`, writes the result through `withFreshness`, and marks the robot
into the pending delta set. It reports its own lateness via `onLateTick`, so a sweep that
is not keeping up is visible on the health endpoint rather than silently degrading every
robot's freshness.

**Delta coalescing.** `PendingDeltaSet` is keyed by robot id, so N updates to one robot
between flushes send one message. Flushed at up to 10 Hz.

**Configuration has two sources with different lifetimes.** `config/freshness.json` and
`config/fleet-manifest.json` are reviewed deployment policy, strictly validated at
startup. `FLEET_SERVER_HOST`, `FLEET_SERVER_PORT` and `FLEET_ALLOWED_ORIGINS` are
per-machine runtime values decoded by `loadRuntimeEndpoints()`, the package's only
`process.env` read. Invalid present values stop startup with every offending key named;
absent values use the fail-closed defaults `127.0.0.1`, `8080` and no allowed origins.

The D13 implication is that the future composition root must load these values before
starting background work and must not catch `ConfigValidationError` and continue.
`FLEET_ALLOWED_ORIGINS` is currently validated but unenforced until ADR 8's CORS
middleware exists. The decision's falsifier is a production deployment that serves the
console from a different origin than the API: that deployment turns CORS from a non-issue
into a required, tested path rather than an assumption inherited from the dev proxy.

**Receipt time** is stamped from the injected clock at the ingest boundary, before
dispatch, and passed explicitly into the adapter. It is never substituted with the
vendor's `reportedAt`: the sweep reads `receivedAt`, the operator-facing "last seen" shows
`reportedAt`, and ADR 3 calls their independence a stated invariant of the system.

## 9. Failure behaviour

- **Malformed payload** → rejected and counted, never coerced. The body is the contract's
  `errorEnvelopeSchema` — a `kind`, a fixed summary and the adapter's own `ContractIssue[]`
  copied rather than re-derived — built only by `src/ingest/errorResponse.ts` (ADR 20). It
  carries no vendor payload contents, because an issue holds no rejected value. Status is
  the coarse distinction (400 for any bad payload, 404 for an unintegrated vendor) and
  `kind` is the fine one.
- **Unknown vendor** → a defined rejection with its own metric. Never a guess, never a
  fallback adapter. Distinct from a malformed identifier, because the two mean different
  things: an integration gap versus a data-quality problem.
- **Unknown fields on an accepted payload** → noted to the process-wide ledger, per
  adapter, never per robot.
- **Slow WebSocket client** → drop with a health counter, not an unbounded buffer. An
  unbounded buffer turns one slow console into a server-wide memory fault, and ADR 2's
  single-digit client assumption makes a dropped client cheap to reconnect.
- **Late sweep tick** → counted and surfaced, with the last lateness in milliseconds.
- **Invalid configuration at startup** → process stops with the offending field named. No
  partial background work is started.

Every counter is reported at its true scope: unknown fields per adapter, sequence health
per robot, malformed ingest and unsupported vendors process-wide.

## 10. Verification matrix

| Concern                | Check                                                               |
| ---------------------- | ------------------------------------------------------------------- |
| Freshness derivation   | Sweep transitions live → stale → unreachable against a manual clock |
| Freshness invariant    | A freshness-only change alters no observed field                    |
| Freshness propagation  | A freshness-only transition arrives at a client as a delta          |
| Never-seen robots      | Manifest-seeded robot reads `unknown`, is present, not absent       |
| Idempotent upsert      | Duplicate and out-of-order input roll nothing backward              |
| Sequence not-evaluated | Vendor B robots report `not-evaluated`, never `0`                   |
| History bound          | Ring buffer never exceeds capacity under sustained ingest           |
| Coalescing             | N updates to one robot between flushes send one message             |
| Raw payload exclusion  | Absent from `/api/fleet`, from history and from every delta         |
| Config validation      | An invalid file stops startup naming the field                      |
| Runtime endpoints      | Invalid env values fail together; absent values use safe defaults   |
| Enforcement            | Every lint rule fires on its fixture                                |

98 tests. The store, sweep, ring buffer, delta set, health metrics, clock and all three
configuration loaders are covered.

## 11. Implementation status

**Framework-independent pieces only.** Built and tested: configuration loading and
validation, the current-state store with manifest seeding, the bounded ring buffer, the
freshness sweep, the pending-delta set, health metrics, and the clock.

**Not built:** the HTTP listener and route wrappers, adapter-registry ingest composition,
health-response composition, the WebSocket server, and the runtime composition root.

Ingest composition is intentionally deferred: ADR 10 has not resolved runtime
re-validation of adapter output, and ADR 11 has not decided how a server ingest test may
access valid recorded vendor input without copying a fixture.

Health composition is intentionally deferred: ADR 30 has not selected whether
`healthResponseSchema.byAdapter` is keyed by `SupportedVendor` (`A`) or software
`adapterId` (`vendor-a`). A handler must not decide that open question locally.

This is the remaining gap on the critical path. Consequences today:

- `@fleet/simulator` posts into a socket nothing is listening on, so its integration tests
  use their own in-process receiver;
- the freshness end-to-end demonstration — the load-bearing proof of ADR 3 — cannot run;
- the README's measurement table cannot be filled, because server throughput must be
  measured through the complete harness rather than inferred (Principle 12).

**Decision consequences.** Ingest completes `AdapterEnvelope` only through
`withFreshness` ([ADR 10](../00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md)); health keeps
`unknownFields.accepted` separate from malformed ingest ([ADR 15](../00_adr/15_UNKNOWN_FIELD_ACCOUNTING_ON_ACCEPTED_PAYLOADS.md));
the committed roster is the package-neutral parity join ([ADR 14](../00_adr/14_SHARED_FLEET_ROSTER_PARITY.md));
and validation is gated only at ADR 2's 400 µs falsifier while the missing transport
harness remains reportable work ([ADR 22](../00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md)).

Two design questions remain open in the package TODO: **M4** (ring-buffer capacity, to be
picked from the sparkline's real decimated point count rather than a round number) and
**M6** (slow-client backpressure, recommendation: drop with a counter). **M5** (initial
WebSocket state) leans toward the HTTP read, so cold start and reconnect are one path.

## 12. Change rules

- The ingest shape and any move to batching follow ADR 2 and are coordinated with
  `@fleet/simulator` in the same change. Batch ingest requires a distinct mode; the
  one-reading-per-request mode is not removed silently.
- Freshness derivation stays here. A second derivation anywhere — including in
  `packages/web` — is a second authority that can disagree with the first (ADR 3).
- Adding a route that exposes the raw payload outside `GET /api/robots/:id` requires an
  ADR 1 amendment.
- No persistence, no broker, no second language without its own ADR.
- A handler that grows domain logic is a second authority; the state transition belongs in
  a framework-independent function with its own test (Principle 1).
