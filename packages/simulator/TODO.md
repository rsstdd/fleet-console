# TODO — `packages/simulator`

**Authority:** Planning only. This checklist is non-normative; accepted ADRs and the simulator package specification govern conflicts.

**Reconciled:** 19 August 2026. The bootstrap checklist this file used to carry has been
removed: it listed as open the work that is now implemented, tested and running, which
made the document unreadable as a plan. Bootstrap history belongs in Git and in
[`README.md`](./README.md). What remains below is the work that is genuinely not done.

**Re-verified:** 20 August 2026, against the accepted ADRs, `packages/README.md`,
`packages/FIXME.md` and the tree. The Status figures below were re-measured rather than
copied forward. One entry was stale and is corrected in place: this file still recorded
Vendor B's lidar source data as an open conflict after ADR 1 settled it in the opposite
direction. Two constraints decided elsewhere that land on this package were missing and
have been added.

## Status

The package is bootstrapped, runs, and is verified against a live HTTP receiver.
Generation, CLI/configuration, fault injection, bounded scheduling and transport,
metrics, lifecycle, fixture recording and the public boundary are implemented, with
**16 test files and 211 tests**; lint, typecheck and build are clean. Re-run 20 August
2026 after completing the recorded boundary set.

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
- **Vendor B carries no lidar source data**, so its adapter declares `dock` and nothing
  else. This entry recorded the opposite as an unresolved conflict between AGENTS.md and
  adapters TODO **C3**; [ADR 1](../../docs/00_adr/01_ADAPTER_BOUNDARY.md) § Observed
  consequences settled it on 19 August 2026, against that reading. The deciding
  constraint is downstream: `sequence` is excluded from the capability panel grid, so a
  Vendor B declaring `lidarHealth` would render a Capabilities section identical to
  Vendor A's and the one section built to differ by vendor would show two profiles across
  three vendors. `src/vendors/vendorB.ts`, AGENTS.md, [`README.md`](./README.md) and
  adapters **C3** all state the absence and cite the same ADR entry. Cite
  [ADR 19](../../docs/00_adr/19_CAPABILITY_KIND_SPLITS_THE_NAME_SET_IN_CONTRACTS.md)'s
  `CAPABILITY_KINDS` for the exclusion rather than page spec 03 § 6 prose; the
  classification is what enforces it now.
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

## Decisions taken elsewhere that constrain this package

- **This package runs on plain `node`, and is correct only while it imports no workspace
  package** ([ADR 9](../../docs/00_adr/09_WORKSPACE_SOURCE_EXPORTS_AND_TSX_RUNTIME.md)
  § Implications). `dev` and `start` invoke `node --watch src/index.ts`. The day a
  production module here imports `@fleet/contracts`, both scripts must move to `tsx` in
  the same change or the package fails with `ERR_MODULE_NOT_FOUND` on a `.js` specifier
  nothing emits; the coupling is commented in `package.json` under `_runtime`. ADR 9's
  open question — move now on consistency grounds rather than on that trigger — is still
  open, and `packages/FIXME.md` **F2** records the contradiction it sits inside: the
  ADR's Decision says executables run through `tsx`, its Implications carve this package
  out, and `pnpm-workspace.yaml` approves the `esbuild` native build for a `tsx` that no
  current script invokes. Reconcile the ADR before changing these scripts; do not settle
  it from this side.
- **The malformed fixtures adapters TODO C1 owes cannot be recorded here, and must land
  outside the drift guard's path filter**
  ([ADR 13](../../docs/00_adr/13_RECORDED_FIXTURES_WITH_A_CI_DRIFT_GUARD.md)
  § Implications). This package emits only well-formed payloads by design, so those cases
  are necessarily hand-authored or mutated on the adapters side. When they land they need
  a directory or naming scheme the CI filter
  `packages/adapters/src/vendors/*/__fixtures__/*.json` does not sweep in — a
  hand-authored payload sitting beside recorded ones under the same convention is exactly
  the confusion ADR 13 exists to prevent. Nothing in this package changes; it is recorded
  here because the recorder and the guard it depends on live on this side.

## Resolved defect

- [x] **`src/__enforcement__/enforcement.test.ts` no longer lints a tree something else is
      writing — CLOSED 20 August 2026 with `packages/FIXME.md` F14.** It still lints
      files on disk, which is what makes it worth having; what changed is that nothing else
      in the workspace runs while it does. The root `test` script is now
      `pnpm --recursive --workspace-concurrency=1 test`, and `vitest.config.ts` says why at
      the top of the `test` block, where the next person to re-parallelise it will read it.
      All four suites repo-wide were fixed together — `packages/adapters`' and
      `packages/web`'s had not been caught, which F14 called luck rather than a difference.
      Two changes inside this file beyond the schedule: its four cases now judge a single
      lint pass taken in `beforeAll`, and a fatal ESLint result throws instead of being
      filtered into an empty message list that reads as a broken boundary. No timeout was
      widened; the one that remains is a hook budget for that single pass.

## Verification sequence for the remaining work

The package-local commands (`test`, `typecheck`, `lint`, `build`) pass today and are run
by the root recursive scripts. The sequence below is what **S1–S3** still owe:

- [ ] Affected `@fleet/adapters` contract tests.
- [ ] Affected `@fleet/server` integration tests.
- [ ] The targeted silence/freshness E2E over a live WebSocket connection.
- [ ] Recorded 50 @ 1 Hz and 500 @ 5 Hz runs through the complete harness.
- [ ] `pnpm dev` starts simulator, **server**, and web with one command.
