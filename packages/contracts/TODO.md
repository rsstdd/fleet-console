# TODO — `packages/contracts`

**Authority:** Planning only. This checklist is non-normative; accepted ADRs and the contracts package specification govern conflicts.

**Reconciled:** 19 August 2026. The bootstrap checklist that occupied most of this file
has been removed: every item in it was complete, and a document of checked boxes is not a
plan. Bootstrap history belongs in Git and in [`README.md`](./README.md). What is left is
the part that was never this package's to finish alone.

## Status

`@fleet/contracts` is **locally complete**: canonical envelope, identifiers, capability
payloads and their wire codec, the error/issue vocabulary, the health response schema, and
the pure `deriveFreshness` function all ship from the public entry point, with **7 test
files and 150 tests**. It imports no other workspace package and has no framework,
transport, storage, timer, environment or UI dependency. `exports` maps `.` to
`./src/index.ts`, so `build` is a typecheck rather than an emit.

Two decisions made here are recorded elsewhere and still govern consumers:
[ADR 10](../../docs/00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md) (an adapter emits an
`AdapterEnvelope`, never a `CanonicalEnvelope`) and
[ADR 20](../../docs/00_adr/20_ONE_ISSUE_VOCABULARY_END_TO_END.md) (`ContractIssue` is the
one failure vocabulary end to end). [`TODO_E2E_JOIN.md`](./TODO_E2E_JOIN.md) holds the
assumptions the end-to-end join must re-check; it is not superseded by this file.

## Cross-package integration gates

**Blocked, not skipped.** Every item asserts behaviour in another package. The contracts
side of each gate exists and is tested; what remains is the consuming side.
`@fleet/contracts` intentionally depends on none of them, so nothing here blocks work in
this package.

- [ ] **`packages/adapters`** — bootstrapped with `@fleet/contracts` as a `workspace:*`
      dependency, recorded fixtures and a public `testing` subpath, but no vendor module:
  - [ ] maps exact A/B/C fixtures into exact canonical envelopes;
  - [ ] emits capability records matching the name-specific payload mapping;
  - [ ] returns `AdapterEnvelope` (ADR 10) and never asserts `freshness`;
  - [ ] never edits canonical core for vendor convenience.
- [ ] **`packages/server`** — the sweep half is done; the transport half is not:
  - [x] calls the exported pure freshness function from its own recurring sweep, against
        `receivedAt` and never `reportedAt` (`src/freshness/freshnessSweep.ts`);
  - [x] marks freshness-only transitions as real changes into the pending delta set;
  - [ ] stamps `receivedAt` at the ingest boundary, distinctly from adapter-normalized
        `reportedAt` — there is no ingest route yet;
  - [ ] serializes capabilities through the canonical wire representation on a response;
  - [ ] excludes raw payload from fleet, history and delta surfaces, proved by a test
        against a real response rather than at the store level.
- [x] **`packages/simulator`** — done 19 August 2026: it emits raw vendor dialects, has no
      dependency on this package, constructs no canonical envelope, and imports no
      freshness derivation to simulate silence. `grep` for `@fleet/contracts` under
      `packages/simulator/src` finds nothing, which is the assertion.
- [x] **`packages/web`** — done 19 August 2026:
  - [x] takes contract types from this package rather than duplicating them.
        `src/entities/robot/model.ts` imports `RobotStatus`, `HealthSeverity`,
        `FreshnessState`, `Health`, `Position`, `Capabilities` and every capability
        payload and re-exports them under the console's names, declaring no contract union
        of its own. It still owns the read model — ISO strings rather than epoch
        milliseconds, plus the per-adapter counters the health endpoint serves and no
        telemetry envelope carries. The mapping is `src/entities/robot/fromEnvelope.ts`,
        tested in `fromEnvelope.test.ts`;
  - [x] consumes freshness as a field and never derives it. A test pins an envelope
        reading `stale` while `reportedAt` is the current instant, so a client that
        re-derived would fail it;
  - [x] uses capability names and payloads without vendor branches.
- [ ] **The end-to-end contract path**: raw vendor fixture → adapter → canonical schema →
      JSON wire round trip → client read-model mapping. **The client half is done**, in
      `packages/web/src/entities/robot/fromEnvelope.test.ts` § "wire round trip":
      canonical envelope → `encodeCanonicalEnvelope` → JSON → `parseCanonicalEnvelope` →
      read model, including the capability record→array→record transform and two rejection
      cases. The vendor half cannot be joined until an A/B/C module exists to call. That
      suite is where the two halves meet.

## Verification the gates still owe

Package-local commands (`test`, `typecheck`, `lint`, `build`) pass and run under the root
recursive scripts. These do not:

- [ ] Adapter contract tests (there are none to run).
- [ ] Server and simulator integration tests after the public API is wired through a
      running transport.
- [ ] `pnpm dev` starts every implemented package, including the server.
- [ ] No raw vendor payload appears in fleet state or WebSocket deltas, asserted against
      real responses.
- [ ] A dropped robot transitions through freshness states from the server sweep while
      unaffected robots remain live.

## Recorded cost of this package to a consumer

Decoding at the client boundary puts Zod in the web bundle: `packages/web` went from
491.70 kB (154.33 kB gzip) to 567.32 kB (175.01 kB gzip), +75.6 kB raw and +20.7 kB gzip.
Principle 2 requires the console to decode what the socket sends, so this is the price of
the rule rather than an accident. **The budget it asked for now exists** — 720 kB raw /
300 kB gzip of first-load code, enforced in CI by `scripts/checkBundleBudget.mjs`
([ADR 22](../../docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md),
register D17). Zod's contribution fits inside it and the build now fails if the console
stops fitting, so this number does not have to be re-measured by hand.
