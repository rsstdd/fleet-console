# TODO — `packages/simulator`

**Authority:** Planning only. This checklist is non-normative; accepted ADRs and the simulator package specification govern conflicts.

**Reconciled:** 19 August 2026. The bootstrap checklist this file used to carry has been
removed: it listed as open the work that is now implemented, tested and running, which
made the document unreadable as a plan. Bootstrap history belongs in Git and in
[`README.md`](./README.md). What remains below is the work that is genuinely not done.

## Status

The package is bootstrapped, runs, and is verified against a live HTTP receiver.
Generation, CLI/configuration, fault injection, bounded scheduling and transport,
metrics, lifecycle, fixture recording and the public boundary are implemented, with
**16 test files and 208 tests**; lint, typecheck and build are clean.

Verified by running, not only by tests:

- Normal mode, 10 robots at 2 Hz: 20.0 readings/s achieved against 20 configured, even
  per-robot distribution, clean `SIGTERM` drain with a final summary.
- Load mode, 500 robots at 5 Hz: **2,499 readings/s achieved against 2,500 configured**,
  39,710 requests delivered, all 500 robots present, `peakInFlight` exactly at the
  configured ceiling, no retries, no failures, no unbounded growth.
- `--drop R-002,R-005,R-009`: exactly those three send nothing; the other seven continue
  at full rate with the process and connection healthy.
- Root `pnpm dev` starts the simulator alongside `packages/web`, non-interactively.
  It does **not** start `packages/server`, which has no `dev` script and no listener.

Two implementation bugs were found by running the executable rather than by the tests,
and both now have regression tests: the scheduler's interval was `unref()`d, so the
process exited before sending anything; and the in-flight gauge was predicted as
`inFlight + 1`, reporting a peak one above the configured ceiling.

## Blocked, not skipped

These need packages that do not exist yet. Nothing here is deferred for convenience.

### S1 — Adapter contract tests (blocked on `packages/adapters`)

Recorded fixtures now exist: `pnpm record:fixtures` writes one representative payload per
vendor into `packages/adapters/src/vendors/*/__fixtures__/`, CI fails on drift
([ADR 13](../../docs/00_adr/13_RECORDED_FIXTURES_WITH_A_CI_DRIFT_GUARD.md)), and
`@fleet/adapters` is a **dev** dependency banned from production code
([ADR 16](../../docs/00_adr/16_TEST_ONLY_ADAPTERS_DEPENDENCY_FOR_VENDOR_PARITY.md)), so
the boundary this work needs is settled. What is missing is the other side: no vendor
schema or adapter exists to validate a generated payload against (adapters TODO B1–B3,
C2–C4).

Until they land, the dialect tests here assert exact wire shape, which is the half that
can be checked from this side. Copying the authoritative Zod schemas into the simulator
would create the second definition Principle 1 forbids.

- [ ] Test generated raw payload → adapter → exact canonical output per vendor, on a
      controlled clock and state, with expected values explicit for battery
      normalization, position units, timestamp normalization, status mapping, sequence
      behaviour, declared capability keys, and Vendor C's unknown-field count.
- [ ] Never call an adapter while generating a payload; adapter use stays verification-only.

### S2 — Server integration and the freshness E2E (blocked on `packages/server`)

`POST /api/telemetry/:vendor` does not exist (server TODO **D1**). The fast integration
test against an in-process receiver is done (`src/integration/ingest.integration.test.ts`);
everything that needs a real receiver is not.

- [ ] Simulator posts Vendor A/B/C readings; the server dispatches the correct adapters;
      current state contains all expected robots; health reports Vendor C unknown fields
      at per-adapter scope; raw payload is absent from fleet and delta responses.
- [ ] The load-bearing freshness E2E: with a WebSocket connected, start with selected ids
      dropped and verify **only** those robots transition `live → stale → unreachable`
      from server deltas, unaffected robots stay `live`, and no client-side timer is
      involved.
- [ ] Recovery: resume emission and confirm server-derived state becomes live without a
      page reload.
- [ ] Keep real-time E2E thresholds CI-tolerant while retaining pure fake-time tests for
      exact boundaries, and keep load harnesses out of the default `pnpm test`.

### S3 — Load measurement through the complete harness (blocked on `packages/server`)

The numbers in **Status** describe _the simulator_, measured against a trivial receiver.
Server-side numbers require a receiver (Principle 12), which is why the README
measurement table is still empty rather than estimated.

- [ ] Capture server ingest throughput and ingest-to-fan-out p50/p95 through the complete
      harness; do not infer either from simulator configuration.
- [ ] Capture WebSocket messages/second after server coalescing, plus server memory and
      event-loop health.
- [ ] Verify the simulator is not itself CPU-, socket- or concurrency-bound before
      attributing degradation to the server.
- [ ] Distinguish HTTP per-request overhead from schema-validation cost, as ADR 2
      requires. Validation cost is already measured and gated server-side
      ([ADR 22](../../docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md));
      the request overhead it is meant to be compared against is not.
- [ ] Record actual results and environment in the root README only after measurement,
      and report the degradation point rather than only a favourable number.
- [ ] Do not switch to batch emission to improve numbers; batching requires ADR 2's
      staged decision and a matching server mode.

## Decisions taken here that another package must honour

- **Vendor identity travels in the route**, ratified as D9 Option 1 by ADR 8; server TODO
  **M7** is closed. Coupling is recorded in `src/config/simulatorConfig.ts`, the package
  README, and under M7 itself.
- **Vendor B emits lidar source data**, which AGENTS.md requires and adapters TODO
  **C3** does not mention. Left visible and unresolved in a comment on
  `src/vendors/vendorB.ts` rather than settled unilaterally.
- **Retries default to 0.** A telemetry reading is superseded within a second, so
  retrying adds load precisely when the server is already struggling. `--retries` raises
  the bound for tests that need the path.
- **A dropped robot's state is frozen**, so a restart without the flag resumes rather
  than jumping forward.
- **`DEFAULTS.endpoint` is one of three restatements of one address**, ratified as D13
  option 1 by [ADR 21](../../docs/00_adr/21_ENDPOINTS_FROM_THE_ENVIRONMENT_WITH_A_DEV_PROXY.md);
  server TODO **C5** is closed. `packages/server`'s `ENDPOINT_DEFAULTS` binds
  `127.0.0.1:8080` and `packages/web`'s `DEV_SERVER_DEFAULTS` aims its dev proxy at the
  same place. The duplication is deliberate — neither of those packages may be imported
  here — and each of the three pins its own copy in a test naming the other two;
  `src/config/simulatorConfig.test.ts` is this package's. It is **not** ADR 14's
  committed-file parity, because this failure is not silent: a wrong address here shows up
  immediately as failed ingest. Adding a fourth consumer is the point at which that stops
  being proportionate. `FLEET_INGEST_URL` and `--endpoint` still override it.
- **The fleet roster the simulator prints is the one the server reads**, pinned by a
  parity test in each package against `config/fleet-manifest.json`
  ([ADR 14](../../docs/00_adr/14_SHARED_FLEET_ROSTER_PARITY.md)). `vendorId` is the
  roster spelling; adding a field to `fleetManifestSchema` means adding it here too.

## Known defect

- [ ] **`src/__enforcement__/enforcement.test.ts` fails transiently under parallel load.**
      It lints files on disk while `pnpm --recursive` writes other packages, so its input
      is the live tree. Recorded as `packages/FIXME.md` **F14**, which owns the fix; the
      same shape exists in `packages/server` and `packages/adapters`, so fixing this file
      alone would be fixing a symptom. Do not widen a timeout, and do not skip the suite —
      ADR 7 records what a silently inert boundary guard costs.

## Verification sequence for the remaining work

The package-local commands (`test`, `typecheck`, `lint`, `build`) pass today and are run
by the root recursive scripts. The sequence below is what **S1–S3** still owe:

- [ ] Affected `@fleet/adapters` contract tests.
- [ ] Affected `@fleet/server` integration tests.
- [ ] The targeted silence/freshness E2E over a live WebSocket connection.
- [ ] Recorded 50 @ 1 Hz and 500 @ 5 Hz runs through the complete harness.
- [ ] `pnpm dev` starts simulator, **server**, and web with one command.
