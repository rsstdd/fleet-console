# 02 — `@fleet/adapters`

- **Status:** partially implemented — core primitives and representative fixture infrastructure exist; no vendor adapter exists yet
- **Package:** `packages/adapters`
- **Governing documents:** ADR 1 (adapter boundary), ADR 7 (enforcement needs a resolver),
  ADR 9 (source exports), ADR 10 (pre-freshness return type), ADR 11 (public fixture
  subpath), ADR 13 (fixture provenance), ADR 15 (unknown-field accounting), ADR 20 (the
  failure shape); Principles 1, 2, 3, 10, 15

## 1. Responsibility

`@fleet/adapters` is the boundary between untrusted vendor payloads and the canonical
envelope. One module per vendor dialect decodes that dialect's runtime schema, maps it
onto `@fleet/contracts`' canonical core, declares the capabilities the source data
supports, and counts the fields it did not recognize.

It does **not**: read a clock, hold state across calls, perform I/O, know about HTTP,
decide freshness, or store anything. An adapter is a pure function of
`(raw: unknown, receivedAt: number) => AdapterResult<AdapterEnvelope>`.

The clock ban is the load-bearing one. `receivedAt` is stamped by the server at the
ingest boundary and passed **in**; `reportedAt` comes from the vendor payload. An adapter
that read `Date.now()` would become a second authority on receipt time, and ADR 3's
freshness guarantee is made against exactly one.

## 2. Position in the dependency graph

May import `@fleet/contracts` and nothing else from the workspace. Sits below transport,
storage and UI: `@fleet/server`, `@fleet/web` and `@fleet/simulator` are all banned
imports.

Consumed by `@fleet/server` (production dispatch, declared) and by `packages/web` as a
**devDependency** for tests that join a raw vendor fixture to the browser read model —
banned in web production code, lifted only for test files (ADR 12).

`@fleet/simulator` does **not** depend on this package in production. It declares
`@fleet/adapters` as a dev dependency solely for `src/fleet/vendorId.test.ts`, which
compares its independent `VENDOR_IDS` literal with this package's `SUPPORTED_VENDORS` in
both directions. Lint bans the import outside tests, and enforcement fixtures prove the
exception remains narrow (ADR 16, resolving **D7** as Option 1).

## 3. Public API

Consumers import from the package root. Deep imports into vendor modules are not part of
the contract, which is what lets a vendor's internal layout change freely.

Tests may additionally import recorded payloads from the public
`@fleet/adapters/testing` subpath (ADR 11). It exports `loadVendorFixture`,
`listVendorFixtures`, and `FIXTURE_RECORDING`; payloads remain `unknown`, and no adapter
or schema behaviour belongs on this surface. Production consumers must ban both
`@fleet/adapters` and its subpaths.

**Result** — `ok`, `failure`, `isOk`, `issuesForKind`. Types: `AdapterResult`, `AdapterOk`,
`AdapterFailure`, `AdapterError`, `AdapterErrorKind`.

`AdapterErrorKind` is a closed union of three causes, re-exported from `@fleet/contracts`
rather than declared here, because the server puts the same value straight onto the wire
(ADR 20):

| Kind                  | Meaning                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `malformed_payload`   | Did not satisfy the vendor's runtime schema                       |
| `unmappable_value`    | Well-formed, but carried a value with no honest canonical mapping |
| `unsupported_dialect` | Named a dialect version this adapter does not support             |

`AdapterError` is `{ kind, vendor, issues }`, where `issues` is the contract's
`readonly ContractIssue[]` — the same vocabulary the HTTP error body and the console use,
so a payload wrong in three fields is still wrong in three fields by the time a technician
reads it (ADR 20). A vendor schema rejection passes `toContractIssues` through unchanged; a
rejection with no Zod error behind it uses `issuesForKind`, which makes the issue's `code`
the rejection kind rather than a string each vendor invents.

An issue carries a path, a category and a schema-derived message and never a rejected
value, so an error can be logged or serialized without leaking telemetry (Principle 7).
The one way to break that is interpolating a payload value into a custom schema message,
which is why the rule is written on `issuesForKind` as well as here.

**Unknown-field ledger** — `createUnknownFieldLedger`. Types: `UnknownFieldLedger`,
`UnknownFieldSnapshot`, `UnknownFieldTally`.

**Unknown-field detection** — `knownFieldPaths`, `findUnknownFieldPaths`, and
`noteAcceptedPayload`. Vendor schemas use passthrough semantics, derive their declared
dotted paths once, and compare accepted raw payloads against that set. The snapshot
carries `scope: "accepted"`; rejected payloads belong only to the server's separate
malformed-ingest counter (ADR 15).

`noteAccepted(vendor, paths)` records dotted paths; `snapshot()` returns a per-vendor
tally and its `accepted` scope. The ledger is **per adapter, process-wide — never per
robot.** ADR 1 § Implications requires the robot-detail diagnostics panel to label the
number accordingly rather than implying a precision it does not have.

**Vendor identity** — `SUPPORTED_VENDORS`, `isSupportedVendor`. Type: `SupportedVendor`.

`SupportedVendor` is deliberately narrower than the contract's `vendorId`, and
deliberately not called `VendorId`. Contracts types a vendor id as an open identifier so
a fourth vendor is never a contracts change. This union answers a different question —
"do I have a module that can decode this?" — which is finite, knowable at compile time,
and is what gives the dispatch switch its exhaustiveness check.

The distinction is load-bearing at the ingest boundary: a payload naming vendor D is an
_unsupported-vendor rejection with its own health metric_, not a malformed identifier.
Collapsing the two would report an integration gap as a data-quality problem.

`isSupportedVendor` takes `unknown` rather than `string` because the server calls it with
an unvalidated route parameter. Requiring a `string` would push a cast to the caller,
which is the coercion Principle 2 exists to prevent.

## 4. Internal structure

```
src/
  core/result.ts          the result union, its constructors, and the issue-shaped error
  core/unknownFields.ts   the per-adapter ledger
  core/vendor.ts          SupportedVendor and its narrowing guard
  vendors/<a|b|c>/        representative fixture exists; schema.ts and adapter.ts are planned
  __enforcement__/        deliberate lint violations, plus one control
  index.ts                the public surface
```

`src/core/` is where behaviour shared by two or more vendors lives. One vendor adapter
must never import another; a shared helper belongs in `core`, where the sharing is
visible. Lint enforces this in both the relative form a sibling would actually write
(`../b/...`) and the absolute form — matching only one of the two is the silent no-op
ADR 7 was written about.

## 5. Contracts owned and consumed

**Consumed:** the canonical envelope, capability payload schemas and primitive schemas
from `@fleet/contracts`.

**Owned:** one Zod schema per vendor dialect, decoding the _vendor's_ shape rather than
the canonical one, plus the mapping between them.

The three dialects and their deliberate disagreements are specified by ADR 1 and produced
by `@fleet/simulator` (see `03_SIMULATOR.md` § 5 for the wire shapes). Each disagreement
is the evidence a specific contract test consumes:

| Dialect  | Shape  | Battery         | Position    | Timestamp | Status  | Sequence | Capabilities declared             |
| -------- | ------ | --------------- | ----------- | --------- | ------- | -------- | --------------------------------- |
| Vendor A | nested | `0..1` fraction | metres      | ISO 8601  | strings | yes      | `dock`, `lidarHealth`, `sequence` |
| Vendor B | flat   | integer percent | centimetres | epoch ms  | numeric | **none** | `dock` only                       |
| Vendor C | nested | `0..1` fraction | metres      | ISO 8601  | strings | yes      | `dock`, `waterLevel`, `sequence`  |

Three absences are load-bearing and must not be "cleaned up":

- **Vendor B declares no `sequence`.** Its adapter synthesizes weaker ordering from the
  timestamp, which cannot separate a duplicate from two events in the same millisecond.
  That limitation is documented, not fixed, and must never be papered over with a zero.
- **Vendor B declares no `lidarHealth`**, and its payload carries no lidar source data to
  declare it from. Settled in ADR 1 § Observed consequences (19 August 2026): `sequence`
  is excluded from capability panels (page spec 03 § 6), so a Vendor B that declared
  `lidarHealth` would render a Capabilities section identical to Vendor A's.
- **Vendor C declares no `lidarHealth`**, and its payload omits the lidar block entirely —
  not `null`, not `{}`, not a disabled placeholder.

Vendor C additionally sends one undocumented field, nested at
`telemetry.firmware_channel`. It is nested rather than top-level so the unknown-field walk
must produce a dotted path and cannot pass by comparing top-level keys alone.

**Status vocabulary mapping** is recorded as a table in each adapter's doc comment; that
table is the reviewable artefact. A source value with no honest mapping is a rejection or
an explicit `unknown` — never a guess.

## 6. Governing decisions

- **ADR 1** — this package is the boundary the ADR decides. Adding a fourth vendor means
  adding one module plus fixtures here; it never means editing the canonical envelope.
- **ADR 7** — records why enforcement fixtures need a resolver and a control file:
  `boundaries/dependencies` sat inert for most of the repository's life, reporting nothing
  for the deliberate fixture and nothing for any probe, and silence was indistinguishable
  from a passing check.
- **Principle 3** — the canonical model preserves shared meaning without erasing
  differences. This package is its direct implementation and the one most explicitly
  tested by contract fixtures.
- **Principle 2** — vendor input is `unknown` until a schema has decoded it.

## 7. Enforcement

| Rule                                          | Mechanism | Where                                         |
| --------------------------------------------- | --------- | --------------------------------------------- |
| No import of server, web or simulator         | Static    | `no-restricted-imports`                       |
| One vendor never imports another              | Static    | per-vendor `no-restricted-imports` block      |
| No wall-clock read                            | Static    | `no-restricted-globals` / `-properties`       |
| A payload cannot be asserted into shape       | Static    | `@typescript-eslint/no-unsafe-type-assertion` |
| Every export has an explicit boundary type    | Static    | `explicit-module-boundary-types`              |
| Dispatch is exhaustive over `SupportedVendor` | Types     | `switch-exhaustiveness-check`                 |
| **The rules above still fire**                | Test      | `src/__enforcement__/enforcement.test.ts`     |

`no-unsafe-type-assertion` is on in this package specifically so a payload cannot be
asserted into canonical shape. If a schema seems to need an assertion, the schema is
wrong.

`src/__enforcement__/` holds one deliberate violation per rule plus `legal.ts`, which
violates nothing. The control matters as much as the violations: without it, a rule that
reports nothing for any input passes every other assertion in the test. These files are
excluded from the normal lint run and reached by constructing `ESLint` with
`ignore: false`. `@ts-nocheck` appears where a fixture imports a module that deliberately
does not resolve — the import bans are syntactic, so the rule still fires.

**Do not repair or delete them.** A failure there means a rule stopped working.

## 8. State, lifecycle and configuration

Adapters are stateless pure functions. The one stateful object is the unknown-field
ledger, and it is created and owned by the caller — `packages/server` holds one for the
process and exposes `snapshot()` on `GET /api/health`. Nothing here reads configuration.

## 9. Failure behaviour

Every adapter returns `AdapterResult`, never throws. Malformed payloads are **rejected and
counted, never coerced** (ADR 2 § Decision). An unknown vendor is a defined rejection plus
a metric — never a guess and never a fallback adapter.

Unknown fields on an otherwise **accepted** payload are counted, not rejected. This is why
acceptance and accounting are separate mechanisms: `z.object().strict()` rejects, which is
the wrong behaviour for ADR 1's requirement that unknown fields be counted on a payload
that still normalizes. The planned approach is passthrough plus a key-diff walk against
the schema's known dotted paths.

## 10. Verification matrix

| Concern                 | Check                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Exact canonical output  | One recorded fixture per vendor → exact envelope (ADR 1's primary evidence)                                     |
| Unit conversion         | Fraction → percent (A, C); centimetres → metres (B)                                                             |
| Timestamp normalization | ISO → epoch ms (A, C); epoch ms passthrough (B)                                                                 |
| Status mapping          | Each dialect's vocabulary into the canonical five                                                               |
| Capability presence     | B declares no `sequence`; B and C declare no `lidarHealth` — asserted by **key absence**, not by a null payload |
| Unknown fields          | Vendor C's undocumented field increments the ledger at its dotted path                                          |
| Malformed input         | Rejected with the right `AdapterErrorKind` and one issue per bad field, payload values absent from the error    |
| Enforcement             | Every lint rule fires on its fixture; the control stays silent                                                  |

ADR 1 § Constraints is explicit that one fixture per vendor is a smoke test rather than
proof of the entire mapping, and asks for at least one boundary or malformed case per
vendor where time allows.

41 tests today, covering core behavior, fixture publication and enforcement.

## 11. Implementation status

**Core primitives and fixture infrastructure only.** Built and tested: the result union,
the accepted-only unknown-field ledger, passthrough/key-difference detection, vendor
identity narrowing, recorded fixtures with a drift guard, and the enforcement suite.

**Not built:** every vendor schema (`B1`–`B3`), every vendor adapter (`C2`–`C4`), the
additional malformed/boundary fixtures under `C1`, and the status-mapping tables (`C5`).

This is one of the two gaps on the critical path. Until vendor adapters exist:

- no generated payload can be validated against an authoritative schema, which is why
  `@fleet/simulator` § 9 of its TODO is blocked;
- `@fleet/server` cannot dispatch, so its ingest boundary is unbuilt too;
- ADR 1's primary evidence — one fixture per vendor asserting exact canonical output —
  does not yet exist.

**Decision consequences.** Adapters return only validated pre-freshness envelopes
([ADR 10](../00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md)); publish unknown recorded
fixtures through the Node-free test subpath ([ADR 11](../00_adr/11_PUBLIC_TESTING_SUBPATH_FOR_FIXTURES.md));
re-record those fixtures in CI ([ADR 13](../00_adr/13_RECORDED_FIXTURES_WITH_A_CI_DRIFT_GUARD.md));
count accepted-payload unknowns under their explicit scope ([ADR 15](../00_adr/15_UNKNOWN_FIELD_ACCOUNTING_ON_ACCEPTED_PAYLOADS.md));
and own the supported-vendor set while a test guards the simulator copy ([ADR 16](../00_adr/16_TEST_ONLY_ADAPTERS_DEPENDENCY_FOR_VENDOR_PARITY.md)).

## 12. Change rules

- A new vendor is one module plus fixtures here, and an entry in `SUPPORTED_VENDORS`. It
  must not require a canonical-model change. It requires no `@fleet/contracts` edit
  unless it needs a genuinely new capability.
- A new vendor **field** belongs to the raw dialect in `@fleet/simulator` and its mapping
  here. A genuinely new **capability** starts in `@fleet/contracts`.
- A dialect change updates the simulator's generator, this package's schema, its fixtures
  and its exact-output contract test **in the same commit**, with the coupling commented
  on both sides (Principle 14).
- Shared behaviour between two vendors moves to `src/core/`, never to a sibling import.
