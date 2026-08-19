# AGENTS.md

This package is the thin runtime authority for telemetry ingest, adapter dispatch, in-memory fleet state, freshness sweeping, HTTP read endpoints, WebSocket delta fan-out, and operational health.

The repository-level [`AGENTS.md`](../../AGENTS.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs remain binding. This file adds server-specific instructions; it does not replace them.

## Package responsibilities

- Accept vendor telemetry over HTTP POST, establish the server receipt time, dispatch to the correct adapter, and reject malformed payloads without coercion.
- Store current canonical robot state in memory with idempotent per-robot upserts.
- Keep a small bounded in-memory history per robot for the detail-view sparkline.
- Run the server-owned freshness sweep over registered robots using the pure state function from `packages/contracts`.
- Serve fleet and single-robot read endpoints, keeping diagnostic raw payloads out of fleet responses.
- Fan out coalesced canonical deltas over WebSocket at up to 10 Hz.
- Expose health signals for malformed ingest, per-adapter unknown fields, stream/ingest behavior, and late freshness ticks.
- Authenticate and authorize every protected operation if command endpoints are introduced. The UI is never an authority (Principle 7).

This package does not define vendor mappings, canonical domain contracts, simulator behavior, or UI derivations. Those belong to `packages/adapters`, `packages/contracts`, `packages/simulator`, and `packages/web`.

## Dependency and ownership boundaries

- Import canonical types, schemas, wire transforms, and the pure freshness function from `packages/contracts`; do not duplicate their rules.
- Dispatch raw vendor payloads to `packages/adapters`; do not add vendor-specific parsing or status/unit mappings in server handlers.
- Keep transport handlers thin. Put state transitions and store behavior in framework-independent functions or classes with focused tests.
- Never import from `packages/web` or reproduce client presentation logic.
- Read endpoints expose canonical read models. They never expose an adapter's internal types.
- Keep observed telemetry, derived freshness, requested command state, workflow state, and health metrics separate by authority and lifetime (Principle 11).

## Ingest boundary

- Treat request bodies, route parameters, headers, configuration, and any other external data as `unknown` until runtime validation succeeds (Principle 2).
- Record `receivedAt` from the server clock at the ingest boundary and pass it through explicitly. Never substitute the vendor's `reportedAt`.
- Select adapters through an explicit registry keyed by supported vendor identity. Unknown vendors and malformed payloads produce a defined rejection and metric; they are not guessed or coerced.
- Validate and normalize once at the boundary. Downstream state code operates only on decoded canonical values.
- Preserve the raw payload only for technician diagnosis. Exclude it from the fleet read model, history ring buffers, and WebSocket deltas; expose it only as a separate field on the single-robot endpoint.
- Count unknown vendor fields per adapter, not per robot, and surface the correctly scoped count on the health endpoint.
- Keep the upsert path idempotent. Duplicate or out-of-order input must not roll current observed state backward or append misleading history.
- Sequence-gap and duplicate detection compare against the current stored sequence for that robot. Do not query or retain an unbounded sequence log.
- Preserve the documented limitation of synthesized ordering for vendors without a real sequence; do not present timestamp ordering as equally strong duplicate detection.

## State and history

- Current state is an in-memory map with one entry per registered robot. It is rebuildable after restart and is not persistent.
- Initialize the roster from the validated fleet manifest so a registered robot with no telemetry can exist as `unknown` freshness.
- History is a separate bounded ring buffer per robot, sized to the actual decimated sparkline consumer—tens of points, not hundreds.
- Prefer a fixed-size array with a write cursor if it satisfies the tests and measured workload; record the final sizing decision in ADR 6's observed consequences.
- Store canonical envelope/history data, not raw vendor payloads.
- Do not add SQLite, Redis, a broker, migrations, or another persistence layer without a new or amended ADR. ADR 6 explicitly chooses no database.
- A restart losing current state and recent history is expected behavior for this demonstration; do not imply cross-session continuity in an API response.

## Freshness sweep

- Schedule a recurring sweep independently of message arrival and independently of WebSocket flushes.
- Load `liveThresholdMs`, `staleThresholdMs`, and `sweepIntervalMs` from validated `config/freshness.json`; do not hardcode them in orchestration.
- On every tick, call the pure `packages/contracts` freshness function with each registered robot's `receivedAt`, the injected/read server clock, and the configured policy.
- The configured baseline is a 500 ms sweep, LIVE through 2 seconds, STALE through 10 seconds, UNREACHABLE after 10 seconds, and UNKNOWN before any telemetry.
- Never derive freshness from `reportedAt`. It remains the operator-facing last-seen time.
- A freshness-only transition is a real state change and must enter the pending WebSocket delta set without altering observed telemetry or `reportedAt`.
- Record sweep lateness when the interval between ticks exceeds the configured interval by the stated tolerance, and expose that signal on the health endpoint.
- Make timer lifecycle explicit: tests and shutdown paths must stop intervals and close sockets cleanly.

## HTTP and WebSocket transport

- Keep one-message-per-request HTTP POST ingest unless ADR 2 is amended. Do not introduce MQTT or a broker under the current architecture.
- WebSocket fan-out sends changed robots only, not full snapshots on every flush.
- Coalesce multiple changes for the same robot between flushes and send its latest canonical state once.
- Flush at no more than 10 Hz and keep fan-out scheduling independent from the 500 ms freshness sweep.
- Encode outbound data with the canonical wire schemas, including the capability array representation required for JSON transport.
- Define behavior for initial connection, reconnect, slow or failed clients, malformed internal output, and orderly shutdown. One client must not block fleet ingest or other clients.
- Validate identifiers on single-robot and history endpoints and return explicit not-found responses rather than ambiguous empty success values.
- Do not leak raw payloads, secrets, stack traces, or unbounded diagnostic data through fleet, delta, error, or health responses.
- Build every error body through `src/ingest/errorResponse.ts` and no other way (ADR 20). It returns the contract's `errorEnvelopeSchema` shape — a closed `kind`, a fixed summary, and the adapter's own `ContractIssue[]` copied rather than re-derived — plus the status for that kind. A handler that constructs its own body is a second authority and escapes the no-leak test.

## Security and commands

- The server authenticates and authorizes every protected operation at runtime. Client visibility or disabled controls never grant permission.
- Decode command input at the boundary and keep requested state distinct from observed telemetry. An acknowledgement is not proof of physical state change.
- Define pending, accepted, rejected, timed-out, conflicted, and cancelled transitions for any command workflow before implementation.
- Apply confirmation, audit, correlation identifiers, and authorization proportional to command consequence (Principles 7, 11, and 12).
- The current robot-detail specification has no command buttons. Do not invent command APIs merely to appear production-complete.

## Observability and performance

- Use stable structured event and metric names with correlation identifiers where a request or command crosses stages.
- At minimum, make malformed ingest, unsupported vendors, adapter failures, per-adapter unknown fields, sequence gaps/duplicates where evaluated, WebSocket connection/flush health, and late freshness ticks observable.
- Do not label a sequence-gap count as zero for a robot whose adapter cannot evaluate sequence gaps; represent not-evaluated distinctly.
- Keep health metric scope precise. Per-adapter counters must not be presented as per-robot facts.
- Measure the ingest and fan-out path at the documented 50- and 500-robot workloads. Distinguish HTTP request overhead from schema-validation cost before applying ADR 2's staged mitigation.
- Treat event-loop saturation as a freshness-correctness issue because it delays both fan-out and the freshness sweep.

## Tests

- Prefer test-driven changes: add or update the focused test before implementation (Principle 10).
- Unit-test stores, idempotent upsert, bounded ring-buffer wraparound, sequence handling, delta coalescing, and health counters without opening sockets where practical.
- Use injected clocks and fake timers for receipt timestamps, freshness transitions, late-tick detection, coalescing, and shutdown. Do not rely on wall-clock sleeps.
- Add boundary tests for valid, malformed, missing, additional-field, unsupported-vendor, and unsupported-schema inputs.
- Add integration tests covering HTTP ingest through adapter dispatch to current state, single-robot raw diagnostics, health metrics, initial WebSocket state, and coalesced deltas.
- Prove that freshness-only changes fan out, raw payloads never enter fleet/delta/history responses, and out-of-order data does not regress current state.
- Test authorization and requested-versus-observed reconciliation for any protected command endpoint.
- Keep performance tests reproducible and report degradation rather than asserting only a favorable scale point.

## Change rules

- A new vendor belongs in `packages/adapters`; server changes should normally be limited to registry/configuration wiring.
- A new canonical field or capability starts in `packages/contracts`; do not patch the server read model with vendor-only data.
- Transport, persistence, sweep-ownership, or scaling changes that contradict ADRs 2, 3, or 6 require an ADR amendment before implementation.
- Document non-trivial coupling on both sides of a cross-package change with comments naming the related module (Principle 14).
- Add a one-sentence doc comment to every exported class, function, and type (Principle 14).
- Keep the server thin and diffs focused. Do not build production infrastructure without a demonstrated requirement.
- If a request conflicts with `PRINCIPLES.md` or an ADR, stop and surface the conflict rather than working around it.

## Verification

Run the narrow server tests first, then this package's typecheck and lint commands. For boundary changes, run affected contract and adapter tests; for transport or user-visible state changes, start the stack and verify ingest, HTTP reads, health, and WebSocket behavior through the documented end-to-end flow. Finish with the repository test command. If package scripts do not yet exist, use the nearest commands documented in the root `README.md` or workspace configuration; do not invent undocumented local setup.

## Task routing

Read one matching row, then its narrow follow-up; begin at `src/index.ts` only when the
public surface is relevant.

| Task                                                        | Start here                          | Then narrow to                                                     |
| ----------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Public exports or package status                            | `packages/server/src/index.ts`      | `docs/03_package-specs/04_SERVER.md`                               |
| File policy, fleet roster, or runtime endpoint environment  | `src/config/serverConfiguration.ts` | `freshnessPolicy.ts`, `fleetManifest.ts`, or `runtimeEndpoints.ts` |
| Vendor route selection or ingest rejection                  | `src/ingest/selectVendor.ts`        | `errorResponse.ts` or `requestSizeLimit.ts`; relevant D-id mapping |
| Current robot state or bounded history                      | `src/state/currentStateStore.ts`    | `ringBuffer.ts`; ADR 6 only if changing the boundary               |
| Freshness transitions or sweep timing                       | `src/freshness/freshnessSweep.ts`   | Contracts `deriveFreshness.ts`; ADR 3                              |
| Delta coalescing or flush behavior                          | `src/fanout/pendingDeltas.ts`       | ADR 2 and D10 mapping                                              |
| Operational counters or sequence health                     | `src/health/healthMetrics.ts`       | Contracts health schema; D5/D12 mapping                            |
| Canonical or adapter public types                           | Respective package `src/index.ts`   | One exported schema/type; no deep import                           |
| Dependency, clock, persistence, or unsafe-input enforcement | `eslint.config.js`                  | `src/__boundary-violation__/enforcement.test.ts`                   |
