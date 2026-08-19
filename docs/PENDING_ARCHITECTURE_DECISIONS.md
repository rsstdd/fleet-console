# Pending architecture decisions surfaced by package audit

**Created:** 19 August 2026
**Status:** Decision stubs only — none of the positions below is ratified by this file.

## Purpose

Package TODOs and implementation comments currently make several durable cross-package
choices that are not recorded in the accepted ADR set. This register prevents those
choices from becoming architecture merely because code lands first.

For each item, resolve the question by amending the named ADR or by promoting the stub
to its own numbered ADR using `docs/00_adr/00_TEMPLATE.md`. Update implementation,
package documentation, tests, and ADR observed consequences together. Delete a stub
only after its decision has an authoritative home.

## D1 — Shape crossing the adapter/server boundary

**Question:** What validated type does a vendor adapter return before the server-owned
freshness sweep has supplied freshness?

**Current package position:** Add `adapterEnvelopeSchema`, containing every canonical
envelope field except `freshness`. Adapters return its inferred `AdapterEnvelope` and
the server converts it to `CanonicalEnvelope` through the single authoritative
freshness constructor.

**Implementation:** Not started. `canonicalEnvelopeSchema` still requires freshness and
`withFreshness` still accepts only an already-canonical envelope. This position exists
only in `packages/contracts/TODO_E2E_JOIN.md`.

**Alternatives:**

1. Adapter returns a validated pre-freshness envelope.
2. Adapter returns separately validated identity, core, provenance, and capability
   parts; server assembles the envelope.
3. Adapter supplies placeholder freshness. This conflicts with ADR 3 and is not viable
   unless ADR 3 is superseded.

**Affected decisions:** ADR 1 (adapter boundary), ADR 3 (freshness authority).

**Required evidence:** One adapter contract test and one server ingest test proving an
adapter cannot assert freshness and that the server produces a canonical envelope
without bypassing schema validation.

**Artifacts that move together:**

- `packages/contracts/src/envelope/*`
- `packages/adapters` public adapter result
- `packages/server` ingest/upsert composition
- `packages/contracts/TODO_E2E_JOIN.md`
- ADR 1 and ADR 3 status, implications, and observed consequences

## D2 — Public access to recorded adapter fixtures

**Question:** How may another workspace package consume the exact recorded payload used
by adapter contract tests without deep-importing adapter internals or copying bytes?

**Current package position:** Add an explicit `@fleet/adapters/testing` export containing
a browser-test-safe fixture API.

**Implementation:** Not started. The adapters export map contains only `"."`; no vendor
fixtures or testing entry point exist.

**Alternatives:**

1. Public test-only package subpath such as `./testing`.
2. Plain JSON fixture subpath with no Node-only loader.
3. Dedicated integration-test package that owns cross-package fixtures.
4. Deep imports or copied fixtures. Both undermine the export boundary and should be
   rejected unless the package API rule changes.

**Affected decisions:** ADR 1 (load-bearing fixtures), ADR 9 (workspace export maps).

**Required evidence:** Import smoke tests from adapters and web, production bundle proof
that the test surface is absent, and a failure test showing deep imports remain blocked.

**Artifacts that move together:**

- `packages/adapters/package.json` exports
- adapter fixture loader or JSON exports
- `packages/web` joining test
- adapter and web dependency-enforcement tests
- `packages/adapters/TODO_E2E_JOIN.md`
- ADR 1 and ADR 9

## D3 — Test-only dependency from web to adapters

**Question:** Is `packages/web` permitted to depend on `@fleet/adapters` in tests while
production entity and feature code remains forbidden from importing it?

**Current package position:** Keep `@fleet/adapters` as a web dev dependency, ban the
specifier package-wide in production code, and lift the ban only for tests that join a
raw vendor fixture to the browser read model.

**Implementation:** Partially implemented. The dev dependency, production import ban,
test override, and positive/negative enforcement fixtures exist. The joining test and
adapter testing export do not.

**Alternatives:**

1. Test-only dependency plus mechanically tested lint exception.
2. Move the joining test to a dedicated integration package allowed to import both.
3. Stop the E2E path at the canonical wire boundary and test adapter and web halves
   independently. This provides weaker cross-package evidence.

**Affected decisions:** ADR 4 (web dependency direction), ADR 7 (enforcement must be
non-vacuous), ADR 9 (workspace dependencies and source exports).

**Required evidence:** A legal test import, an illegal production import, and a
production-bundle comparison proving adapters do not reach browser output.

**Artifacts that move together:**

- `packages/web/package.json`
- `packages/web/eslint.config.js`
- web boundary fixtures and joining test
- `packages/web/src/entities/robot/TODO.md`
- ADR 4, ADR 7, and ADR 9

## D4 — Ownership and provenance of vendor fixtures

**Question:** Are adapter fixtures hand-authored examples, or recorded output from the
simulator's authoritative raw dialect generators?

**Current package position:** Record deterministic simulator output at a pinned seed and
instant, commit it under adapters, and keep adapters free of a production dependency on
simulator. Dialect changes require an explicit re-recording step and coupling comments
on both sides.

**Implementation:** Not started on the adapter side. Deterministic simulator generators
exist, but adapters has no recorded vendor fixtures or re-recording procedure.

**Alternatives:**

1. Recorded simulator output with no runtime dependency.
2. Hand-authored adapter fixtures independently checked against vendor schemas.
3. Generate fixtures during tests by importing simulator. This creates a test-time
   dependency and risks testing producer and consumer against the same defect.

**Affected decisions:** ADR 1 (fixtures are primary adapter evidence), potentially ADR 9
if fixture generation adds a workspace dependency or command.

**Required evidence:** Deterministic re-record command or documented procedure, exact
adapter outputs for all vendors, and a guard that detects simulator/fixture dialect
drift without placing adapter logic in the simulator production path.

**Artifacts that move together:**

- `packages/simulator/src/vendors/*`
- `packages/adapters/src/vendors/*/__fixtures__/*`
- adapter contract tests
- coupling comments in both packages
- `packages/adapters/TODO_E2E_JOIN.md`
- ADR 1 observed consequences

## D5 — Unknown-field accounting for rejected payloads

**Questions:** What counts as an unknown vendor field, how are nested paths represented,
and when a payload is both malformed and contains unknown fields, does the adapter count
those fields or only the malformed rejection?

**Current package position:** Count unknown fields only after the payload otherwise
passes its vendor schema. Rejected payloads increment malformed/adapter-failure metrics
but do not change the unknown-field ledger. For accepted payloads, the adapters TODO
recommends passthrough schemas plus a shared key-difference walk that emits dotted paths;
that detection mechanism is a recommendation, not yet a decision.

**Implementation:** The process-wide ledger exists and accepts arbitrary field paths.
Vendor schemas, unknown-field detection, adapter calls into the ledger, ingest rejection
metrics, and health HTTP exposure do not.

**Alternatives:**

1. Count unknown fields only on accepted payloads.
2. Perform a safe top-level key comparison before full validation and count unknowns on
   both accepted and rejected payloads.
3. Maintain two explicit counters: accepted-payload unknowns and rejected-payload
   unknowns.

For detection on otherwise accepted payloads, decide separately among strict-schema
error inspection, passthrough plus an explicit known-path comparison, or a loose schema
plus post-parse comparison. Strict rejection alone cannot satisfy ADR 1's requirement to
accept and count an otherwise valid payload carrying an additional field.

**Affected decisions:** ADR 1 (unknown fields are counted rather than silently dropped),
ADR 2 (boundary rejection and observability semantics).

**Required evidence:** Tests for valid-plus-unknown, malformed-plus-unknown, nested
unknowns, and a payload too malformed to inspect safely. Health labels must state the
scope precisely.

**Artifacts that move together:**

- adapter schema/unknown-field traversal
- process-wide unknown-field ledger
- server malformed and adapter-failure metrics
- health endpoint shape and documentation
- `packages/adapters/TODO.md`
- ADR 1 and, if transport metrics change, ADR 2

## D6 — Ownership and loading of shared fleet configuration

**Question:** Who owns `config/freshness.json` and `config/fleet-manifest.json`, and must
server and simulator consume the same manifest file or only produce compatible roster
shapes?

**Current package position:** Repository-root `config/` is deployment configuration.
The server strictly reads both files. The simulator independently generates its fleet
from CLI/defaults and can print a manifest-compatible roster with `--print-manifest`; it
does not read `fleet-manifest.json` or `freshness.json`. No package imports the other's
configuration implementation.

**Implementation:** Root files and the server loader are implemented and tested. The
simulator manifest printer is implemented. There is no test proving the shipped manifest
equals a simulator configuration, and the normal simulator process does not consume the
shipped roster.

**Alternatives:**

1. Root files with independently tested decoders in each consumer.
2. A small configuration package exporting schemas/loaders to both.
3. Server reads the committed manifest while simulator generates a compatible roster
   from the same explicit inputs; a checked generation command/test guards equality.
4. Package-local copies. This risks a manifest robot that remains UNKNOWN forever
   because the simulator and server disagree.
5. Server-only manifest plus discovery from server to simulator, which adds a new
   runtime dependency and startup sequence.

**Affected decisions:** ADR 3 (manifest population and freshness thresholds), ADR 9 if a
new shared package is introduced.

**Required evidence:** The server rejects malformed configuration; whichever simulator
input strategy is chosen produces exactly the shipped robot identifiers; missing or
invalid required configuration fails startup rather than silently defaulting; and
one-command startup resolves paths from a clean clone. If the simulator remains a
generator rather than a file consumer, do not require it to decode freshness policy it
does not use.

**Artifacts that move together:**

- root `config/`
- server configuration loader and startup
- simulator configuration/manifest handling and startup
- root and package READMEs
- ADR 3 status and observed consequences

## D7 — Authority and drift guard for the supported-vendor set

**Question:** Where is the finite set of supported ingest adapters authoritative, and
how does the simulator's deliberately independent vendor set stay aligned with it?

**Current package position:** `packages/adapters` owns
`SUPPORTED_VENDORS`/`SupportedVendor`; simulator restates `VENDOR_IDS` to avoid a
production dependency on adapters. A test-only comparison is intended to guard the
duplication.

**Implementation:** Both identical literals exist. The documented guard does not:
`simulatedRobot.ts` names a nonexistent `vendorId.test.ts` and incorrectly calls the
adapter type `VendorId`. Simulator has no adapter dev dependency and no test compares
the sets.

**Alternatives:**

1. Keep independent production sets and compare them through a test-only adapters
   dependency.
2. Keep the contract's vendor identifier open and use an integration fixture test to
   prove every simulated vendor has an adapter, without a simulator package dependency.
3. Move the supported set into contracts. This makes adding a vendor a contracts change
   and conflicts with ADR 1 unless that consequence is explicitly accepted.

**Affected decisions:** ADR 1 (a fourth vendor should not change the canonical model),
ADR 9 (test-only workspace dependencies and exports).

**Required evidence:** A test that fails if the simulator emits a vendor for which no
adapter is registered, without importing adapters in the simulator production path.

**Artifacts that move together:**

- `packages/adapters/src/core/vendor.ts`
- `packages/simulator/src/fleet/simulatedRobot.ts`
- the chosen cross-package guard and package manifest
- coupling comments on both declarations
- ADR 1 observed consequences and, if needed, ADR 9

## D8 — Tenant configuration source, validation, and feature flags

**Question:** Where does deployment tenant configuration come from, how is it validated,
what is the failure/fallback policy, and which concrete feature flag distinguishes the
second tenant profile?

**Current package position:** Web exports a typed module literal (`TENANT`) and a stable
context default. No external loader, runtime schema, fallback path, or feature-flag field
exists. The design system says Tenant B disables one panel but does not name it.

**Implementation:** Typed static identity/theme selection exists; validation, loading,
fallback behavior, and flags are not implemented.

**Alternatives:**

1. Build-time validated tenant configuration, one deployment tenant per build.
2. Startup-loaded validated configuration with a documented safe fallback.
3. Server-provided tenant configuration decoded by web, which adds a transport and
   startup dependency.
4. Remove the unimplemented Tenant B flag claim and keep theme/wordmark-only static
   configuration for the current scope.

**Affected decisions:** ADR 5 (tenant profiles and token themes), Principle 13 (typed and
validated deployment configuration). Promote this to a new ADR if configuration becomes
server-provided or otherwise crosses package/deployment boundaries.

**Required evidence:** Invalid-input tests, stable provider identity, both theme
profiles, and one test proving wordmark, theme, and the named flag change together—or a
docs change removing the flag promise.

**Artifacts that move together:**

- `packages/web/src/config/tenant.ts`
- `packages/web/src/app/tenantConfigContext.ts`
- tenant-aware panel composition
- app-shell tests and component-gallery tenant cases
- `docs/DESIGN_SYSTEM.md` and app-shell spec
- ADR 5 or a new tenant-configuration ADR

## Existing ADR reconciliation required alongside these decisions

This is metadata/prose repair, not another architectural decision:

- ADR 1 is partially implemented but says Not started and retains stale artifact notes.
- ADR 2 has implemented producer/coalescer pieces but no server transport; its status
  should describe that boundary accurately.
- ADR 3 has contracts and server primitives but no live transport or web suppression;
  its status and “no code exists” notes are stale.
- ADR 6 has an implemented 60-entry ring buffer and current-state store while its header
  and related-artifact prose still say Not started.
- ADR 9 must reconcile its top-level `tsx` statement with its simulator exception and
  the currently unused server `tsx` dependency.

Do not mark an ADR Implemented merely because its pure primitives exist. Status must
describe the complete decision, including the cross-package path the decision promises.
