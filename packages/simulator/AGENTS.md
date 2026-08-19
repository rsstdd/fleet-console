# AGENTS.md

This package is a thin multi-vendor telemetry producer used to exercise the fleet console's ingest boundary, normalization, freshness behavior, and documented load profile.

The repository-level [`AGENTS.md`](../../AGENTS.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs remain binding. This file adds simulator-specific instructions; it does not replace them.

## Package responsibilities

- Generate raw telemetry in the deliberately different Vendor A, B, and C wire dialects.
- POST one telemetry reading per HTTP request to the configured server ingest endpoint.
- Run the normal demonstration workload at roughly 50 robots and 1 Hz.
- Support the documented load workload with `--robots 500 --hz 5`.
- Support deterministic fault injection, especially `--drop`, so selected robots stop emitting while the simulator and server connection remain healthy.
- Make workload and failure behavior reproducible enough for adapter contracts, end-to-end tests, demos, and performance measurements.

This package does not normalize telemetry, define canonical contracts, derive freshness, store fleet state, fan out WebSocket data, or implement UI behavior. Those belong to `packages/adapters`, `packages/contracts`, `packages/server`, and `packages/web`.

## Dependency and ownership boundaries

- Emit vendor wire payloads directly. Do not call adapters to generate source data and do not create canonical envelopes before sending.
- `@fleet/adapters` is a **dev dependency, permitted in test files only** (ADR 16). Production code here must not import it: this package must stay able to emit a payload the adapters reject. The one intended use is `src/fleet/vendorId.test.ts`, which asserts `VENDOR_IDS` and `SUPPORTED_VENDORS` agree. Lint enforces the ban and `src/__enforcement__/` proves the rule still fires.
- Do not import server internals or write directly to server state. The HTTP ingest endpoint is the package boundary.
- Do not import from `packages/web` or reproduce UI/display rules.
- Reuse shared configuration or explicitly public contract types only when doing so does not erase the independence of the vendor wire dialects.
- Keep simulation scheduling, robot evolution, fault policy, and HTTP transport separable so each can be tested without running the full stack.
- Keep this package thin. It exists to feed and falsify the real boundaries, not to become a second domain implementation.

## Vendor dialects

- Keep vendor names generic (`A`, `B`, and `C`); never imitate or name a real integration partner.
- Preserve the documented disagreements because they are load-bearing evidence for adapter normalization:
  - Vendor A uses a nested payload, battery as a `0–1` fraction, position in metres, ISO 8601 timestamps, and string status values (`idle`, `busy`, `charging`, `fault`).
  - Vendor B uses a flat payload, integer battery percentage, position in centimetres, epoch-millisecond timestamps, numeric status codes, and no source sequence.
  - Vendor C is broadly A-shaped, declares data that maps to `waterLevel`, omits data for `lidarHealth`, and sends an intentional undocumented field.
- Each vendor carries a distinct capability-source profile, so robot detail's capability grid differs across all three rather than only two:
  - Vendor A provides `dock` and lidar-health source data.
  - Vendor B provides `dock` source data only, and no lidar health.
  - Vendor C provides `dock` and `waterLevel` source data, and no lidar health.
- `dock` is therefore universal, `lidarHealth` is vendor A only, and `waterLevel` is vendor C only. Do not give vendor B lidar-health source data: `sequence` is excluded from capability panels (page spec 03 § 6), so a vendor B carrying lidar health would render a Capabilities section identical to vendor A's. Settled in ADR 1 § Observed consequences, 19 August 2026.
- Do not add canonical capability declarations to raw vendor payloads. The adapter decides which canonical capabilities the source data supports.
- Do not add a sequence to Vendor B. Its adapter synthesizes weaker ordering from timestamps, and same-millisecond duplicates remain a documented limitation.
- Keep the intentional Vendor C unknown field present in representative simulation/fixture data so the per-adapter unknown-field counter is exercised.
- When a vendor dialect changes, update its adapter fixtures and exact-output contract tests in the same focused change, documenting the coupling on both sides (Principle 14).

## Robot and telemetry generation

- Generate stable robot identity, site, vendor, and model assignments for a given configuration and seed.
- Use an injectable clock and seeded randomness. Tests and documented demo runs must not depend on ambient wall-clock timing or unseeded random choices.
- Keep timestamps monotonic per robot under normal operation while preserving each vendor's wire representation.
- Keep values within each vendor schema's valid ranges unless a named fault mode explicitly tests malformed input.
- Model enough motion, battery, status, health, and capability data to exercise existing read paths; do not invent canonical fields or unsupported product features.
- Separate observed robot values from simulator control state such as dropped identifiers, rate, seed, and lifecycle.
- A fault mode must alter only the behavior it names. For example, `--drop` suppresses emission for selected robots; it must not stop the process, server, or unaffected robots.

## CLI and configuration

- Validate CLI arguments and environment/configuration at startup. Reject invalid robot counts, rates, vendor mixes, identifiers, seeds, and endpoints with actionable errors.
- Preserve one-command repository startup through `pnpm dev` and avoid interactive prompts.
- Keep normal defaults aligned with the documented 50-robot, approximately 1 Hz demo.
- Support `--robots` and `--hz` independently, with `--robots 500 --hz 5` as the required load profile.
- Parse `--drop` as an explicit set of robot identifiers. Unknown identifiers should produce a clear diagnostic rather than silently doing nothing.
- Keep endpoint and workload variation in typed, validated configuration or CLI options; do not scatter environment-specific literals through generators.
- If batch ingest is adopted through an ADR 2 amendment, add a corresponding explicit batch-emission mode without removing the one-reading-per-request mode silently.

## Scheduling and transport

- Emit approximately at the configured per-robot rate without serially sleeping once per robot.
- Bound concurrency and handle backpressure so load mode measures the server rather than exhausting simulator resources or creating an unbounded promise queue.
- Define HTTP timeout, retry, and shutdown behavior. Retries must be bounded and must not silently transform one simulated reading into an uncontrolled duplicate storm.
- Make transport failures observable with stable counters or structured logs, while avoiding one log line per successful reading in load mode.
- Shut down timers and in-flight work cleanly on normal process termination.
- Do not derive or send canonical freshness. Silence is represented by sending nothing; `packages/server` detects it through its independent freshness sweep.

## Fault injection

- Treat fault controls as simulator/requested behavior, not observed robot telemetry. Do not insert synthetic canonical freshness or connection states into vendor payloads.
- `--drop` must be deterministic, target only the selected robots, and allow emission to resume predictably when the simulator is restarted without the flag or when a supported runtime control removes the target.
- Keep the process and unaffected robot streams healthy during a drop test so the UI can distinguish “robot went silent” from “console stream went down” (ADR 3).
- For any new fault mode, define its scope, activation, recovery, interaction with rate/load mode, and observable server outcome before implementation.
- Malformed-payload modes must be explicit and opt-in; ordinary demo and load modes emit schema-valid vendor data.

## Performance and observability

- The required measurement points are 50 robots at 1 Hz and 500 robots at 5 Hz (approximately 2,500 requests per second before any future batching).
- Report configured robots, rate, vendor mix, seed, active faults, attempted sends, successful sends, rejected sends, transport failures, and achieved emission rate with stable names.
- Ensure measurement output can distinguish simulator underproduction from server ingest degradation.
- Avoid expensive per-event formatting, retained unbounded histories, and verbose success logging in load mode.
- Do not claim the server's throughput or latency from configured send rate alone; use observed measurements from the complete ingest/fan-out harness (Principle 12).

## Tests

- Prefer test-driven changes: add or update the focused test before implementation (Principle 10).
- Test each vendor generator against its vendor-specific runtime schema or adapter contract fixture expectations without normalizing inside the simulator.
- Assert the deliberate dialect differences explicitly: nesting/flatness, units, timestamp format, status representation, sequence presence, capability-source fields, and Vendor C's undocumented field.
- Use fake timers, an injected clock, and fixed seeds to test scheduling and robot evolution deterministically.
- Test CLI defaults, valid load flags, invalid values, vendor allocation, drop targeting, and actionable startup failures.
- Test that dropped robots emit nothing while unaffected robots continue at the configured rate.
- Test bounded concurrency, HTTP failures/timeouts, retry limits, and clean shutdown without wall-clock sleeps.
- Keep at least one end-to-end test from simulator emission through server ingest to a visible freshness transition, because the documented `--drop` behavior is user-facing proof of ADR 3.

## Change rules

- A new vendor requires a vendor generator here only after its adapter module and fixtures are designed under `packages/adapters`. It must not require a vendor-specific canonical-model change.
- A new vendor field belongs to the raw dialect here and its adapter mapping there. A genuinely new canonical capability starts in `packages/contracts`.
- Changes to HTTP ingest shape or batching must follow ADR 2 and be coordinated with `packages/server`.
- Document non-trivial coupling on both sides of a cross-package change with comments naming the related module (Principle 14).
- Add a one-sentence doc comment to every exported class, function, and type (Principle 14).
- Keep diffs focused; do not expand the simulator into provisioning, commands, persistence, or a UI.
- If a request conflicts with `PRINCIPLES.md` or an ADR, stop and surface the conflict rather than working around it.

## Verification

Run the narrow simulator tests first, then this package's typecheck and lint commands. For dialect changes, run affected adapter contract tests. For transport, scheduling, fault, or load changes, start the documented stack and verify normal emission, targeted `--drop`, recovery, and the 50@1 Hz and 500@5 Hz profiles as appropriate. Finish with the repository test command. If package scripts do not yet exist, use the nearest commands documented in the root `README.md` or workspace configuration; do not invent undocumented local setup.

## Task routing

Read one matching row, then its narrow follow-up; do not load adapters or server internals
for simulator-only work.

| Task                                               | Start here                            | Then narrow to                                                    |
| -------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Executable flow or package status                  | `packages/simulator/src/index.ts`     | `src/app.ts`; `docs/03_package-specs/03_SIMULATOR.md`             |
| CLI flags or validated simulator configuration     | `src/cli/parseArgs.ts`                | `src/config/simulatorConfig.ts` and their tests                   |
| Fleet composition, robot state, or evolution       | `src/fleet/createFleet.ts`            | `simulatedRobot.ts` or `evolveRobot.test.ts`                      |
| Vendor wire payload shape                          | `src/vendors/<vendor>.ts`             | `buildPayload.ts`, `readRobotId.ts`, and `vendors.test.ts`        |
| Silence/drop or other injected fault               | `src/faults/faultPolicy.ts`           | Scheduler behavior and focused tests; ADR 3 for freshness meaning |
| Emission rate, timing, or deterministic randomness | `src/scheduling/emissionScheduler.ts` | `src/runtime/{clock,random}.ts`                                   |
| HTTP ingest delivery                               | `src/transport/ingestClient.ts`       | `src/integration/ingest.integration.test.ts`; ADR 2               |
| Fixture recording                                  | `src/recording/record.ts`             | `fixtureSet.ts`; D4 mapping in `docs/decisions.json`              |
| Logs or simulator metrics                          | `src/observability/` matching module  | Colocated test                                                    |
| Cross-package dependency enforcement               | `eslint.config.js`                    | `src/__enforcement__/enforcement.test.ts`; D7 mapping             |
