# `@fleet/contracts`

The canonical robot envelope, the declared-capability contract, the runtime wire
schemas, and the pure freshness derivation. Framework-independent, side-effect
free, and the bottom of the workspace dependency graph.

## What lives here

| Concern                                                       | Module                                  |
| ------------------------------------------------------------- | --------------------------------------- |
| Identifiers, timestamps, status/health/freshness vocabularies | `src/shared/primitives.ts`              |
| Capability payloads, wire array ⇄ runtime record              | `src/capabilities/capabilitySchemas.ts` |
| Canonical envelope, diagnostic envelope, delta batch          | `src/envelope/envelopeSchema.ts`        |
| Pure freshness function and its policy                        | `src/freshness/deriveFreshness.ts`      |
| HTTP error body and the shared error-kind vocabulary          | `src/errors/errorEnvelopeSchema.ts`     |

## What does not

Vendor dialect decoding (`packages/adapters`), transport and the freshness sweep
(`packages/server`), telemetry production (`packages/simulator`), and rendering
(`packages/web`). This package imports no other workspace package, no framework,
no transport, no storage, and no clock — `eslint.config.js` enforces the last two
directly.

## Canonical versus vendor

A field belongs to the normalized core only if **every** adapter can populate it
from its own dialect: identity, connectivity, battery, position, status, health,
and the two timestamps. Anything one vendor has and another does not is a
**declared capability**, and key presence in the capability record is the
declaration itself. A core field that is simply empty for some vendors is the
failure mode ADR 1 and Principle 3 exist to prevent.

Adding a fourth vendor is an adapter module plus fixtures in `packages/adapters`.
It is never a change here. That is why `vendorId` is an open identifier rather
than `z.enum(["A", "B", "C"])`.

## Parsing untrusted input

Everything crossing a boundary starts as `unknown`. Types are inferred from the
schemas, never declared beside them.

```ts
import { parseCanonicalEnvelope } from "@fleet/contracts";

const result = parseCanonicalEnvelope(await request.json());

if (!result.ok) {
  // Stable issue shape: { path, code, message }. Assert on code and path,
  // never on Zod's prose. HTTP status mapping belongs to packages/server.
  return reject(result.issues);
}

result.value.core.status; // "idle" | "busy" | "charging" | "fault" | "unknown"
```

Canonical schemas are **strict**: an unrecognized field is rejected rather than
stripped, because canonical drift must be loud. Vendor unknown fields are a
different problem, counted per adapter rather than dropped (ADR 1).

## One failure vocabulary

`ContractIssue` is the only description of a decode failure in this repository
(ADR 20). An adapter's `AdapterError` carries `readonly ContractIssue[]`, the
server's HTTP error body carries the same values unchanged, and the console
renders `path` and `code` from them. Nothing translates between hops, so no
per-field detail is lost on the way.

```ts
import { parseErrorEnvelope } from "@fleet/contracts";

const body = parseErrorEnvelope(await response.json());

if (body.ok) {
  body.value.error.kind; // "malformed_payload" | "unsupported_vendor" | …
  body.value.error.issues; // the decoder's own issues, per field
}
```

Three properties are worth knowing:

- **An issue carries no rejected value.** Only a path, a stable category, and a
  message derived from the schema. That is what lets an error body be returned
  without leaking vendor payload contents — there is nothing to redact. Field
  _names_ do travel, and are the detail a technician reads.
- **One Zod `unrecognized_keys` issue becomes one issue per key**, with the key
  in the path (`freshness`, `core.unexpected`), so the vocabulary keeps three
  fields for every code and the detail arrives as more issues.
- **`ERROR_KINDS` is closed, and `ADAPTER_ERROR_KINDS` is a subset of it.** The
  server copies an adapter's `kind` onto the wire rather than mapping it; the
  HTTP status and any operator wording are added downstream, never here.

## Capabilities: wire and runtime

One contract, two representations. The wire form is an array so JSON preserves
it; the runtime form is a mapped record so absence is a first-class fact.

```ts
import { capabilitiesWireSchema, encodeCapabilities } from "@fleet/contracts";

// wire → runtime
const capabilities = capabilitiesWireSchema.parse([
  { name: "dock", payload: { docked: false, dockId: "dock-3" } },
  { name: "waterLevel", payload: { percent: 42 } },
]);
// { dock: {...}, waterLevel: {...} }

"lidarHealth" in capabilities; // false — this robot does not declare it

// runtime → wire, in canonical name order
encodeCapabilities(capabilities);
```

The wire entry schema is discriminated on `name`, so `{ name: "dock", payload:
<waterLevel payload> }` is rejected by the schema rather than by review.
Duplicate names are rejected too: two entries for one capability mean the
producer holds two beliefs about one fact, and picking one discards the evidence.

## Freshness

The pure half of ADR 3. The recurring 500 ms sweep is `packages/server`'s job;
this function only answers the question, and only from receipt time.

```ts
import { DEFAULT_FRESHNESS_POLICY, deriveFreshness, withFreshness } from "@fleet/contracts";

deriveFreshness({ receivedAt: envelope.receivedAt, now: clock.now() });
// "live" ≤ 2000ms · "stale" ≤ 10000ms · "unreachable" beyond · "unknown" when receivedAt is null

const swept = withFreshness(envelope, "stale"); // changes nothing else
```

`DeriveFreshnessInput` has no `reportedAt` field. ADR 3 requires freshness to
read receipt time exclusively, and leaving the vendor instant out of the
signature makes that structural rather than a rule to remember. `reportedAt`
remains the operator-facing "last seen" value, which is why a freshness-only
transition cannot disturb it.

`FreshnessPolicy` carries thresholds only. `sweepIntervalMs` sits beside them in
`config/freshness.json` but describes how often the server calls this function,
not how the answer is computed.

### What an adapter returns, and why it is not a canonical envelope

Freshness belongs to the server's sweep alone, so an adapter has no legal way to
build a `CanonicalEnvelope` — it would have to invent the one field it may not
assert. `adapterEnvelopeSchema` is the shape it _can_ produce: every canonical
field except `freshness`, strict like the rest, capabilities decoded the same
way. `withFreshness` completes it.

```ts
import { parseAdapterEnvelope, deriveFreshness, withFreshness } from "@fleet/contracts";

// in packages/adapters — no clock, no freshness
const produced = parseAdapterEnvelope(mappedFromVendorPayload);

// in packages/server ingest — the one field the adapter could not supply
const canonical = withFreshness(produced.value, deriveFreshness({ receivedAt, now: clock.now() }));
```

Three things worth knowing before using it (ADR 10):

- **It never goes on the wire.** This type exists between an adapter and the
  ingest handler; the canonical envelope is what is stored, fanned out and
  serialized. It has no place in `packages/web`.
- **The two shapes are derived from one field list**, so a new canonical field
  reaches both. A compile-time assertion in `envelopeSchema.test.ts` fails if
  someone stops deriving them.
- **An adapter that supplies `freshness` is rejected**, not silently
  overwritten: the schema is strict, so the extra key fails with an
  `unrecognized_keys` issue whose path is `freshness`.

`withFreshness` is deliberately the only function that writes freshness — the
sweep's write and ingest's completion are the same call. A second constructor
would reopen the question ADR 3 closed.

## Schema version

`SCHEMA_VERSION` is `"3"`. Every envelope carries it and every schema matches it
exactly — an envelope declaring any other version is rejected, never
reinterpreted under current rules. Version 2 added the required
`serverSessionId` on snapshots and batches (ADR 31); version 3 added the
required `sites` directory on fleet snapshots with no compatibility fallback
(ADR 34). Changing a field's meaning, units, requiredness, or serialized shape
means a deliberate version bump with coordinated consumer changes.

## Commands

```bash
pnpm --filter @fleet/contracts test           # vitest, once
pnpm --filter @fleet/contracts test:watch
pnpm --filter @fleet/contracts test:coverage  # branch-weighted thresholds
pnpm --filter @fleet/contracts typecheck
pnpm --filter @fleet/contracts lint           # eslint + typecheck
pnpm --filter @fleet/contracts build          # typecheck only; see below
```

The package is consumed as **source** through `exports: { ".": "./src/index.ts" }`,
matching `@fleet/adapters`, `@fleet/server`, and `@fleet/simulator`, so `build`
is a typecheck rather than an emit and there is no dist to keep in sync. The
public-API smoke test in `src/index.test.ts` imports `@fleet/contracts` by name
rather than by relative path, so the exports map is exercised on every run.
