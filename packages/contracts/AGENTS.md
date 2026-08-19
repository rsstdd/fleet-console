# AGENTS.md

This package is the framework-independent authority for the fleet console's canonical contracts: robot envelopes, capability payloads, wire schemas, and pure freshness derivation.

The repository-level [`AGENTS.md`](../../AGENTS.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs remain binding. This file adds contracts-specific instructions; it does not replace them.

## Package responsibilities

- Define the canonical robot envelope and its runtime Zod schemas.
- Define canonical status, health, connectivity, position, provenance, schema-version, and capability types.
- Define each capability name together with its payload shape and wire representation.
- Decode canonical payloads received across process or network boundaries; TypeScript types alone are not runtime validation (Principle 2).
- Provide the pure freshness state function used by `packages/server`, with time and policy supplied explicitly (ADR 3).
- Expose stable public contracts consumed by adapters, server, simulator, and web without importing from those packages.

This package does not own vendor dialect decoding, transport, persistence, interval scheduling, client state, or rendering. Those belong to `packages/adapters`, `packages/server`, `packages/simulator`, and `packages/web`.

## Dependency boundary

- Keep contracts framework-independent and side-effect free.
- Do not import from another workspace package. Higher-level packages depend on contracts, never the reverse.
- Do not depend on React, Material UI, server frameworks, transport clients, storage libraries, timers, environment variables, or tenant configuration.
- Keep domain rules pure. Any I/O, clock reading, recurring sweep, metric update, or state mutation belongs in the consuming package.
- Export supported consumers through the package's public entry point; do not make downstream packages rely on internal file paths.

## Canonical model

- Keep only meaning genuinely shared by all vendors in the normalized core: robot identity, connectivity, battery, position, status, and health.
- Preserve provenance with distinct epoch-millisecond fields: `reportedAt` is the vendor-reported telemetry instant; `receivedAt` is the server receipt instant. Never collapse or substitute them.
- Keep canonical status (`idle | busy | charging | fault | unknown`) separate from health severity (`nominal | degraded | critical`). Add cross-field invariants to the schema only when they are true for every vendor.
- Represent vendor differences as declared capabilities, not optional vendor fields on the core and never vendor-name branches.
- Model runtime capabilities as `Partial<Record<CapabilityName, CapabilityPayload>>`, where key presence is the declaration. Do not add a parallel capability set.
- The initial capability names are `dock`, `lidarHealth`, `waterLevel`, and `sequence`. Each name must map to the correct payload type.
- Represent capabilities on the wire as an array of key-payload entries and transform it with Zod into the runtime record so JSON serialization preserves the contract (ADR 1).
- Include an explicit schema version and evolve it deliberately. Do not silently reinterpret an existing version.
- Keep raw vendor payloads outside fleet read models and WebSocket deltas. If a diagnostic endpoint needs a raw payload contract, model it as a separate boundary type rather than weakening the canonical fleet envelope.

## Schema design

- Treat all external values as `unknown` until parsed by the appropriate exported schema.
- Reject malformed, missing, unsupported-version, and invalid cross-field data; do not coerce it into a plausible value.
- Decide additional-field behavior explicitly and test it. Canonical schemas must not silently hide contract drift.
- Derive TypeScript types from schemas where practical so runtime and compile-time contracts cannot drift.
- Use discriminated unions or equivalent types where variants have different valid fields.
- Keep encode/decode transforms deterministic, lossless for supported canonical data, and safe across JSON round trips.
- Avoid defaults that conceal a missing producer field. A default is acceptable only when the contract defines omission as that exact value.

## Freshness contract

- Define the four freshness states as `live`, `stale`, `unreachable`, and `unknown` using the repository's established casing convention at each boundary.
- Keep freshness derivation a pure function of `receivedAt`, an injected current time, and an explicit policy. It must not read the wall clock itself.
- Preserve the ADR 3 policy semantics: no telemetry is `unknown`; age up to 2 seconds is `live`; age up to 10 seconds is `stale`; older telemetry is `unreachable`. Make threshold inclusivity explicit in tests.
- Never use `reportedAt` to derive freshness. It remains the operator-facing last-seen timestamp.
- Do not implement the recurring 500 ms sweep here. `packages/server` schedules the sweep and applies this package's pure function to its current-state store.
- A freshness-only transition must not alter `reportedAt` or any observed telemetry value.

## Tests

- Prefer test-driven changes: add or update the focused test before implementation (Principle 10).
- Test schemas with valid, missing, malformed, boundary, additional-field, unsupported-version, and JSON round-trip cases.
- Test capability wire-array transformation, duplicate or unknown capability names, payload/name mismatches, and runtime-record key presence.
- Test freshness with an injected clock at, immediately below, and immediately above every threshold, plus absent telemetry and future/skewed receipt times according to the documented policy.
- Add compile-time type tests when an invariant is primarily structural, but pair them with runtime tests for untrusted input.
- Keep fixtures deterministic and assertions explicit. Avoid snapshots when named assertions communicate the invariant more clearly.
- When a contract changes, run affected adapter contract tests and server/web consumer tests in addition to this package's checks.

## Change rules

- A new vendor is not a contracts change. Add its adapter and fixtures under `packages/adapters` unless it introduces genuinely new shared meaning or a deliberately approved capability (Principle 3).
- A new capability starts here: define its name, payload schema, runtime mapping, wire representation, and tests before adapters or UI consume it.
- Changing an existing field's meaning, units, requiredness, or serialized shape requires deliberate versioning and coordinated consumer changes; do not make an in-place breaking reinterpretation.
- Document non-trivial coupling on both sides of a cross-package change with comments naming the related module (Principle 14).
- Add a one-sentence doc comment to every exported class, function, and type (Principle 14).
- Keep changes focused. Do not combine a contract evolution with unrelated cleanup.
- If a request conflicts with `PRINCIPLES.md` or an ADR, stop and surface the conflict rather than working around it.

## Verification

Run the narrow contracts tests first, then this package's typecheck and lint commands. For public-contract changes, also run the affected adapter, server, simulator, and web checks, followed by the repository test command. If package scripts do not yet exist, use the nearest repository-level commands documented in the root `README.md` or workspace configuration; do not invent undocumented local setup.

## Task routing

Read one matching row, then its narrow follow-up; do not preload every schema or ADR.

| Task                                                         | Start here                              | Then narrow to                                         |
| ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------ |
| Public exports or package status                             | `packages/contracts/src/index.ts`       | `docs/03_package-specs/01_CONTRACTS.md`                |
| Scalar, identifier, status, health, or parse-result rules    | `src/shared/primitives.ts`              | Colocated `.test.ts`                                   |
| Capability names, kinds, payloads, or wire encoding          | `src/capabilities/capabilitySchemas.ts` | Colocated test; D11 mapping in `docs/decisions.json`   |
| Canonical, adapter, snapshot, batch, or diagnostic envelopes | `src/envelope/envelopeSchema.ts`        | Colocated test; relevant D-id in `docs/decisions.json` |
| Error response schema and issue vocabulary                   | `src/errors/errorEnvelopeSchema.ts`     | Colocated test; D16 mapping                            |
| Health response and counter scopes                           | `src/health/healthResponseSchema.ts`    | Colocated test; D12 mapping                            |
| Freshness state derivation or thresholds                     | `src/freshness/deriveFreshness.ts`      | Colocated test; ADR 3                                  |
| Dependency/lint enforcement                                  | `eslint.config.js`                      | `src/index.test.ts` for public-surface enforcement     |
