# 01 — `@fleet/contracts`

- **Status:** implemented
- **Package:** `packages/contracts`
- **Governing documents:** ADR 1 (canonical core plus declared capabilities), ADR 3
  (freshness ownership), ADR 9 (source exports), ADR 19 (operator/diagnostic
  capability classification), ADR 20 (one issue vocabulary and the HTTP error body);
  Principles 1, 2, 3, 4, 11

## 1. Responsibility

`@fleet/contracts` owns the canonical robot envelope, the declared-capability model, the
runtime schemas that decode both, and the pure freshness derivation function. It is the
single authoritative definition of what a normalized robot reading is.

It does **not**: decode vendor dialects (that is `@fleet/adapters`), read a clock, run a
timer, perform I/O, know about HTTP or WebSockets, or import anything from the workspace.
It is the bottom of the dependency graph and must stay there.

The freshness split is the subtlest non-responsibility. This package owns the
_derivation_ — receipt time, clock reading and two thresholds in, one of four states out.
It does not own the _sweep_ that calls it, which is a recurring interval in
`packages/server` (ADR 3). Splitting them is what makes the rule a pure unit test against
an injected clock rather than something only observable by waiting.

## 2. Position in the dependency graph

Imports nothing from the workspace. Depends only on `zod`.

Consumed by `@fleet/adapters`, `@fleet/server` and `web`. Not consumed by
`@fleet/simulator`, which deliberately restates the three vendor identifiers locally so
its raw dialects stay independent of the canonical model.

## 3. Public API

Everything is re-exported from `src/index.ts`; the `exports` map exposes only that entry
point, which is what keeps the internal file layout free to change.

**Primitives** — `SCHEMA_VERSION`, `MAX_EPOCH_MS`, `MAX_POSITION_METRES`,
`identifierSchema`, `displayNameSchema`, `vendorIdSchema`, `versionStringSchema`,
`schemaVersionSchema`, `epochMillisecondsSchema`, `batteryPercentSchema`,
`positionSchema`, `robotStatusSchema`, `healthSchema`, `healthSeveritySchema`,
`connectivitySchema`, `freshnessStateSchema`, `parseWith`, `toContractIssues`.
Types: `Identifier`, `EpochMilliseconds`, `Position`, `RobotStatus`, `Health`,
`HealthSeverity`, `Connectivity`, `FreshnessState`, `ContractIssue`, `ParseResult`.

**Capabilities** — `CAPABILITY_NAMES`, `CAPABILITY_KINDS`,
`OPERATOR_CAPABILITY_NAMES`, `DIAGNOSTIC_CAPABILITY_NAMES`,
`isOperatorCapability`, `isDiagnosticCapability`, `dockCapabilitySchema`,
`lidarHealthCapabilitySchema`, `waterLevelCapabilitySchema`, `sequenceCapabilitySchema`,
`capabilityWireEntrySchema`, `capabilitiesWireSchema`, `parseCapabilities`,
`encodeCapabilities`. Types: `Capabilities`, `CapabilityKind`, `CapabilityName`,
`OperatorCapabilityName`, `DiagnosticCapabilityName`, `CapabilityPayloadByName`,
`CapabilityWireEntry`, and one payload type per capability.

**Errors** — `ADAPTER_ERROR_KINDS`, `ERROR_KINDS`, `adapterErrorKindSchema`,
`errorKindSchema`, `contractIssueSchema`, `errorEnvelopeSchema`, `parseErrorEnvelope`.
Types: `AdapterErrorKind`, `ErrorKind`, `ErrorEnvelope`. This is the HTTP error body,
defined in terms of `ContractIssue` rather than as a second failure shape, and the closed
kind vocabulary the adapter and the wire share (ADR 20).

**Envelope** — `canonicalCoreSchema`, `canonicalEnvelopeSchema`,
`registeredRobotStateSchema`, `robotDiagnosticEnvelopeSchema`, `telemetryBatchSchema`,
`parseCanonicalEnvelope`, `parseRegisteredRobotState`, `parseRobotDiagnosticEnvelope`,
`parseTelemetryBatch`, `encodeCanonicalEnvelope`, `withFreshness`. Types:
`CanonicalCore`, `CanonicalEnvelope`, `CanonicalEnvelopeWire`, `RegisteredRobotState`,
`RobotDiagnosticEnvelope`, `TelemetryBatch`.

**Freshness** — `deriveFreshness`, `DEFAULT_FRESHNESS_POLICY`, `freshnessPolicySchema`,
`parseFreshnessPolicy`. Types: `FreshnessPolicy`, `DeriveFreshnessInput`.

## 4. Internal structure

```
src/
  shared/primitives.ts        scalar schemas and the parse-result shape
  capabilities/capabilitySchemas.ts  name-to-payload map, wire array transform
  envelope/envelopeSchema.ts  canonical envelope, its variants, encode/withFreshness
  freshness/deriveFreshness.ts  the pure state function and its policy
  index.ts                    the entire public surface
```

Each module has a colocated `.test.ts`. `index.test.ts` asserts the public surface itself,
so an export removed by accident is a test failure rather than a downstream compile error.

## 5. Contracts owned

### The canonical envelope

| Field                           | Meaning                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `schemaVersion`                 | Exact literal `"1"`                                              |
| `robotId`, `siteId`, `vendorId` | Identity. `vendorId` is an open identifier, never an enum        |
| `model`                         | Vendor's model designation, operator-facing                      |
| `adapterId`, `adapterVersion`   | Which adapter produced this and at what version                  |
| `reportedAt`                    | Vendor instant, epoch ms. The console's "last seen"              |
| `receivedAt`                    | Server receipt instant, epoch ms. The only field the sweep reads |
| `core`                          | `connectivity`, `batteryPercent`, `position`, `status`, `health` |
| `freshness`                     | Server-derived; carried, never recomputed by a consumer          |
| `capabilities`                  | Wire: array of `{ name, payload }`. Runtime: mapped record       |

Two fields the README once listed as envelope members are deliberately **not** on it:
`sequence` is a capability, because Vendor B sends none; `rawPayload` lives only on the
separate `robotDiagnosticEnvelopeSchema`. The strict schema rejects both, which makes the
exclusion checkable rather than conventional (ADR 1 § Observed consequences).

### Capabilities

`dock`, `lidarHealth`, `waterLevel`, `sequence`. Key presence in the record **is** the
declaration — there is no parallel `Set`, and no capability is an optional field that
happens to be undefined. The wire form is an array transformed by Zod into the runtime
record, so the declaration survives JSON serialization across the WebSocket boundary.

Declaration profile per vendor, settled in ADR 1 § Observed consequences (19 August 2026):

| Capability    | A   | B   | C   |
| ------------- | --- | --- | --- |
| `dock`        | ●   | ●   | ●   |
| `lidarHealth` | ●   |     |     |
| `waterLevel`  |     |     | ●   |
| `sequence`    | ●   |     | ●   |

Every capability has a distinct declaration pattern, so each is exercised for both
presence and absence by three fixtures.

Duplicate capability names are rejected rather than resolved last-write-wins; unknown
names are rejected for a supported schema version; wire output is emitted in fixed
canonical name order so fixtures and diffs do not churn.

ADR 19 resolves D11 as **Option 3 — two derived name sets in contracts**. The total
`CAPABILITY_KINDS` record classifies every `CapabilityName` as `operator` or `diagnostic`;
the two name types and their canonically ordered runtime arrays derive from that record.
`sequence` remains a declared capability but is classified `diagnostic`; the other three
capabilities are `operator`.

The implication is that adding a capability now requires an explicit classification in
contracts or typechecking fails. An operator capability also requires a web panel because
the panel registry is exhaustive over `OperatorCapabilityName`; diagnostic rendering is
still a manual follow-up and is the one remaining unenforced side. This classification is
in-process metadata only: it changes neither the wire format nor vendor declarations, and
tenant feature flags remain a separate deployment concern.

### Freshness

`deriveFreshness` maps age to `live | stale | unreachable`, and a robot that has never
reported to `unknown`. Thresholds are 2 s live and 10 s stale by default (ADR 3).

`sweepIntervalMs` is deliberately **absent** from `FreshnessPolicy`. It sits beside the
thresholds in `config/freshness.json` but describes how often the server calls this
function, not how the answer is computed. Including it would imply the function knows its
own call schedule and would let a scheduling change look like a derivation change.

`withFreshness` returns an envelope with a new freshness state and every other field
untouched — the shape of the sweep's write. Because it replaces exactly one field, ADR 3's
invariant that a freshness-only transition cannot disturb `reportedAt` or an observed
value holds by construction rather than by discipline.

## 6. Governing decisions

- **ADR 1** — this package _is_ the canonical core plus declared capability record. The
  first open question ("does the declared-capability-record approach earn its
  complexity?") was answered yes here: `toCapabilities` and `encodeCapabilities` are
  hand-written switches rather than `Object.fromEntries` calls, and that verbosity is the
  benefit — it is where each name binds to its own payload type with no cast.
- **ADR 3** — owns the pure half of freshness; the sweep is the server's.
- **ADR 9** — source-exported, `noEmit`, no build artifact. Its internal relative imports
  use `.js` specifiers, a residue of a brief `dist` build; both styles resolve under
  `tsx`, `tsc`, Vitest and Vite, and ADR 9 § Open questions leaves convergence as
  tidiness rather than a fix.
- **ADR 19** — resolves D11 as Option 3. Contracts owns one total operator/diagnostic
  classification and derives both name sets; the web package consumes the operator set
  rather than maintaining an exclusion list.
- **ADR 20** — resolves D16 as Option 1. `ContractIssue` is the repository's one failure
  vocabulary, and the HTTP error body is defined in terms of it rather than as a third
  shape. Contracts owns the error kinds; the status and the operator sentence do not
  live here.
- **Principle 2** — external contracts decoded once, at a boundary, into an internal type.
- **Principle 4** — `reportedAt` and `receivedAt` are separate fields with different
  owners and different jobs.

## 7. Enforcement

| Rule                                            | Mechanism    | Where                                   |
| ----------------------------------------------- | ------------ | --------------------------------------- |
| Imports nothing from the workspace              | Static       | `eslint.config.js`                      |
| Public surface is what `index.ts` exports       | Test         | `src/index.test.ts`                     |
| Canonical schemas reject unrecognized keys      | Runtime      | `z.strictObject` throughout             |
| A capability name cannot take another's payload | Types + Test | discriminated union; cross-product test |
| Every capability belongs to exactly one kind    | Types + Test | total kind map; partition assertions    |
| No wall-clock read                              | Static       | `no-restricted-properties`              |
| Decode failures carry a stable issue shape      | Types        | `ContractIssue`, `toContractIssues`     |
| The wire's issue matches the in-process one     | Types + Test | `contractIssueSchema`, type assertion   |
| An adapter kind is always a legal wire kind     | Types        | `AdapterErrorKind` ⊂ `ErrorKind`        |

Canonical drift must be loud: the schemas are strict, so an added field is a decode
failure rather than a silently ignored key. Vendor unknown-field accounting is a separate
mechanism, owned by `@fleet/adapters`, precisely because the two need opposite behaviour.

## 8. State, lifecycle and configuration

None. This package holds no state, starts nothing, and reads no configuration. Freshness
thresholds arrive as an argument; the file they are loaded from belongs to the server.

## 9. Failure behaviour

Every parse entry point returns a `ParseResult` discriminated union rather than throwing.
Failures are translated out of Zod into a `{ path, code, message }` issue shape so
consumers assert on categories rather than on Zod's prose, and no HTTP concern enters the
package.

That issue shape is the repository's only failure vocabulary (ADR 20): adapters carry it,
the HTTP error body embeds it unchanged, and the console renders `path` and `code` from
it. Two consequences live here. One Zod `unrecognized_keys` issue becomes one issue per
key, with the key in the path, so per-field detail survives the translation. And an issue
never holds a rejected value — only a path, a category and a schema-derived message —
which is what lets the server put these on the wire without leaking vendor payload
contents. `errorEnvelopeSchema` adds the status-free envelope around them; the status and
any operator wording stay in the server and the console respectively.

Notable accepted inputs, each a deliberate decision rather than an oversight:

- `reportedAt` later than `receivedAt` — vendor clock skew is real, and that inversion is
  exactly what the technician clock-delta readout exists to show.
- `batteryPercent` of `0.87` — a legal percentage. The contract cannot catch a missed
  Vendor A fraction-to-percentage conversion; that check belongs to the adapter contract
  tests.
- A never-reported robot uses `registeredRobotStateSchema`, not an envelope with nulled
  provenance, because a robot that has never reported has no telemetry instant to null
  out and a nullable field would invite one.

Rejected: whitespace-padded identifiers (trimming silently merges `"R-204 "` into
`"R-204"`), duplicate capability names, unknown capability names, and any unrecognized key.

## 10. Verification matrix

| Concern              | Check                                                                              |
| -------------------- | ---------------------------------------------------------------------------------- |
| Envelope round trip  | `parse` → `encode` is identity, capabilities in canonical order                    |
| Capability binding   | Cross-product: every name against every other name's payload fails                 |
| Capability kinds     | Derived sets partition all names, preserve order, and pin `sequence` as diagnostic |
| Strictness           | An added key is a decode failure, not a silent pass                                |
| Freshness boundaries | Exact threshold values, with an injected clock, at both edges                      |
| Freshness invariant  | `withFreshness` alters one field and nothing else                                  |
| Excluded fields      | An envelope carrying `sequence` or `rawPayload` is rejected                        |
| Public surface       | `index.test.ts` asserts the export list                                            |

103 tests.

## 11. Implementation status

**Complete.** All four modules are implemented and tested; lint, typecheck and build pass.

**Decision consequence.** Contracts exposes a strict pre-freshness `AdapterEnvelope`,
derives it and `CanonicalEnvelope` from one field list, and permits only `withFreshness`
to complete it; the type is in-process and never reaches web. Consumer-side evidence
remains pending until adapters and ingest exist ([ADR 10](../00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md)).

ADR 1's two open questions are answered in its `Observed consequences`: the capability
record earns its complexity, and `fault ⇒ critical` is **not** added as a contract-layer
invariant — the two fields stay independent and the presentation rule lives in the web
entity selector.

## 12. Change rules

- A new capability is a change **here first** — name and payload schema — and only then a
  panel mapping in `web` and a declaration in an adapter. This ordering is enforced by
  ADR 1, not by convention.
- A new vendor is **never** a change here. `vendorId` is an open identifier for exactly
  this reason; a `z.enum(["A","B","C"])` would make "adding a vendor never means editing
  the canonical envelope" false in the first file that implemented it.
- A change to a capability payload type is a change in `packages/adapters` (producer) and
  `packages/web/src/entities/robot/model.ts` (read-model mirror) in the same commit.
- Changing `SCHEMA_VERSION` requires a migration story for the server's stored state and
  the web store, and its own ADR.
