# TODO — `packages/adapters`

**Authority:** Planning only. This checklist is non-normative; accepted ADRs and the adapter package specification govern conflicts.

**Created:** 19 August 2026 · **Audited:** 19 August 2026 (second pass — completed items removed, stale claims corrected)
**Scope:** this package only. Items owned elsewhere are marked `[repo]` or with the owning package.
**Governing documents:** [`AGENTS.md`](./AGENTS.md) (authoritative scoped guide), [`../../PRINCIPLES.md`](../../PRINCIPLES.md), [ADR 1](../../docs/00_adr/01_ADAPTER_BOUNDARY.md), [ADR 2](../../docs/00_adr/02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md), [ADR 3](../../docs/00_adr/03_FRESHNESS.md), [ADR 9](../../docs/00_adr/09_WORKSPACE_SOURCE_EXPORTS_AND_TSX_RUNTIME.md).

This package is the boundary between three untrusted vendor telemetry dialects and one
canonical envelope. Nothing downstream may branch on vendor, so every real vendor
difference has to be expressed here — as a declared capability, a rejection, or a counted
unknown field — or it is lost.

---

## FIXME — needs your attention

Decisions and assumptions made while bootstrapping and auditing this package. None are
load-bearing enough to block work; all are cheap to reverse **now** and progressively
less so.

### Choices I made that changed the package's public API

- **FIXME: `VendorId` was renamed to `SupportedVendor`, and its guard now takes
  `unknown`.** Made during the audit, on the grounds that `@fleet/contracts` types a
  vendor id as an _open_ `identifierSchema` — deliberately, so a fourth vendor is never a
  contracts change — while this package had declared a closed `"A" | "B" | "C"` under the
  same name. Two declarations of one concept that disagree is the duplicate authority
  Principle 1 forbids. The union survives because the _registry_ genuinely knows a finite
  set and needs exhaustiveness; only the name and the guard's parameter type changed.
  This was free because nothing imported it yet. It will not be free after **C8**.
- **FIXME: the guard widening assumes the server hands it an unvalidated route
  parameter.** `isSupportedVendor(value: unknown)` exists so `POST /api/telemetry/:vendor`
  can narrow without casting first (Principle 2). If the server decides to validate the
  vendor segment against `identifierSchema` before dispatch, the `unknown` parameter is
  redundant and `string` would read more honestly.

### Recommendations in this file that are mine, not decisions

- **RESOLVED 19 August 2026 — B4's recommendation was ratified as
  [ADR 15](../../docs/00_adr/15_UNKNOWN_FIELD_ACCOUNTING_ON_ACCEPTED_PAYLOADS.md)**, and
  built: loose vendor schemas plus a key-difference walk against paths derived from the
  schema itself, so there is no second list of known fields to drift. See **B4** below.
- **RESOLVED 19 August 2026 — D8's 90% coverage threshold was deleted, not ratified**
  ([ADR 22](../../docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md),
  register D17). The FIXME here was right that the number had no derivation, and the audit
  found a second problem: `src/vendors/**` holds three recorded fixtures, one enforcement
  fixture and no TypeScript, so the gate would have reported a pass over an empty set —
  ADR 7's failure, where silence is indistinguishable from a passing check. Coverage is now
  printed into the CI job summary on every run and fails nothing; `vitest.config.ts` carries
  no `thresholds` key and says why. Add one only with a derivation, in that ADR, of what it
  protects. Coverage at the moment of deletion: 94.25% statements, 86.36% branches, 100%
  functions, 98.64% lines.

### Consequences of decisions already ratified, worth re-reading

- **FIXME: unknown fields are counted only on _accepted_ payloads**
  ([ADR 15](../../docs/00_adr/15_UNKNOWN_FIELD_ACCOUNTING_ON_ACCEPTED_PAYLOADS.md)). The
  accepted cost: a vendor that changes shape in two ways at once — a new field _and_ a
  changed type — shows **no** unknown-field growth while its integration breaks, because
  every payload is rejected before the ledger sees it. The malformed-ingest counter is the
  one to watch during an integration change, and the two must never be summed. If that
  trade turns out to be wrong in practice, the fix is a second tally — which the ADR made
  additive by naming this one's scope in the data (`scope: "accepted"`) rather than
  leaving the caveat to a consumer's caption.
- **FIXME: `@ts-nocheck` appears in two enforcement fixtures**
  (`__enforcement__/workspaceImport.ts`, `vendors/a/__enforcement__/crossVendor.ts`).
  Those fixtures import modules that deliberately do not resolve, and the import bans are
  syntactic, so the rules still fire while `tsc` stays clean. If `ban-ts-comment` is ever
  tightened repo-wide, or a policy bans `@ts-nocheck` outright, these two files break and
  the enforcement test fails for a reason unrelated to what it tests.

### Things only you can settle

- **FIXME: `packages/web` is named `web`, not `@fleet/web`.** Every other package carries
  the scope. This package's import allow-list therefore has to ban two spellings instead
  of one, and `packages/server` does the same. Renaming is a one-line change plus a
  lockfile churn, and it removes a permanent footnote from two lint configs.
- **FIXME: `zod` is a declared dependency of this package and only its tests import it.**
  It is there for the vendor dialect schemas in **B1–B3**. If those schemas end up living
  in `@fleet/contracts` instead, the dependency is dead weight and should go.
- **RESOLVED 19 August 2026 — `A8` landed before the server wrote its ingest handler**, which
  is what made changing `AdapterError` free rather than a breaking cross-package change.
  Ratified as [ADR 20](../../docs/00_adr/20_ONE_ISSUE_VOCABULARY_END_TO_END.md); the
  register stub was **D16**.

---

## Section 0 — What exists today

Verified at the audit, from `packages/adapters`:

| Command          | Result                           |
| ---------------- | -------------------------------- |
| `pnpm typecheck` | passes                           |
| `pnpm lint:js`   | passes                           |
| `pnpm lint`      | passes (`lint:js` + `typecheck`) |
| `pnpm test`      | passes — 4 files, 14 tests       |
| `pnpm build`     | passes (`tsc --noEmit`)          |

```
packages/adapters/
├── package.json          @fleet/adapters, source-exported, catalog-pinned deps
├── tsconfig.json         extends ../../tsconfig.base.json; node types, no DOM
├── vitest.config.ts      node environment, @/ alias, v8 coverage
├── eslint.config.js      the package's rules, enforced and tested (§ 3)
├── TODO.md               this file
└── src/
    ├── index.ts          public entry point; deep imports are not the contract
    ├── core/
    │   ├── vendor.ts         SupportedVendor, SUPPORTED_VENDORS, isSupportedVendor
    │   ├── result.ts         AdapterResult / AdapterError on ContractIssue (ADR 20)
    │   └── unknownFields.ts  per-adapter unknown-field ledger (ADR 1)
    ├── __enforcement__/           README + 4 deliberate violations + 1 legal control
    └── vendors/a/__enforcement__/ the cross-vendor violation, where that rule applies
```

Three deliberate choices worth knowing before extending:

- **The package exports TypeScript source**, not a build output. All four library
  packages now agree on this, and [ADR 9](../../docs/00_adr/09_WORKSPACE_SOURCE_EXPORTS_AND_TSX_RUNTIME.md)
  records it along with the reason runtime goes through `tsx` rather than plain `node`.
- **Relative imports carry the `.ts` extension** (`allowImportingTsExtensions`), matching
  `server` and `simulator`. `@fleet/contracts` still uses `.js` specifiers from its
  emit-era; ADR 9 § Open questions asks whether to converge, and answers that it is
  tidiness rather than a fix now that `tsx` resolves both.
- **`SupportedVendor` is not a vendor id.** It names the registry's question — which
  dialects have an adapter — and is deliberately narrower than the contract's open vendor
  identifier. See the FIXME above.

**Settled and removed from this list:** the `@fleet/contracts` bootstrap and its envelope,
capability and freshness exports; the vendor-identity reconciliation; the
source-exports-versus-`dist` conflict (ADR 9); the workspace import allow-list; the
permanent enforcement fixtures; and CI pickup. The reasoning for each lives in the ADRs
rather than here.

---

## Section 1 — Consume the contract

- [x] **A7 — Declare the dependency. Done 19 August 2026**, alongside **A8**.
      `"@fleet/contracts": "workspace:*"` is declared and `src/core/result.ts` imports from
      it. **The return type is settled**: an adapter returns `AdapterEnvelope` — the
      canonical envelope minus `freshness`, which only the server's sweep may write — and
      the server completes it through `withFreshness`
      ([ADR 10](../../docs/00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md), 19 August 2026).
      Write **B1**–**B3** and **C2**–**C4** against it; `parseAdapterEnvelope` validates an
      adapter's own output in contract tests.
- [x] **A8 — Build `AdapterError` on the contract's issue shape. Done 19 August 2026 —
      [ADR 20](../../docs/00_adr/20_ONE_ISSUE_VOCABULARY_END_TO_END.md).** `AdapterError` is
      `{ kind, vendor, issues }`; the flattened `message` + `path` are gone. `AdapterResult`
      stays — AGENTS.md § Adapter contract requires this package's own explicit result
      model, and `AdapterError` adds `kind` and `vendor`, which `ParseResult` has no notion
      of. `AdapterErrorKind` is now re-exported from `@fleet/contracts`, where the wire
      vocabulary lives, so the server copies `kind` onto the wire rather than mapping it.
      **What B1–B3 must do:** a schema rejection is
      `failure({ kind: "malformed_payload", vendor, issues: toContractIssues(parsed.error) })`;
      a rejection with no Zod error behind it (**C5**'s unmappable status, an unsupported
      dialect) uses `issuesForKind`, so the issue `code` is the kind rather than an invented
      string. Never interpolate a payload value into an issue message — these issues are
      serialized into an HTTP error body.

---

## Section 2 — Schemas, adapters, and the registry

One Zod schema per dialect in `src/vendors/<a|b|c>/schema.ts`, decoding the **vendor's**
shape; one adapter per dialect mapping it to canonical.

**The producer side already exists.** `packages/simulator/src/vendors/{vendorA,vendorB,vendorC}.ts`
emit these dialects and document the coupling back to this package by filename. Fixtures
for **C1** should be recorded from the simulator rather than invented, so the two sides
cannot drift.

- [x] **B4 — How unknown fields are detected. Decided and built, 19 August 2026 —
      [ADR 15](../../docs/00_adr/15_UNKNOWN_FIELD_ACCOUNTING_ON_ACCEPTED_PAYLOADS.md).**
      Option (b): loose vendor schemas plus a key-difference walk, in `src/core/`, producing
      dotted paths. The known set is **derived from the schema** by `knownFieldPaths` rather
      than hand-listed, so the two cannot drift; `findUnknownFieldPaths` walks the raw
      payload; `noteAcceptedPayload` takes the accepted/rejected precondition as an argument
      so the ordering is structural. Four detection rules the vendor schemas inherit: array
      elements collapse to `[]`, an unknown subtree is reported once at its root, one path
      per payload however often it occurs, and the raw payload is walked rather than the
      parsed result.
      **What B1–B3 must do:** declare the schema with `z.looseObject`, compute
      `knownFieldPaths(schema)` **once at module load**, and call `noteAcceptedPayload` with
      the parse outcome.
- [ ] **C1 — Record fixtures.** `src/vendors/<v>/__fixtures__/*.json`, deterministic,
      committed. Per vendor at minimum: one representative payload, one malformed, one
      boundary case (battery at both ends, missing optional block), and for C one carrying
      the undocumented field.
      **Partially done 19 August 2026:** the representative payload for each of A, B and C is
      recorded from the simulator at seed 1, fleet size 9, instant 1755600000000, and
      committed. Vendor C's already carries `firmware_channel`. Still missing: the malformed
      and boundary cases, which is why `VendorFixtureName` has one member. Provenance and the
      re-record procedure are in `src/testing/README.md`; ADR 13 resolved register **D4** by
      making CI re-record and fail on any fixture diff.
- [ ] **B1 / C2 — Vendor A.** Nested payload, battery as a fraction `0..1`, position in
      metres, ISO-8601 timestamp. Declares `dock`, `lidarHealth`, `sequence`.
- [ ] **B2 / C3 — Vendor B.** Flat payload, integer-percentage battery, position in
      centimetres, epoch-ms timestamp, numeric status codes. Declares **`dock` and `dock`
      only.** Both absences are load-bearing: no `sequence`, because timestamp ordering
      cannot separate a duplicate from two events in the same millisecond, and that
      ambiguity is the point of vendor B; and no `lidarHealth`, because `sequence` is
      excluded from capability panels (page spec 03 § 6), so a vendor B declaring
      `lidarHealth` would render a Capabilities section identical to vendor A's — and that
      section is the one page spec 03 § 3 exists to make differ by vendor. Settled in ADR
      1 § Observed consequences, 19 August 2026.
- [ ] **B3 / C4 — Vendor C.** Broadly A-shaped; declares `waterLevel`, declares no
      `lidarHealth`, and notes its undocumented field to the ledger.
- [ ] **C5 — Status vocabulary mapping per vendor.** Each dialect's status values map into
      the canonical five. A source value with no honest mapping is a rejection or an
      explicit `unknown` — never a guess. Record each mapping as a table in the adapter's
      doc comment; that table is the reviewable artefact.
- [ ] **C6 — Capability payloads trace to a declaration.** Every non-core output field
      must come from a capability the adapter explicitly set. A canonical field left
      unpopulated "because this vendor doesn't have it" is the defect ADR 1 § Constraints
      names in review.
- [ ] **C7 — Raw payload retention.** Keep the raw payload on the adapter's output for
      technician diagnosis, in a field the fleet read model and the delta stream do not
      carry. Coupling: `packages/server` serves it only from the single-robot endpoint
      (ADR 1, ADR 2). Comment that constraint on both sides.
- [ ] **C8 — Dispatch registry.** `src/registry.ts` mapping `SupportedVendor` to adapter,
      plus one `decodeTelemetry(vendor, raw, receivedAt)` entry point, so
      `packages/server` never imports a vendor module directly. Exhaustive over
      `SupportedVendor` — a `switch` with `switch-exhaustiveness-check` (already on)
      rather than a lookup that can silently miss.
- [ ] **C9 — Export surface.** Re-export from `src/index.ts` only. Adding a vendor means
      one directory plus one registry line; it never means touching the canonical model.

---

## Section 3 — Tests

The wire is done: `vitest.config.ts`, node environment, four passing test files, a
`test:coverage` script. What is missing is the contract-test harness.

- [x] **D1 — Shared fixture loader. Done 19 August 2026.** `src/testing/fixtures.ts` loads a
      fixture by vendor and name, typed `unknown` at the call site. The subpath question is
      settled the other way round from the sketch above: `packages/web` needed it for the
      joining test, so `./testing` is public and test-only, banned in production code by
      every consumer ([ADR 11](../../docs/00_adr/11_PUBLIC_TESTING_SUBPATH_FOR_FIXTURES.md)).
      `packages/server`'s ban covers its tests too, so an ingest test wanting fixtures needs
      an explicit exception first.
- [ ] **D2 — One contract test per vendor, asserting exact canonical output.** Explicit
      assertions, not snapshots — the mapping invariants are the documentation
      (AGENTS.md § Tests and fixtures).
- [ ] **D3 — Injected receipt time.** Every test passes a literal `receivedAt`. The lint
      rule in § 4 enforces that no clock is read, but the _habit_ of a fixed instant per
      fixture is what makes failures readable.
- [ ] **D4 — Rejection tests.** One per vendor per `AdapterErrorKind` that vendor can
      produce. Assert on `kind` and `path`, not on message text.
- [ ] **D5 — Unknown-field accounting at the adapter level.** The ledger, the walk and the
      accepted-only guard all have unit tests now (ADR 15); what is untested is that vendor
      C's adapter actually notes `telemetry.firmware_channel` from its recorded fixture, and
      that two robots from the same vendor increment **one** per-adapter count rather than
      two per-robot counts. Add the malformed-plus-unknown case too: a rejected payload
      carrying a new field must leave the ledger at zero while the failure is counted
      elsewhere.
- [ ] **D6 — Capability presence and absence.** Assert vendor B declares neither
      `sequence` nor `lidarHealth`, and vendor C declares no `lidarHealth` — by key
      absence, not by a null payload.
- [ ] **D7 — Unit and timestamp conversion.** Centimetres and metres to the same canonical
      value; ISO and epoch-ms to the same instant. Cross-vendor: two fixtures describing
      the same physical robot state must produce identical canonical cores. That test is
      the strongest evidence the normalization is real.
- [x] **D8 — Coverage gate. CLOSED 19 August 2026: there is no gate, on purpose**
      ([ADR 22](../../docs/00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md)).
      The proposed 90% threshold had no derivation and, over a `src/vendors/**` containing no
      TypeScript, would have measured nothing while reporting a pass. Coverage is reported in
      CI instead. Do not reopen this by adding a `thresholds` key; reopen it by deriving a
      number in the ADR — the falsifier is adapters shipping with materially untested vendor
      mappings, which the contract tests over recorded fixtures (ADR 13) are the real defence
      against.

---

## Section 4 — Enforcement

`eslint.config.js` encodes the package's rules and `src/__enforcement__/` proves they
still fire. Principle 15 requires enforcement to be tested; ADR 7 records what the
untested version looks like — `boundaries/dependencies` sat inert in `packages/web` for
most of the repository's life, reporting nothing for the deliberate fixture and nothing
for any probe, and silence was indistinguishable from a passing check.

| Rule                                   | Fixture                                    | Asserted in                           |
| -------------------------------------- | ------------------------------------------ | ------------------------------------- |
| Wall clock (ADR 3)                     | `__enforcement__/wallClock.ts`             | `__enforcement__/enforcement.test.ts` |
| No unsafe type assertion (Principle 2) | `__enforcement__/unsafeAssertion.ts`       | same                                  |
| Workspace allow-list                   | `__enforcement__/workspaceImport.ts`       | same                                  |
| No cross-vendor import (ADR 1)         | `vendors/a/__enforcement__/crossVendor.ts` | same                                  |
| **Control — must report nothing**      | `__enforcement__/legal.ts`                 | same                                  |

The control is not decoration. Without it, a rule set that reports nothing for any input
passes all four violation assertions. Verified by turning two rules off and watching the
matching tests fail, then turning them back on.

Fixtures are excluded from the normal lint run by the `ignores` entry in
`eslint.config.js`; the test reaches them with `new ESLint({ ignore: false })`.

**Standing rules — not tasks, and never "done".** They belong here because they are the
rules a future change is most likely to break:

- **Never trust a cast.** `@typescript-eslint/no-unsafe-type-assertion` is on so a payload
  cannot be asserted into shape. If a schema seems to need an assertion, the schema is
  wrong.
- **No package-local `config/`.** Thresholds and tenant configuration are not this
  package's concern. If a vendor needs a tunable, it belongs in `packages/server`
  configuration and arrives as an argument.
- **Never read the clock.** `receivedAt` arrives from the server boundary; `reportedAt`
  comes from the payload. Lint enforces it and a fixture proves the rule fires.

### Repo-scoped, tracked here only because this package surfaced them

- [ ] **E3 `[repo]` — `packages/server/AGENTS.md` fails `prettier --check`.** It predates
      this package and is the only remaining offender; the `contracts` and `simulator`
      copies have since been fixed. Root `pnpm lint` stays red until it is formatted.
- [ ] **E5 `[repo]` — review the `minimumReleaseAgeExclude` block in
      `pnpm-workspace.yaml`.** `pnpm install` appended it for nine `vitest` packages when
      this package pinned them from the catalog. It is committed and formatted, and it is
      not accidental — but it should be read rather than absorbed.

---

## Section 5 — Package hygiene

- [ ] **F1 — `README.md`.** Short: what a vendor dialect is, how to add a fourth vendor
      (one directory, one registry line, fixtures, contract test), and what may not change
      (the canonical model).
- [ ] **F3 — Document cross-package coupling on both sides.** One of three is done: the
      unknown-field ledger names `packages/server`'s health endpoint, and
      `packages/simulator`'s vendor modules already name their adapter counterparts.
      Outstanding: `receivedAt` injection (server ↔ adapters) and raw-payload retention
      (adapters ↔ server single-robot endpoint), neither of which has a here-side to
      comment on until **C7** and **C8** land.

**F2 is done and removed:** every export in `src/core/*` and `src/index.ts` carries a
one-sentence doc comment, verified mechanically at the audit. Keeping it enforced is a
review matter, not a task — there is no proportionate lint rule for it (Principle 15).

---

## Definition of done

1. Three vendor adapters decode their recorded fixtures into exact canonical output.
2. Vendor B declares `dock` alone; vendor C declares no `lidarHealth`; both asserted by tests.
3. Vendor C's undocumented field appears in `ledger.snapshot().C` and is never dropped.
4. Two fixtures from different vendors describing the same robot state produce identical canonical cores.
5. Every malformed fixture returns an `AdapterResult` failure; none throws.
6. No file in this package reads the clock, and the enforcement fixture confirms the rule still fires.
7. `packages/server` decodes telemetry through `decodeTelemetry` and imports no vendor module directly.
8. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass from the repository root.
