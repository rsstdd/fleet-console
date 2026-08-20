# `@fleet/adapters`

Three untrusted vendor telemetry dialects in, one canonical envelope out. This is the
only package in the repository that knows a vendor's field names, units, or status
words: `packages/server` decodes through a single function and never imports a vendor
module (ADR 1).

## What a vendor dialect is

A dialect is one vendor's wire format — its shape, its units, its vocabulary, and which
facts it reports at all. The three modelled here disagree on every one of those, and the
disagreements are load-bearing fixtures rather than incidental flavour.

|                   | Vendor A                          | Vendor B           | Vendor C                         |
| ----------------- | --------------------------------- | ------------------ | -------------------------------- |
| Payload shape     | nested                            | flat               | nested, broadly A-shaped         |
| Battery           | fraction `0..1`                   | integer percent    | fraction `0..1`                  |
| Distance          | metres                            | centimetres        | metres                           |
| Timestamp         | ISO-8601 string                   | epoch milliseconds | ISO-8601 string                  |
| Status            | words                             | integer codes      | words                            |
| Capabilities      | `dock`, `lidarHealth`, `sequence` | `dock`             | `dock`, `waterLevel`, `sequence` |
| Undeclared fields | none                              | none               | `telemetry.firmware_channel`     |

Every adapter's module comment carries its mapping tables — status and health for all
three, plus dock state for vendor B, whose dialect spells it as an integer — and every
row is asserted by a test, including the codes no recorded payload happens to carry.
Those tables are the reviewable artefact: read them before the code.

Two consequences that are easy to get wrong:

- **An absence is a declaration.** Vendor B sends no counter, so it declares no
  `sequence` capability, and the server states that robot's continuity as
  `{ evaluated: false }` rather than zero gaps. Reporting `0 gaps` for a vendor that
  sends no sequence at all is a false statement to an operator (ADR 25). Synthesizing a
  counter here would delete the one ambiguity vendor B exists to demonstrate.
- **Two dialects agreeing is a coincidence, not a shared contract.** Vendors A and C
  spell their four states identically; each adapter restates the table rather than
  importing the other's, and lint refuses the cross-vendor import. What genuinely is
  shared lives in `src/core/units.ts`, because a unit conversion has one right answer
  while a vocabulary mapping is a per-dialect fact.

## The one way in

```ts
import { createAdapterRegistry } from "@fleet/adapters";

const registry = createAdapterRegistry(); // once per process

const result = registry.decodeTelemetry("A", await request.json(), clock.now());

if (result.ok) {
  result.value; // AdapterEnvelope: every canonical field except freshness
} else {
  result.error; // { kind, vendor, issues }
}

registry.unknownFields(); // the per-adapter tally the health endpoint serves
```

`createAdapterRegistry()` takes no arguments, because it owns the one unknown-field
ledger a process is allowed. A ledger parameter would let a caller pass a fresh one per
request, leaving every tally at 0 or 1 with no test failing (ADR 1, ADR 15). Dispatch is
a `switch` over `SupportedVendor` rather than a lookup table, so a fourth vendor is a
compile error instead of a `VendorAdapter | undefined`.

The per-vendor factories, the ledger constructor and the unknown-field path helpers are
**internal**: they are what an adapter is written with, not what a consumer decodes
through. A consumer holding `createVendorCAdapter` would be bound to one dialect at a
call site outside this package, which is the vendor conditional ADR 1 keeps on this side
of the boundary — and no lint rule would catch it, so the name is simply not exported.

`@fleet/adapters/testing` is the second and last public path: the recorded fixtures, for
tests in this package and in others (ADR 11). It carries no production behaviour, and
importing it from production code fails lint in every consuming package.

## Receipt time comes in; freshness never goes out

`receivedAt` is the third parameter because ADR 3 gives the only clock this repository
trusts to the server boundary — `packages/server/src/runtime/clock.ts` is the single
wall-clock reader, and `no-restricted-globals` bans the `Date` global outright here.
That ban is also why `src/core/isoInstant.ts` parses ISO-8601 by hand.

So an adapter has no legal way to build a `CanonicalEnvelope`: it would have to assert
the one field it cannot derive. `AdapterEnvelope` is every canonical field except
`freshness` (ADR 10), and the server completes it with `withFreshness`.

Three canonical fields have no vendor source at all, and one vendor field has no
canonical home. Each is answered explicitly in the adapter rather than by default —
`connectivity` is a constant `"unknown"` because no dialect reports link state, and a
reported heading is dropped but still declared in the vendor schema so the ledger stays
quiet about it. ADR 30 is the record; the rule it leaves behind is that anything you
deliberately drop, you declare.

## Failure is a value

No adapter throws. Every rejection is an `AdapterError` carrying `ContractIssue[]` — the
repository's one failure vocabulary (ADR 20) — which `packages/server` copies onto the
wire unchanged rather than mapping.

| `kind`              | Means                                                           |
| ------------------- | --------------------------------------------------------------- |
| `malformed_payload` | the vendor's own schema rejected the payload                    |
| `unmappable_value`  | the schema accepted it; a value has no honest canonical mapping |

The distinction is worth keeping. A status code outside vendor B's table is not canonical
`unknown`: `unknown` would say the robot's state is unknown, when what is actually
unknown is the _code_. That is an integration defect, and it is reported as one instead
of showing an operator a state nobody reported. No issue message ever interpolates a
payload value, so an error body can be returned without anything to redact.

Fields a vendor sends that no schema declares are **counted, not dropped** — per adapter
and never per robot, at their dotted path. The tally carries `scope: "accepted"` as data,
because it counts only payloads a vendor schema accepted; the server's malformed-ingest
counter is the other population, and the two must never be summed (ADR 15).

## Adding a fourth vendor

Measured rather than asserted: adding `"D"` to `SupportedVendor` and typechecking the
workspace fails in exactly three files, all of them here.

1. `src/core/vendor.ts` — add `"D"` to `SupportedVendor` and `SUPPORTED_VENDORS`.
2. `src/vendors/d/` — `schema.ts` (loose, so unknown fields survive to be counted),
   `adapter.ts` (a `createVendorDAdapter(ledger)` factory with its mapping tables in the
   module comment), and the contract test beside them.
3. `src/registry.ts` — one `case "D":`.
4. `src/core/unknownFields.ts` — one key in the snapshot literal.
5. `src/testing/fixtures.ts` — the fixture imports and the two registries.
6. `packages/simulator/src/vendors/vendorD.ts` — the producing dialect, then
   `pnpm record:fixtures` from the repository root. Fixture JSON is generated: review
   it, never edit it, and CI re-records and fails on any diff (ADR 13).

So "one directory plus one registry line" undercounts by two. Both extra literals are
written out per vendor on purpose, so that a gap is a compile error rather than a
missing key.

**What may not change is the canonical model.** Not one file in `packages/contracts`
fails when a fourth vendor is added — `vendorId` is an open identifier precisely so that
a new vendor is never a contracts change. Tests fail in the simulator (no producer), the
server (`fleetManifest`, `selectIngestVendor`) and web (no recorded fixture), which is
the point: an unbacked vendor cannot reach production quietly.

If a fourth dialect reports something canonical has no field for, it becomes a
**declared capability** — added to `packages/contracts` first, with its payload schema
and capability kind (ADR 19) — and never a vendor-only field on the core, and never a
vendor conditional downstream.

## Commands

```bash
pnpm --filter @fleet/adapters test           # vitest, once
pnpm --filter @fleet/adapters test:watch
pnpm --filter @fleet/adapters test:coverage  # printed into CI, gates nothing (ADR 22)
pnpm --filter @fleet/adapters typecheck
pnpm --filter @fleet/adapters lint           # eslint + typecheck
pnpm --filter @fleet/adapters build          # typecheck only; the package is source-exported
```

`eslint.config.js` carries this package's boundary rules — the wall-clock ban, the
cross-vendor import ban, the workspace import allow-list — and
`src/__enforcement__/enforcement.test.ts` lints deliberate violations on disk to prove
each rule still fires.
