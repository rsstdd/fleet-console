# TODO — `packages/adapters`

**Authority:** Planning only. This checklist is non-normative; accepted ADRs and the adapter package specification govern conflicts.

**Created:** 19 August 2026 · **Audited:** 20 August 2026 (third pass — re-read against ADRs 10-29, which landed after the second pass)
**Scope:** this package only. Items owned elsewhere are marked `[repo]` or with the owning package.
**Governing documents:** [`AGENTS.md`](./AGENTS.md) (authoritative scoped guide), [`../../PRINCIPLES.md`](../../PRINCIPLES.md), [ADR 1](../../docs/00_adr/01_ADAPTER_BOUNDARY.md), [ADR 2](../../docs/00_adr/02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md), [ADR 3](../../docs/00_adr/03_FRESHNESS.md), [ADR 9](../../docs/00_adr/09_WORKSPACE_SOURCE_EXPORTS_AND_TSX_RUNTIME.md), [ADR 19](../../docs/00_adr/19_CAPABILITY_KIND_SPLITS_THE_NAME_SET_IN_CONTRACTS.md), [ADR 25](../../docs/00_adr/25_CONTRACTS_OWNS_EVERY_DECODED_RESPONSE_COUNTERS_BY_SCOPE.md), [ADR 26](../../docs/00_adr/26_RAW_PAYLOAD_BOUNDED_VERBATIM_AND_UNPROTECTED_BY_DECISION.md).

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
  **The free window has closed** (noted 20 August 2026): `packages/server/src/ingest/selectVendor.ts`
  imports both `isSupportedVendor` and `SupportedVendor`, and `packages/simulator`'s parity
  test reads `SUPPORTED_VENDORS` (ADR 16). Renaming again is now a three-package change.
- **RESOLVED 20 August 2026 — the guard's `unknown` parameter is a decision, not an
  assumption.** ADR 8 § Decision (amended 19 August 2026, ratifying register stub D9) fixes
  vendor identity in the `:vendor` path segment and validates it here before any body byte
  is read. The register asked whether the parameter should narrow to `string` once the
  server validated first; it stays `unknown` because the value arrives from a URL, and a
  boundary guard with a precondition is not a boundary guard. Recorded in `src/core/vendor.ts`
  and in `selectIngestVendor`'s doc comment; nothing here is still open.

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
  leaving the caveat to a consumer's caption. That scope now reaches the wire:
  [ADR 25](../../docs/00_adr/25_CONTRACTS_OWNS_EVERY_DECODED_RESPONSE_COUNTERS_BY_SCOPE.md)
  put `unknownFieldScope` on `healthResponseSchema`, so the console renders its caveat from
  the value rather than a hardcoded caption.
- **FIXME: `UnknownFieldTally` and `UnknownFieldScope` are now declared twice, under one
  name each.** ADR 25 added both to `@fleet/contracts` (`src/health/healthResponseSchema.ts`)
  as the shape this package's `UnknownFieldSnapshot` must serialize into; this package still
  exports its own structurally identical declarations from `src/core/unknownFields.ts`. They
  agree today and nothing compares them — which is exactly the duplicate authority the
  `VendorId` rename above was made to remove, arriving from the other direction. Cheapest
  fix now: import the two contracts types here and keep only `UnknownFieldLedger` and
  `UnknownFieldSnapshot` local, since only those two are genuinely this package's (the
  snapshot is keyed by `SupportedVendor`, the contract's `byAdapter` by open identifier).
  This gets more expensive with every consumer of the adapters spelling.
- **FIXME: `parseAdapterEnvelope` cannot validate an `AdapterEnvelope` directly.** Found by
  writing the vendor A round-trip test, which failed with "expected array, received object".
  `AdapterEnvelope` is the schema's **output** type and carries capabilities as the runtime
  record; `parseAdapterEnvelope` validates the schema's **input**, which is the wire array.
  So **A7**'s instruction — "`parseAdapterEnvelope` validates an adapter's own output in
  contract tests" — is only true after `encodeCapabilities`. `@fleet/contracts` exports
  `encodeCanonicalEnvelope` but no `encodeAdapterEnvelope` beside it. The cheap fix is that
  missing function, in contracts; until then every vendor contract test repeats the encode
  step and the comment explaining it.
- **FIXME: `connectivity` is a canonical core field no dialect reports.** Found by closing
  **C6**: all three adapters emit the constant `"unknown"`, and no simulator dialect carries
  link state at all. `canonicalCoreSchema`'s own doc says a field belongs in the core "only if
  every adapter can populate it from its own dialect" and calls a core field that is empty for
  some vendors "the failure mode ADR 1 and Principle 3 exist to prevent" — this one is empty
  for **all** of them. `positionSchema` records `heading` as a field already removed for exactly
  this reason, so the precedent points at removal. It is not removed here because the field is
  rendered by `packages/web`'s robot detail page and asserted in four server and web suites, so
  this is a contracts change with three consumers, not an adapter change. Two readings are open:
  a modelling defect to delete, or a field held for a real vendor that reports link state and is
  not yet modelled. Whoever decides should also say whether `unknown` is then still reachable —
  `connectivitySchema` keeps the member either way, for a vendor that reports the link is down
  versus one that says nothing. Until then the constant is named once in
  `src/capabilityTrace.test.ts` § `UNSOURCED_CORE_FIELDS` rather than sitting as three quiet
  literals, and the suite fails the day a dialect starts feeding it.
- **FIXME: the wall-clock ban forced a hand-written ISO-8601 parser** (`src/core/isoInstant.ts`,
  18 tests). `no-restricted-globals` bans the `Date` global outright, so `new Date(iso).getTime()`
  — a pure parse, not a clock read — is banned with `Date.now()`. That is defensible, because
  the rule cannot distinguish the parsing constructor from the no-argument form that ADR 3
  exists to prevent, and admitting one admits both. It is worth knowing that the cost is real
  and now paid in this package: ~30 lines of civil-date arithmetic that a one-line `Date` call
  would otherwise do, carried for vendors A and C. If a third dialect ever needs date _maths_
  rather than parsing, revisit the rule rather than growing this file.
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
- **RESOLVED 20 August 2026 — `zod` is production, not test-only.** The earlier FIXME said
  only tests imported it; `src/core/unknownFieldPaths.ts` imports `type { z }` to derive
  known paths from a schema, which is shipped behaviour. ADR 29's `pnpm check:dependencies`
  now fails on a declared-and-unused dependency anyway, so the question cannot go stale
  again without breaking the build.
- **RESOLVED 20 August 2026 — the four unsourced canonical fields are ratified as
  [ADR 30](../../docs/00_adr/30_FIELDS_WITH_NO_COUNTERPART_ACROSS_THE_ADAPTER_BOUNDARY.md)**
  (register stub **D21**). The FIXME asked for ratification of four decisions taken while
  building vendor A — `adapterId`/`adapterVersion`, `position.frame`, `connectivity`, and
  heading's absent canonical home — and all four are settled as built. Nothing changed in
  any adapter.
  **They turned out to be one decision, not four.** Three are a canonical field with no
  vendor source and the fourth is a vendor field with no canonical home; both directions
  have the same failure mode, a plausible default that compiles, ships, and states
  something to an operator no vendor said. The ADR is written around that seam, so a
  fourth vendor gets a rule rather than four precedents.
  **Two things the ratification changed rather than recorded.** Vendor C declared
  `telemetry.pose.heading_deg` correctly but asserted nothing about it — the "do the same
  in **C3**/**C4**" instruction had been half-followed — so it now has the drop test A and
  B already had, and it is the sharpest of the three: C is the only dialect whose ledger is
  non-empty, so the test names the counted path instead of asserting a zero total. And the
  `adapterId` loose end is now an ADR open question rather than a comment: the server has
  two candidate keys for one health column, and **C8**'s registry chooses, never a handler.
  **Still true and now load-bearing:** the console's connectivity column is permanently
  inert until a dialect reports a link state. That is a simulator and contracts question —
  `packages/FIXME.md` **F4** is its fixture-side half.
- **RESOLVED 19 August 2026 — `A8` landed before the server wrote its ingest handler**, which
  is what made changing `AdapterError` free rather than a breaking cross-package change.
  Ratified as [ADR 20](../../docs/00_adr/20_ONE_ISSUE_VOCABULARY_END_TO_END.md); the
  register stub was **D16**.

---

## Section 0 — What exists today

Verified 20 August 2026, from `packages/adapters`, after all three vendor adapters landed:

| Command          | Result                           |
| ---------------- | -------------------------------- |
| `pnpm typecheck` | passes                           |
| `pnpm lint:js`   | passes                           |
| `pnpm lint`      | passes (`lint:js` + `typecheck`) |
| `pnpm test`      | passes — 12 files, 182 tests     |
| `pnpm build`     | passes (`tsc --noEmit`)          |

```
packages/adapters/
├── package.json          @fleet/adapters, source-exported, catalog-pinned deps
│                         exports "." and "./testing" (ADR 11)
├── tsconfig.json         extends ../../tsconfig.base.json; node types, no DOM
├── vitest.config.ts      node environment, @/ alias, v8 coverage, no thresholds (ADR 22)
├── eslint.config.js      the package's rules, enforced and tested (§ 4)
├── TODO.md               this file
├── TODO_E2E_JOIN.md      the joining test's extra constraints on the same items
└── src/
    ├── index.ts          public entry point; deep imports are not the contract
    ├── core/
    │   ├── vendor.ts             SupportedVendor, SUPPORTED_VENDORS, isSupportedVendor
    │   ├── result.ts             AdapterResult / AdapterError on ContractIssue (ADR 20)
    │   ├── unknownFields.ts      per-adapter unknown-field ledger (ADR 1, ADR 15)
    │   ├── unknownFieldPaths.ts  knownFieldPaths / findUnknownFieldPaths (ADR 15)
    │   ├── isoInstant.ts         ISO-8601 to epoch ms without `Date` (see § FIXME)
    │   ├── units.ts              conversions two or more dialects need, and only those
    │   └── adapter.ts            the VendorAdapter signature every vendor implements
    ├── testing/          the ./testing subpath: fixture loader + provenance (ADR 11)
    ├── vendors/a/          schema.ts + adapter.ts + contract test (B1/C2, done)
    ├── vendors/b/          schema.ts + adapter.ts + contract test (B2/C3, done)
    ├── vendors/<a|b|c>/__fixtures__/*.json     recorded, generated (ADR 13)
    ├── vendors/<a|b|c>/__malformed__/*.json    hand-authored, never recorded
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
- [x] **C1 — Record fixtures. Done 20 August 2026.** Twelve payloads: nine recorded under
      `src/vendors/<v>/__fixtures__/`, three hand-authored under
      `src/vendors/<v>/__malformed__/`. Per vendor: `representative`, `boundary-empty`,
      `boundary-full`, and one malformed. Vendor C's recorded payloads carry
      `telemetry.firmware_channel` — nested, so the walk must produce a dotted path.
      **Two things the original item asked for turned out not to exist.** "Missing optional
      block" describes nothing in these dialects: every field of `VendorAPayload`,
      `VendorBPayload` and `VendorCPayload` is required, and vendor C's absent lidar block
      is a property of the dialect rather than of a payload. The nearest real per-payload
      variation is `dock.dock_id`, `null` in every representative payload and a string in
      every `boundary-empty` one — a schema typing it `null` would have passed the whole
      previous set. And **battery extremes are unreachable from any seed**: `initialState`
      draws from `[0.35, 1)`, so the boundary states are constructed, not hunted for. They
      are still states `evolveRobot` can produce, so the fixtures remain the producer's
      own output (`boundaryState` in the simulator's `fixtureSet.ts` argues this).
      **The malformed payloads are not recorded and never will be** — the simulator emits
      only well-formed output (ADR 13 § Implications) — so they are hand-written, live
      outside `__fixtures__/`, and reach consumers through `loadMalformedPayload` rather
      than `loadVendorFixture`. Two accessors, not one wider name union, because the
      provenances differ and one union would hide that at the call site. That placement
      also keeps them inside ADR 27's diff budget instead of silently exempt under its
      generated-files glob.
      **Status `fault` and health `critical` still appear in no recorded payload,** and
      deliberately so: that is a vocabulary matrix, one payload per source value, not
      another extreme. **C5** covers them now, by building those payloads in the tests
      rather than recording them.
      **Recording still covers one robot per vendor** (`R-001`, `R-002`, `R-003`), so
      **D7**'s cross-vendor test still has no input — see that item.
- [x] **B1 / C2 — Vendor A. Done 20 August 2026.** `src/vendors/a/schema.ts` (loose at every
      level, `identifierSchema`/`displayNameSchema` reused from contracts rather than
      restated, `VENDOR_A_KNOWN_PATHS` derived once at module load) and
      `src/vendors/a/adapter.ts`, built as `createVendorAAdapter(ledger)` returning the
      two-argument `VendorAdapter` the package spec § 1 documents — the ledger is closed
      over rather than passed per call, so a caller cannot supply a different one per
      payload and turn per-adapter accounting into per-robot accounting.
      Declares `dock`, `lidarHealth` and `sequence`; the status and health tables are in the
      module comment, which discharges **C5** for this vendor. Canonical `unknown` is
      unreachable from this dialect on purpose: the schema admits only A's four states, so a
      fifth value is a rejection rather than a silent downgrade — asserted under **C5**, for
      the health level as well as the status.
      **This item could not be completed without settling the four unowned fields below;**
      [ADR 30](../../docs/00_adr/30_FIELDS_WITH_NO_COUNTERPART_ACROSS_THE_ADAPTER_BOUNDARY.md)
      ratifies all four as implemented; overruling one is a new durable decision, not
      re-litigation from scratch.
      24 contract tests in `src/vendors/a/adapter.test.ts`, which discharges **D2**, **D3**
      and **D6** for vendor A and part of **D4** and **D5**.
- [x] **B2 / C3 — Vendor B. Done 20 August 2026.** `src/vendors/b/schema.ts` and
      `src/vendors/b/adapter.ts`, built as `createVendorBAdapter(ledger)` like vendor A's.
      26 contract tests in `src/vendors/b/adapter.test.ts`, which discharges **D2**, **D3**
      and **D6** for this vendor and the whole of **C5**'s numeric half.
      **The dialect's own decision, and the one thing here vendor A does not face:** vendor
      B spells status, health and dock state as _integers_, so the schema checks the shape
      (`z.number().int()`) and the **adapter** owns the vocabulary — an unrecognized code is
      `unmappable_value` through `issuesForKind`, exactly as **A8** anticipated. Vendors A
      and C reach the same outcome through `z.enum`, because a dialect spelling its states
      as words declares its vocabulary in the document and one spelling them as integers
      does not. Canonical `unknown` is deliberately not the answer for an unrecognized code:
      it would say the robot's state is unknown when what is unknown is the _code_, which is
      an integration defect the server counts rather than a state to show an operator.
      **Settled 20 August 2026: the ledger is written before the mapping rejections, and
      ADR 15 now says so.** The question was which of ADR 15's two sentences governed — the
      one counting payloads the _schema_ accepted, which is where `noteAcceptedPayload`
      sits, or the one saying a rejected payload leaves the ledger untouched — since an
      `unmappable_value` rejection is both at once. **Ratified as built.** The gate is
      schema acceptance, not overall success: a payload that was well-formed for its dialect
      and carried a value the canonical model cannot take is dialect change, which is the
      signal this ledger exists for, and discarding it would widen ADR 15's known blind spot
      in the direction it is already widest. What schema acceptance actually buys — the walk
      never runs on deeply malformed data, and a retry loop full of garbage cannot inflate
      the map — is untouched by what happens after the parse.
      No adapter changed; ADR 15's _wording_ did. Two sentences said "a rejected payload"
      where they meant "a payload the schema rejected", which read as a contradiction the
      moment a second kind of rejection existed. The amendment adds the rejected position as
      a fourth alternative, states that an `unmappable_value` can move two counters at once,
      and makes "call it immediately after the parse" a rule a new adapter inherits.
      Vendor B's test now pins the ordering against the ratified reading rather than against
      an open question.
      `toMetres` stays local rather than joining `core/units.ts`, by that file's own
      admission rule: it takes a conversion when two or more dialects need it, and vendor B
      is the only one reporting centimetres.
      The original item's reasoning, unchanged and now implemented — declares **`dock` and
      nothing else.** Both absences are load-bearing: no `sequence`, because timestamp ordering
      cannot separate a duplicate from two events in the same millisecond, and that
      ambiguity is the point of vendor B; and no `lidarHealth`, because `sequence` is
      excluded from capability panels, so a vendor B declaring `lidarHealth` would render a
      Capabilities section identical to vendor A's — and that section is the one page spec
      03 § 3 exists to make differ by vendor. Settled in ADR 1 § Observed consequences,
      19 August 2026. That exclusion is now mechanical rather than prose:
      [ADR 19](../../docs/00_adr/19_CAPABILITY_KIND_SPLITS_THE_NAME_SET_IN_CONTRACTS.md)
      classifies `sequence` as `diagnostic` in `CAPABILITY_KINDS`, and the console keys its
      panel registry off `OPERATOR_CAPABILITY_NAMES`. Cite the classification, not the page
      spec, when writing this test.
- [x] **B3 / C4 — Vendor C. Done 20 August 2026.** `src/vendors/c/schema.ts` and
      `src/vendors/c/adapter.ts`, 21 contract tests. Declares `dock`, `waterLevel` and
      `sequence`; declares no `lidarHealth` **by key absence**, asserted with
      `"lidarHealth" in capabilities` being false rather than a null payload, because a null
      payload would claim the vendor reports a lidar it does not have.
      **`telemetry.firmware_channel` is deliberately not in the schema**, which is what keeps
      it countable — declaring it would make it a known path and silence the only evidence in
      the repository that ADR 1's counting requirement works. Said so in the schema's module
      comment, because it looks like an omission and is not.
      **One shared helper moved to `core/`:** `toBatteryPercent`, now `src/core/units.ts`,
      because A and C both convert a fraction and a unit conversion has exactly one right
      answer — two vendors disagreeing about it would fail **D7** for a reason unrelated to
      either dialect. The status and health tables were **not** moved despite A and C
      agreeing today: a vocabulary mapping is a per-dialect contract, and a shared table
      invites editing both when one vendor changes. `units.ts` states that test at the top.
      Vendor C imports nothing from `vendors/a`, which lint enforces and the near-miss makes
      worth enforcing. The health mapping was prose here until **C5** made it a table; the
      status one was a table from the start, and the difference is exactly what a reviewer
      can and cannot check.
- [x] **C5 — Status vocabulary mapping per vendor. Done 20 August 2026, all three
      vendors.** Each dialect's values map into the canonical five, every table is in its
      adapter's module comment, and **every row of every table is asserted** — including the
      values no recorded payload carries, which the tests build rather than record.
      **Vendor B was the real work:** three tables (status, health, dock), every row
      asserted, and a code outside any table rejected as `unmappable_value` naming the field
      it came from.
      **Vendors A and C reject rather than guess,** which is the other half of this item and
      is now checked rather than claimed in prose. Both dialects spell their states as
      words, so the vocabulary is declared in the document and a fifth word is a
      `malformed_payload` rejection — not a downgrade to canonical `unknown`. The two fields
      fail for different reasons and both are asserted: `status` has an `unknown` member a
      lenient adapter could downgrade to, and `HealthSeverity` has none at all, so a level
      outside the table has nowhere to go even if guessing were permitted.
      **Vendor C's health mapping is a table now, not prose.** It read as three words in a
      sentence, which is not the reviewable artefact this item asks for — a reviewer cannot
      check a row that was never written down. Its status table stays restated rather than
      imported from vendor A's, and its rejection test is restated for the same reason: two
      vendor contracts that agree today are not one contract.
      Health `critical` was the last unasserted row in the package; it appears in no recorded
      fixture for A or C, so both suites now build the payload (see **C1**).
- [x] **C6 — Capability payloads trace to a declaration. CLOSED 20 August 2026.** Every
      non-core output field must come from a capability the adapter explicitly set. A canonical
      field left unpopulated "because this vendor doesn't have it" is the defect ADR 1 §
      Constraints names in review. For `sequence`, the adapter declares the vendor's raw counter
      and nothing more: per-robot continuity is `sequenceHealth` on the diagnostic envelope and
      the **server** derives it (ADR 25). Do not compute a gap here — none of the three do.
      **The trace is established by mutation, in `src/capabilityTrace.test.ts`.** The per-vendor
      suites already pinned each capability _set_ and each exact payload, and neither is this
      property: a set can be right while the payload is copied from the wrong field, and an
      exact-output test agrees with whatever the adapter currently does, so it cannot tell a
      value that came from the dialect from one the adapter invented. Changing one documented
      field in a recorded payload and diffing the envelope by region can. Twenty-five rows, one
      per source field across the three dialects; each must move exactly the region it names.
      Four falsifiers were run and all four fire: a capability wired to a constant, a capability
      declared from an absence (`waterLevel` on vendor A), a capability source leaking into the
      core, and removal of the `UNSOURCED_CORE_FIELDS` entry.
      **The inverse half found something.** The table is cross-vendor because that is the only
      place a canonical field _no_ dialect feeds is visible, and there is one: `connectivity`,
      the constant `"unknown"` in all three adapters. Recorded in § FIXME above; it is a
      contracts change with three consumers, not an adapter change, so it is not made here.
      `heading` was already removed from `positionSchema` for the same reason, which is the
      precedent.
      **The table lives above `src/vendors/`, not beside each adapter.** The lint ban is on one
      vendor directory importing another — a production coupling — and reading all three from
      above is what a cross-vendor property needs.
- [x] **C7 — Raw payload retention. CLOSED 20 August 2026: it is not this package's field**
      ([ADR 26](../../docs/00_adr/26_RAW_PAYLOAD_BOUNDED_VERBATIM_AND_UNPROTECTED_BY_DECISION.md)).
      This item asked for a raw-payload field on the adapter's output. That is now
      unimplementable and would be wrong: `AdapterEnvelope` is a strict object with no such
      key (ADR 10), and the server retains the accepted request body itself in
      `CurrentStateStore`, deep-copied in both directions, serving it only from
      `robotDiagnosticEnvelopeSchema`. The adapter never sees or holds it. What survives of
      this item is the coupling comment, tracked under **F3**.
- [x] **C8 — Dispatch registry. CLOSED 20 August 2026.** `src/registry.ts` maps
      `SupportedVendor` to adapter behind one `decodeTelemetry(vendor, raw, receivedAt)`
      entry point, exported from `src/index.ts`, so `packages/server` never imports a
      vendor module directly. Exhaustive over `SupportedVendor` via a `switch`, not a
      lookup. **Verified rather than assumed:** adding a fourth member to
      `SupportedVendor` fails twice and independently — `switch-exhaustiveness-check`
      reports `Cases not matched: "D"`, and `tsc` reports TS7030 "Not all code paths
      return a value" on the same function. The guarantee therefore does not rest on the
      lint rule alone.
      **There is no lookup table beside the switch.** A record keyed by `SupportedVendor`
      is exhaustive too, but reading from it yields `VendorAdapter | undefined` under
      `noUncheckedIndexedAccess`, so dispatch would carry a branch for a case the key type
      has already excluded — untestable code
      written to satisfy the checker. The switch is the mapping.
      **The registry owns its ledger; `createAdapterRegistry()` takes no arguments.**
      ADR 1 permits one counting scope per adapter and `UnknownFieldSnapshot` can express
      no other, so a ledger parameter would let a caller pass a fresh one per request —
      every tally reading 0 or 1, no test failing, and the counter answering a different
      question than ADR 15 asks. `unknownFields()` returns the snapshot for ADR 25's
      health response; the per-vendor factories still take a ledger, which is how the
      contract tests keep isolated counts.
      **Dispatch wiring is asserted, not typed.** The exhaustiveness check cannot prove a
      branch reaches the _right_ adapter, and a swapped pair typechecks; each vendor's own
      `vendorId` is what catches it. Three falsifiers were run and all three fire: swapped
      B/C branches (9 tests), a ledger rebuilt per call (3), and a dispatch that falls back
      through the other adapters (4).
      **One test was written wrong and the code was right.** It asserted that a payload the
      schema accepted and the mapping then rejected leaves the ledger untouched. ADR 15 §
      Decision, amended 20 August 2026, puts the gate at _schema_ acceptance and rejects
      that alternative explicitly as position 4. The test now pins the ratified behaviour
      from outside the vendor modules, because the registry is what the health endpoint
      reads and a reordering inside one adapter would change the population that number
      covers without touching anything server-side.
- [ ] **C9 — Export surface.** Re-export from `src/index.ts` only. Adding a vendor means
      one directory plus one registry line; it never means touching the canonical model.

---

## Section 3 — Tests

The wire and per-vendor contract harnesses are done: `vitest.config.ts`, node environment,
12 passing test files, and a `test:coverage` script. What remains is dispatch and the
cross-vendor normalization assertion under **D7**.

- [x] **D1 — Shared fixture loader. Done 19 August 2026.** `src/testing/fixtures.ts` loads a
      fixture by vendor and name, typed `unknown` at the call site. The subpath question is
      settled the other way round from the sketch above: `packages/web` needed it for the
      joining test, so `./testing` is public and test-only, banned in production code by
      every consumer ([ADR 11](../../docs/00_adr/11_PUBLIC_TESTING_SUBPATH_FOR_FIXTURES.md)).
      `packages/server`'s ban covers its tests too, so an ingest test wanting fixtures needs
      an explicit exception first.
- [x] **D2 — One contract test per vendor, asserting exact canonical output. Done 20 August 2026.** Explicit
      assertions, not snapshots — the mapping invariants are the documentation
      (AGENTS.md § Tests and fixtures). Assert the whole envelope, including `adapterId`,
      `adapterVersion`, `connectivity` and `position` — those are the four fields with no
      vendor source (§ FIXME), and an assertion that skips them is where a wrong constant
      hides. Round-trip each result through `parseAdapterEnvelope`.
- [x] **D3 — Injected receipt time. Held for all three vendors.** Every test passes a literal `receivedAt`. The lint
      rule in § 4 enforces that no clock is read, but the _habit_ of a fixed instant per
      fixture is what makes failures readable.
- [x] **D4 — Rejection tests. Done 20 August 2026.** One per vendor per `AdapterErrorKind` that vendor can
      produce. Assert on `kind` and `path`, not on message text.
      **The inputs exist now** (**C1**): `listMalformedPayloads()` returns one per vendor,
      each broken differently — vendor A a wrong type at a nested path, vendor B two
      independent defects in one payload, vendor C a well-typed but impossible timestamp.
      Vendor B's is the one that proves ADR 20's claim: two defects must produce two issues,
      and a rejection reporting one has flattened the other away.
- [x] **D5 — Unknown-field accounting at the adapter level. Done 20 August 2026.** Vendor C
      closed the last gap: its adapter notes `telemetry.firmware_channel` from every recorded
      case, at the dotted path rather than a top-level key, and the tests pin the per-adapter
      scope (two robots, one count of two), that a vendor C payload leaves A's and B's
      tallies at zero, and that a rejected payload leaves the ledger untouched.
      One case is worth knowing about because it looks wrong: the `unparsable-timestamp`
      payload **is** counted, because the schema accepted the document and only the value
      judgement failed afterwards. The ledger tracks dialect drift, which happened there
      regardless of the timestamp. Asserted explicitly so nobody "fixes" it.
      Previously done for vendors A and B, both of which assert the per-adapter count over two
      robots, the malformed-plus-unknown case at zero, and that a declared-but-dropped field
      (`heading_deg`, `heading_cdeg`) is not counted. Vendor B adds the flat-payload case —
      its unknown fields are top-level names rather than dotted paths — and pins the ledger
      ordering the B2/C3 entry leaves open.
- [x] **D6 — Capability presence and absence. Done 20 August 2026.** Vendor A asserts its three by key set and
      that `waterLevel` is absent; **vendor B done 20 August 2026** — neither `sequence` nor
      `lidarHealth`, by key absence rather than a null payload, and the `lidarHealth` case
      reads `CAPABILITY_KINDS` and `OPERATOR_CAPABILITY_NAMES` rather than page-spec prose,
      so what it proves is that vendor B's _panel_ set differs from vendor A's (ADR 19).
      **Vendor C done 20 August 2026** — its absent `lidarHealth` and present `waterLevel`
      are the pair that makes robot detail render a different panel from vendor A's, which is
      the difference page spec 03 § 3 exists to show. All three vendors are now covered.
- [ ] **D7 — Unit and timestamp conversion.** Centimetres and metres to the same canonical
      value; ISO and epoch-ms to the same instant. Cross-vendor: two fixtures describing
      the same physical robot state must produce identical canonical cores. That test is
      the strongest evidence the normalization is real.
      **Correction, 20 August 2026: the input exists, and this entry previously said it did
      not.** That was true of the `representative` payloads only — A is busy at 96.61%, B at
      75%, C idle at 38.46%. The **boundary** cases added under **C1** are built from one
      pinned state per case and applied to all three robots, so `boundary-empty` and
      `boundary-full` already describe the same physical state in three dialects.
      With all three adapters now built, their canonical cores **are** identical for a given
      boundary case — checked on 20 August 2026 by comparing serialized `core` values for
      both cases across A, B and C, which matched exactly — battery 0 or 100 from a fraction and from an integer percent,
      ∓40 m from metres and from centimetres, one status from a string and from a numeric
      code, and the same `frame`, because the three recorded robots all sit in `SITE-NORTH`.
      Only identity fields (`robotId`, `model`, `adapterId`, `vendorId`) and the capability
      records should differ. That is the whole test, and it needs no new fixture and no
      re-record — write it against `loadVendorFixture(v, "boundary-empty")` for each vendor
      and compare `envelope.core`.
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

One rule in `eslint.config.js` is **not** in that table: `jsdoc/informative-docs`, added
for [ADR 28](../../docs/00_adr/28_BAN_DOC_COMMENTS_THAT_RESTATE_THE_SIGNATURE.md). It is
proven at the repository level instead, by `pnpm check:doc-comments`
(`scripts/informativeDocsRule.test.mjs`) over the shared word lists in
`config/eslint/informativeDocs.js`, so a local fixture would be a second, weaker copy of a
guard that already exists. Noted here because the table otherwise reads as complete.

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

- [x] **E3 `[repo]` — CLOSED 20 August 2026.** `npx prettier --check packages/server/AGENTS.md`
      passes; the file was formatted and root `pnpm lint` is no longer red for this reason.
- [x] **E5 `[repo]` — CLOSED 20 August 2026 by
      [ADR 29](../../docs/00_adr/29_VETTED_DEPENDENCY_ALLOW_LIST_AND_RELEASE_AGE_QUARANTINE.md).**
      The block was read rather than absorbed, and the reading found worse than expected:
      `minimumReleaseAge` itself had never been set, so nine exceptions were live against a
      rule that was not. It is now `10080` (7 days) with the derivation in the file, the
      nine `vitest` entries are pinned to exact versions so each exception expires on the
      next bump, and a second grandfathered block records the `eslint-plugin-jsdoc` closure.
- [x] **E6 `[repo]` — CLOSED 20 August 2026 with `packages/FIXME.md` F14.** It closed with
      the others, repo-wide, rather than waiting to be caught: the root `test` script now
      runs packages one at a time (`--workspace-concurrency=1`), so nothing writes the tree
      while these suites lint it, and `vitest.config.ts` states that at the top of the
      `test` block. This suite also takes one lint pass in `beforeAll` and throws on a
      fatal ESLint result instead of filtering it into an empty message list. No timeout
      was widened.

---

## Section 5 — Package hygiene

- [ ] **F1 — `README.md`.** Short: what a vendor dialect is, how to add a fourth vendor
      (one directory, one registry line, fixtures, contract test), and what may not change
      (the canonical model). `packages/FIXME.md` **F11** agrees this waits for the registry.
- [ ] **F3 — Document cross-package coupling on both sides.** Two of four are done: the
      unknown-field ledger names `packages/server`'s health endpoint, and
      `packages/simulator`'s vendor modules already name their adapter counterparts.
      Outstanding, and none has a here-side to comment on until **C8** lands:
      `receivedAt` injection (server → adapters); the `sequence` capability the server reads
      to derive per-robot `sequenceHealth` (ADR 25). Raw payload is **not** on this list any
      more — ADR 26 put it wholly on the server side, so there is no adapter half to pair.

**F2 is done and removed:** every export in `src/core/*` and `src/index.ts` carries a
one-sentence doc comment. It is no longer only a review matter: ADR 28 added
`jsdoc/informative-docs` to `eslint.config.js`, so a comment that merely restates its
signature now fails lint. The earlier note here saying no proportionate rule existed was
overtaken on 19 August 2026.

---

## Definition of done

1. Three vendor adapters decode their recorded fixtures into exact canonical output.
2. Vendor B declares `dock` alone; vendor C declares no `lidarHealth`; both asserted by tests.
3. Vendor C's `telemetry.firmware_channel` appears in `ledger.snapshot().byAdapter.C` and is never dropped.
4. Two payloads from different vendors describing the same robot state produce identical canonical cores (**D7** — decide the input first).
5. Every malformed fixture returns an `AdapterResult` failure; none throws.
6. No file in this package reads the clock, and the enforcement fixture confirms the rule still fires.
7. `packages/server` decodes telemetry through `decodeTelemetry` and imports no vendor module directly.
8. Every adapter's snapshot serializes into `healthResponseSchema` without a shape invented at the handler (ADR 25), under one agreed `adapterId` spelling.
9. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass from the repository root, and `pnpm check:ci` passes with them.
