**Annotated architecture-decision register**
_(Educational expansion of the original stubs. Each alternative is explained in plain terms, then weighed with concrete pros/cons so a reader can see the trade-offs that the package audit is forcing into the open.)_

---

# Pending architecture decisions surfaced by package audit

**Created:** 19 August 2026
**Status:** Decision stubs only — none of the positions below is ratified by this file, including the recommendations. A recommendation here is a defensible starting position with its reasoning and its falsifier attached, not an authority; the ADR set is the authority.

## Purpose

Package TODOs and implementation comments currently make several durable cross-package choices that are not recorded in the accepted ADR set. This register prevents those choices from becoming architecture merely because code lands first.

For each item, resolve the question by amending the named ADR or by promoting the stub to its own numbered ADR using `docs/00_adr/00_TEMPLATE.md`. Update implementation, package documentation, tests, and ADR observed consequences together. Delete a stub only after its decision has an authoritative home.

## Scope and completeness of this register

**Audited:** 19 August 2026, against every package under `packages/` (source, `TODO.md`,
`TODO_E2E_JOIN.md`, `FIXME.md`, per-slice TODOs under `packages/web/src`), the shipped
`config/` files, ADRs 1–9, and `docs/ARCHITECTURE_AUDIT.md`.

**D1–D8 were not exhaustive.** They cover the adapter/server seam and the
fixture/test-dependency boundary, which is where the audit that produced them was
looking. **D9–D18** are the durable cross-package choices found in the same sweep that
have no authoritative home. Four of them — **D10**, **D11**, **D12**, **D18** — are already
encoded in shipped code with no decision record behind them, which is precisely the
failure mode the Purpose section above describes.

Decisions found during this pass that turned out to be **already ratified** are not
repeated as stubs: the server-wide flush sequence and per-client coalescing (ADR 2 §
Decision, amended 19 August 2026), the late-tick tolerance as a fourth key in
`config/freshness.json` (ADR 3 § Constraints), the transport libraries (ADR 8), and the
ring-buffer structure and capacity (ADR 6, implemented at 60 entries). Where their
implementation contradicts the ADR, that belongs in the reconciliation section at the
end of this file rather than here.

## The register at a glance

Every row's **Recommended** column is advisory and carries no authority: it is the position this register would defend if forced to choose today, with its reasoning and its falsifier written under the decision itself. Ratification happens in an ADR, never here.

| #   | The question in one line                                                | Recommended (not ratified)                                | Blocked work                         |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| D1  | What does an adapter hand over before freshness is filled in?           | Pre-freshness `adapterEnvelopeSchema` (opt 1)             | Every vendor adapter                 |
| D2  | How do other packages reach the recorded vendor fixtures?               | Public `./testing` subpath, JSON-directory fallback       | The joining test                     |
| D3  | May the console depend on adapters in tests only?                       | Keep it — ratify what is already built and probed         | —                                    |
| D4  | Hand-written fixtures, or recorded from the simulator?                  | Recorded, plus a CI re-record-and-diff step               | Adapter contract tests               |
| D5  | Do we count unknown fields on broken payloads too?                      | Accepted payloads only; name the metric for its scope now | The three vendor schemas             |
| D6  | Must server and simulator read the same roster file?                    | Same inputs + CI equality; the server's spelling wins     | The documented demo handoff          |
| D7  | Where does the supported-vendor list live, and what guards the copy?    | Adapters owns it; write the test the comment names        | —                                    |
| D8  | Where does tenant config come from, and which panel does Tenant B lose? | Build-time, schema-validated; name the flag               | The second tenant profile            |
| D9  | Route, header, or body for vendor identity?                             | The route; promote ADR 8's assumption to a decision       | Server ingest                        |
| D10 | Whole-envelope deltas, and where is the flush sequence?                 | Fix the sequence now; keep whole-envelope until measured  | The WebSocket fan-out                |
| D11 | Is `sequence` really a capability?                                      | Split into operator-facing and diagnostic name sets       | —                                    |
| D12 | Does contracts own the fleet, health and diagnostics responses?         | Yes — and separate the counters by their true scope       | Server read endpoints                |
| D13 | Where do port, host, origins and the console's API address come from?   | Validated environment at startup plus a dev proxy         | The first end-to-end run             |
| D14 | Virtualize the fleet table, or narrow the claim?                        | Narrow the claim now; virtualize on measurement           | —                                    |
| D15 | How does connection state reach the features?                           | `ConnectionContext` in `shared/lib`, scoped to that alone | Offline freshness suppression        |
| D16 | What does a decode failure look like at each hop?                       | One `ContractIssue` vocabulary end to end                 | Act before ingest, or it is breaking |
| D17 | Which numeric gates are real?                                           | Gate the bundle and the harness; report coverage          | —                                    |
| D18 | How much raw payload is retained, and who may read it?                  | Cap the request, keep the bytes, state the exposure       | The ingest handler                   |

Four of these — **D9**, **D10**, **D13**, **D16** — sit directly on the path of the vertical slice the architecture audit recommends shipping first, and **D16** is the only one whose cost rises sharply with delay.

---

## D1 — Shape crossing the adapter/server boundary

**Question:** What validated type does a vendor adapter return before the server-owned freshness sweep has supplied freshness?

**In plain terms:** An adapter turns one vendor's message into our standard shape. One field in that standard shape — how fresh the data is — may only ever be filled in by the server. So the adapter has to hand over something complete in every respect except that one field, and we have to decide what that half-finished thing is called and how it gets checked.

**Current package position:** Add `adapterEnvelopeSchema`, containing every canonical envelope field except `freshness`. Adapters return its inferred `AdapterEnvelope` and the server converts it to `CanonicalEnvelope` through the single authoritative freshness constructor.

**Implementation:** Not started. `canonicalEnvelopeSchema` still requires freshness and `withFreshness` still accepts only an already-canonical envelope. This position exists only in `packages/contracts/TODO_E2E_JOIN.md`.

### Educational context & solution weighing

Adapters sit at the outer edge of the system and must never be trusted to assert server-owned invariants (here: freshness). The design problem is therefore “how do we give the adapter a safe, validated return type that is still incomplete?”

| Alternative                                                                                                    | Educational summary                                                                                                                                                                                                          | Pros                                                                                                                                                                                        | Cons                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Adapter returns a validated pre-freshness envelope** (current package position)                           | Define a schema that is identical to the canonical envelope except that the `freshness` field is omitted. The adapter validates against this schema; the server is the only place allowed to call the freshness constructor. | • Single, explicit “incomplete-but-valid” type.<br>• Schema validation still happens at the adapter boundary.<br>• Freshness authority remains exclusively with the server (honours ADR 3). | • Requires a second schema + conversion function.<br>• Any future field that is also server-owned will force another “pre-X” schema.                                                                                  |
| **2. Adapter returns separately validated identity, core, provenance, and capability parts; server assembles** | Treat the envelope as a product of four independently validated pieces. The adapter never constructs an envelope at all.                                                                                                     | • Maximum flexibility; each piece can evolve independently.<br>• No “almost-canonical” intermediate type.                                                                                   | • Assembly logic becomes complex and easy to get wrong.<br>• Loses the single “this is what an adapter produces” contract that tests can assert against.<br>• Higher cognitive load for anyone writing a new adapter. |
| **3. Adapter supplies placeholder freshness**                                                                  | Adapter invents a dummy freshness value that the server later overwrites.                                                                                                                                                    | • Adapter can return a fully-typed `CanonicalEnvelope` today.                                                                                                                               | • Directly contradicts ADR 3 (“freshness authority”).<br>• Placeholder values can leak into metrics, logs, or the UI if the overwrite is ever skipped.<br>• Not viable unless ADR 3 is superseded.                    |

**Recommendation (not ratified):** **Option 1 — the validated pre-freshness envelope.** Add `adapterEnvelopeSchema` and widen `withFreshness` to accept it.

It turns "an adapter never asserts freshness" from a sentence in a document into a compile error, and it keeps a schema on the value crossing the boundary — the one thing option 2 gives up, and the reason this package exists. Option 3 is unavailable unless ADR 3 is superseded.

**What would change this call:** if the server's ingest turns out to assemble the envelope from separate parts rather than receive one whole pre-freshness value, option 2 is right and this type is ceremony. Decide the ingest shape before writing it — that is contracts **C-1**'s own stated falsifier.

**Implications if adopted:**

- **Touches:** `packages/contracts` (one schema, one widened constructor) and the return type of every vendor adapter.
- **Sequencing:** must land before the first vendor adapter (**C2**–**C4**), or three adapters are written against a type that then changes.
- **Cost of reversal:** near zero today, because no adapter exists; a coordinated three-package change afterwards.
- **If it stays open:** no adapter can legally be written at all, which blocks the vertical slice the architecture audit recommends shipping first.

**Required evidence (unchanged):** One adapter contract test and one server ingest test proving an adapter cannot assert freshness and that the server produces a canonical envelope without bypassing schema validation.

---

## D2 — Public access to recorded adapter fixtures

**Question:** How may another workspace package consume the exact recorded payload used by adapter contract tests without deep-importing adapter internals or copying bytes?

**In plain terms:** The adapter tests use real vendor messages saved as files. Other packages want to test against those exact same bytes. The question is how they reach them without poking into the adapter package's private folders and without keeping a second copy that quietly goes out of date.

**Current package position:** Add an explicit `@fleet/adapters/testing` export containing a browser-test-safe fixture API.

**Implementation:** Not started. The adapters export map contains only `"."`; no vendor fixtures or testing entry point exist.

### Educational context & solution weighing

Fixtures are the primary evidence that an adapter correctly understands a vendor dialect. Other packages (especially the web layer) need those exact bytes for end-to-end join tests, but must never be able to import production adapter code.

| Alternative                                                                | Educational summary                                                                                                  | Pros                                                                                                                                                                               | Cons                                                                                                                                                                    |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Public test-only package subpath such as `./testing`** (current)      | Add an explicit export map entry that is only reachable from test code and that never appears in production bundles. | • Clear, intentional public surface.<br>• Easy to enforce with existing export-map + dependency-enforcement tests.<br>• Keeps fixtures co-located with the adapters that own them. | • Requires careful “browser-safe” design (no Node-only APIs).<br>• Extra package-json and lint configuration.                                                           |
| **2. Plain JSON fixture subpath with no Node-only loader**                 | Simply publish the raw JSON files under a public path; consumers read them with ordinary `import` or `fetch`.        | • Zero runtime code; pure data.<br>• Works in any environment (Node, browser, Deno).                                                                                               | • No helper API (typed loaders, seed/instant metadata, etc.).<br>• Consumers must re-implement the same loading boilerplate.                                            |
| **3. Dedicated integration-test package that owns cross-package fixtures** | Move the fixtures into a new package that is allowed to depend on both adapters and web.                             | • Clean ownership of the “join” concern.<br>• Production packages stay free of test-only code.                                                                                     | • Another package to maintain.<br>• Risk of the fixtures drifting from the adapters that originally recorded them.                                                      |
| **4. Deep imports or copied fixtures**                                     | Reach into `node_modules/@fleet/adapters/src/...` or duplicate the JSON files.                                       | • Zero design work.                                                                                                                                                                | • Breaks the export boundary (ADR 9).<br>• Copies become stale the moment a fixture is re-recorded.<br>• Should be rejected unless the package-API rule itself changes. |

**Recommendation (not ratified):** **Option 1 — a public `./testing` subpath**, with option 2 pre-agreed as the fallback.

It is the only option that gives one public way in without inventing a package, and its failure mode is already known: if the loader needs `node:fs` it cannot run in a browser test environment, in which case the export exposes the JSON directory instead of a loader (adapters **A-2**'s own falsifier). Naming the fallback now stops the decision being reopened under time pressure.

**What would change this call:** a fixture loader that cannot be made environment-neutral.

**Implications if adopted:**

- **Touches:** `packages/adapters` export map and lint configuration; the import path used by the web joining test.
- **Sequencing:** blocks the joining test in **D3**, and therefore blocks the repository's only end-to-end evidence.
- **Cost of reversal:** cheap — an export-map entry and one import path.
- **If it stays open:** the fixtures get copied into the consuming package by default, and the copies drift the first time either side is re-recorded, silently, because both tests still pass.

**Required evidence (unchanged):** Import smoke tests from adapters and web, production-bundle proof that the test surface is absent, and a failure test showing deep imports remain blocked.

---

## D3 — Test-only dependency from web to adapters

**Question:** Is `packages/web` permitted to depend on `@fleet/adapters` in tests while production entity and feature code remains forbidden from importing it?

**In plain terms:** The console must never ship vendor-decoding code to the browser. But the most valuable test in the repository is the one that pushes a real vendor message all the way through to what the console displays. So: may the console package depend on the adapters package in tests only, and what stops that exception from widening later?

**Current package position:** Keep `@fleet/adapters` as a web dev dependency, ban the specifier package-wide in production code, and lift the ban only for tests that join a raw vendor fixture to the browser read model.

**Implementation:** Partially implemented. The dev dependency, production import ban, test override, and positive/negative enforcement fixtures exist. The joining test and adapter testing export do not.

### Educational context & solution weighing

The web package must never ship adapter code to the browser, yet the highest-value end-to-end test is precisely the one that feeds a recorded vendor payload through the adapter and into the web read model.

| Alternative                                                                | Educational summary                                                                                                        | Pros                                                                                                                                                            | Cons                                                                                                                                           |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Test-only dependency + mechanically tested lint exception** (current) | Declare the dependency as `devDependency`, ban the import everywhere, then carve out an explicit exception for test files. | • Keeps the production dependency graph clean.<br>• Enforcement is automatic and non-vacuous (ADR 7).<br>• Joining test can live next to the code it validates. | • Requires disciplined ESLint / dependency-cruiser configuration.<br>• Easy for a future developer to accidentally widen the exception.        |
| **2. Move the joining test to a dedicated integration package**            | Create a package that is allowed to import both `@fleet/adapters` and `@fleet/web`.                                        | • Zero contamination of the web package itself.<br>• Clear ownership of the cross-boundary test.                                                                | • Another package, another CI job, another place for people to look.<br>• The test is no longer co-located with the web entities it exercises. |
| **3. Stop the E2E path at the canonical wire boundary**                    | Test adapters up to the canonical envelope and web from the canonical envelope onward; never join the two.                 | • Simplest dependency story.<br>• No risk of adapter code reaching the browser.                                                                                 | • Weaker cross-package evidence; a mismatch between adapter output and web expectations can go undetected until production.                    |

**Recommendation (not ratified):** **Option 1 — keep the test-only dependency.** Ratify what is already built.

This is the one stub whose enforcement already exists and has been observed to fire in both directions: `adapterImport.ts` proves the ban fires, `adapterImport.fixture.test.ts` proves the exception holds, and the bundle was measured byte-identical after the devDependency was added (**W-2**). Option 2 spends a whole package to move one test away from the code it validates.

**What would change this call:** the bundle measurement moving once the joining test actually imports an adapter rather than a type — re-measure then, because "should tree-shake" is not a measurement.

**Implications if adopted:**

- **Touches:** nothing new; the decision is to stop treating existing, tested behaviour as provisional.
- **Sequencing:** unblocked, and the cheapest stub in this register to retire.
- **Cost of reversal:** cheap.
- **If it stays open:** low risk, but the exception is the half a future tidy-up would remove, and its removal breaks the end-to-end path rather than anything locally visible.

**Required evidence (unchanged):** A legal test import, an illegal production import, and a production-bundle comparison proving adapters do not reach browser output.

---

## D4 — Ownership and provenance of vendor fixtures

**Question:** Are adapter fixtures hand-authored examples, or recorded output from the simulator’s authoritative raw dialect generators?

**In plain terms:** Where do the recorded vendor messages come from — did somebody type them out by hand, or are they captured from the simulator that stands in for the robots? Hand-written examples are easy to make and quietly stop resembling what the system actually emits.

**Current package position:** Record deterministic simulator output at a pinned seed and instant, commit it under adapters, and keep adapters free of a production dependency on simulator. Dialect changes require an explicit re-recording step and coupling comments on both sides.

**Implementation:** Not started on the adapter side. Deterministic simulator generators exist, but adapters has no recorded vendor fixtures or re-recording procedure.

### Educational context & solution weighing

Fixtures must be both realistic (so they exercise the real dialect) and stable (so CI does not flap). The simulator already owns the authoritative generators; the question is whether adapters should import that authority or freeze a snapshot of it.

| Alternative                                                                        | Educational summary                                                                             | Pros                                                                                                                                                                                                        | Cons                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Recorded simulator output with no runtime dependency** (current)              | Run the simulator once with a fixed seed, commit the bytes, and document the re-record command. | • Fixtures are bit-for-bit identical to what the simulator produces.<br>• Adapters stay free of a production (or even test-time) dependency on simulator.<br>• Drift is forced into an explicit human step. | • Requires a documented re-record procedure and coupling comments.<br>• Someone must remember to re-record when the dialect changes.                                                                      |
| **2. Hand-authored adapter fixtures independently checked against vendor schemas** | Write the JSON by hand and validate it only against the vendor’s published schema.              | • No coupling to the simulator at all.<br>• Fixtures can be minimal or adversarial.                                                                                                                         | • Easy for the fixture to diverge from the real dialect the simulator emits.<br>• Loses the “this is exactly what the field device produces” guarantee.                                                   |
| **3. Generate fixtures during tests by importing simulator**                       | `import { generateVendorPayload } from '@fleet/simulator'` inside the adapter test suite.       | • Always up-to-date; no re-recording needed.                                                                                                                                                                | • Creates a test-time dependency that can hide defects present in both producer and consumer.<br>• Violates the “adapters must not depend on simulator” production-boundary spirit even if only in tests. |

**Recommendation (not ratified):** **Option 1 — recorded simulator output**, plus a CI step that re-records and diffs.

Option 1's only real weakness is "someone must remember to re-record". A scripted CI job that regenerates the fixtures from the simulator and fails on any difference removes that weakness without putting a simulator import inside the adapter test suite, which is what makes option 3 unacceptable: a bug present in both producer and consumer would cancel out and the test would still pass.

**What would change this call:** simulator output ceasing to be deterministic at a pinned seed, which would turn the diff into noise and force a schema-shaped guard instead.

**Implications if adopted:**

- **Touches:** `packages/adapters` (committed fixtures plus a `record` script), one CI job, and coupling comments on both the simulator generators and the fixtures.
- **Sequencing:** needs the three dialects stable enough to record; the re-record step must be documented next to the fixtures, not only in CI.
- **Cost of reversal:** cheap.
- **If it stays open:** hand-authored fixtures appear by default, and the claim that a fixture is exactly what the field device produces quietly becomes false.

**Required evidence (unchanged):** Deterministic re-record command or documented procedure, exact adapter outputs for all vendors, and a guard that detects simulator/fixture dialect drift without placing adapter logic in the simulator production path.

---

## D5 — Unknown-field accounting for rejected payloads

**Questions:** What counts as an unknown vendor field, how are nested paths represented, and when a payload is both malformed and contains unknown fields, does the adapter count those fields or only the malformed rejection?

**In plain terms:** Vendors sometimes send fields we do not recognise. The rule is that we count them rather than drop them silently. What is unsettled is what happens when a message is both broken _and_ carries unrecognised fields: do we still count the extras, or does "broken" win and the count never happens?

**Current package position:** Count unknown fields only after the payload otherwise passes its vendor schema. Rejected payloads increment malformed/adapter-failure metrics but do not change the unknown-field ledger. For accepted payloads, the adapters TODO recommends passthrough schemas plus a shared key-difference walk that emits dotted paths; that detection mechanism is a recommendation, not yet a decision.

**Implementation:** The process-wide ledger exists and accepts arbitrary field paths. Vendor schemas, unknown-field detection, adapter calls into the ledger, ingest rejection metrics, and health HTTP exposure do not.

### Educational context & solution weighing

ADR 1 requires that unknown fields are counted rather than silently dropped. The subtlety is what to do when the payload is already so broken that a full structural walk is unsafe or meaningless.

| Alternative                                                     | Educational summary                                                                                                | Pros                                                                                                                                    | Cons                                                                                                                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Count unknown fields only on accepted payloads** (current) | Run the normal schema first. Only if it succeeds do you walk the object for extra keys.                            | • Simple mental model: “unknown” only makes sense on an otherwise valid document.<br>• Avoids attempting to walk deeply malformed data. | • A payload that is both malformed _and_ contains unknown fields never contributes to the unknown-field ledger.<br>• Operators lose visibility into “almost-valid” traffic. |
| **2. Safe top-level key comparison before full validation**     | Compare the top-level keys of the raw object against the known set; count unknowns even if later validation fails. | • Captures unknowns on both accepted and rejected payloads.<br>• Top-level walk is cheap and safe.                                      | • Nested unknowns are invisible.<br>• Still requires a second, deeper walk for accepted payloads.                                                                           |
| **3. Two explicit counters**                                    | Maintain separate “accepted-payload unknowns” and “rejected-payload unknowns” series.                              | • Full observability; no information is thrown away.<br>• Health endpoint can surface both numbers.                                     | • More metrics, more labels, more documentation.<br>• Consumers of the health endpoint must understand the distinction.                                                     |

**Detection mechanism on accepted payloads** — an orthogonal sub-decision with its own trade-offs, weighed on the same terms:

| Alternative                                             | Educational summary                                                                                               | Pros                                                                                                                                                         | Cons                                                                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **a. Strict schema, read the rejection**                | Declare the schema strict and pull unrecognised keys out of the validation error.                                 | • No extra walking code.<br>• The validator already knows the known key set.                                                                                 | • Strict mode _rejects_ the payload ADR 1 wants accepted.<br>• Most validators stop at the first error, so the list is incomplete by construction.            |
| **b. Passthrough plus an explicit key-difference walk** | Accept extra keys, then compare the object's paths against the schema's known dotted paths and report the extras. | • Acceptance and accounting stay separate, which is exactly what ADR 1 describes.<br>• Deterministic, and nested paths come out as `telemetry.undocumented`. | • A walk to write and test, and it must live in `src/core/` or all three vendors grow their own.                                                              |
| **c. Loose schema plus a post-parse comparison**        | Same shape as (b), but the schema itself is permissive rather than passthrough-with-known-paths.                  | • Slightly less schema ceremony.                                                                                                                             | • Weaker compile-time guarantees about what the known set even is.<br>• The known-path list drifts from the schema silently, which is the failure (b) avoids. |

**Recommendation (not ratified):** **Option 1 for behaviour, with the metric named for its scope from day one**, and **passthrough plus a key-difference walk** as the detection mechanism.

Option 1 is what ADR 1 describes and the simplest thing that is correct. Adapters' own FIXME already records the remedy if the trade proves wrong: a second tally (option 3), not a change to this one. That later addition is only additive if the first counter is labelled `unknownFields.accepted` now — otherwise it is a rename across the server's health endpoint and the console's diagnostics. On detection, the passthrough walk keeps acceptance and accounting separate, which strict-schema inspection cannot do because it rejects the payload it was meant to accept.

**What would change this call:** a real integration where a vendor changed shape and the ledger stayed flat while the malformed counter rose — the exact blind spot option 1 accepts.

**Implications if adopted:**

- **Touches:** `packages/adapters` (`src/core/` walk shared by all three vendors, emitting dotted paths), the server health endpoint's labels, and the console's diagnostics copy.
- **Sequencing:** settle before the three vendor schemas (**B1**–**B3**), which all inherit the mechanism.
- **Cost of reversal:** additive if the label is scoped now; a cross-package rename if it is not.
- **If it stays open:** three vendor schemas get written against three different assumptions about what "unknown" means.

**Required evidence (unchanged):** Tests for valid-plus-unknown, malformed-plus-unknown, nested unknowns, and a payload too malformed to inspect safely. Health labels must state the scope precisely.

---

## D6 — Ownership and loading of shared fleet configuration

**Question:** Who owns `config/freshness.json` and `config/fleet-manifest.json`, and must server and simulator consume the same manifest file or only produce compatible roster shapes?

**In plain terms:** Two files at the repository root list every robot the system expects and how fast data goes stale. The server reads them. The simulator invents its own fleet and can print a matching list. The question is whether the two must read the same file or merely agree — and today they do not even agree on spelling.

**Current package position:** Repository-root `config/` is deployment configuration. The server strictly reads both files. The simulator independently generates its fleet from CLI/defaults and can print a manifest-compatible roster with `--print-manifest`; it does not read `fleet-manifest.json` or `freshness.json`. No package imports the other’s configuration implementation.

**Implementation:** Root files and the server loader are implemented and tested. The simulator manifest printer is implemented. There is no test proving the shipped manifest equals a simulator configuration, and the normal simulator process does not consume the shipped roster.

**The two shapes provably disagree today**, which raises this from "untested" to "broken in one direction". `packages/simulator/src/app.ts` (`renderFleetManifest`) prints `{ seed, robots: [{ robotId, siteId, vendor, model }] }`, while `fleetManifestSchema` in `packages/server/src/config/fleetManifest.ts` is a `strictObject` accepting `robots` alone and requiring `vendorId`. Piping `--print-manifest` into the server therefore fails startup twice over — an unrecognized `seed` key and a missing `vendorId` on every entry. The committed `config/fleet-manifest.json` uses the server's spelling and holds 50 robots, matching the simulator's default count, so the roster contents agree while the roster _format_ does not. Whichever alternative is chosen must state which of the two spellings is canonical; option 3 in particular cannot be implemented until it is.

### Educational context & solution weighing

The server must boot with a concrete, validated roster and freshness policy. The simulator must be able to generate a fleet that is _compatible_ with that roster, but it does not necessarily need to read the same files.

| Alternative                                                                                   | Educational summary                                                                                                                      | Pros                                                                                                                       | Cons                                                                                                                      |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **1. Root files with independently tested decoders** (current)                                | Each consumer ships its own loader; a generation/test step proves compatibility.                                                         | • No shared runtime dependency.<br>• Server can reject malformed config at startup.<br>• Simulator stays a pure generator. | • Compatibility is only as good as the test that compares the two outputs.<br>• Two places that must stay in sync.        |
| **2. Small configuration package exporting schemas/loaders**                                  | Extract the JSON schemas and loaders into `@fleet/config`.                                                                               | • Single source of truth for parsing rules.<br>• Both packages import the same code.                                       | • New package; new dependency edge (touches ADR 9).<br>• Simulator now has a production dependency it previously avoided. |
| **3. Server reads the committed manifest; simulator generates from the same explicit inputs** | Keep the files, but drive the simulator from the _same_ seed values that produced the committed manifest; a CI command asserts equality. | • Strong guarantee that the shipped roster is exactly what the simulator would produce.<br>• Still no runtime coupling.    | • Requires discipline to keep the generation inputs documented and checked.                                               |
| **4. Package-local copies**                                                                   | Each package carries its own copy of the JSON.                                                                                           | • Zero cross-package coordination at runtime.                                                                              | • High risk of a robot that the server knows about but the simulator never emits (or vice-versa).                         |
| **5. Server-only manifest + discovery from server to simulator**                              | Simulator asks the server for the current roster at startup.                                                                             | • Single authoritative source.                                                                                             | • Introduces a new runtime dependency and startup ordering problem.                                                       |

**Recommendation (not ratified):** **Option 3 — same explicit inputs, equality asserted in CI — and make the server's spelling canonical.**

The contents already agree (50 robots, same identifiers, sites and models); only the format disagrees. So the cheap fix is to make `--print-manifest` emit exactly what `fleetManifestSchema` accepts — `vendorId` rather than `vendor`, and no `seed` wrapper (log the seed to stderr instead) — and then add the equality check option 3 asks for. That converts a compatibility promise into a failing build without the shared package option 2 requires, and without the startup ordering option 5 introduces.

**What would change this call:** the simulator ever needing to _consume_ the roster rather than produce it, which would make option 5's runtime discovery worth its cost.

**Implications if adopted:**

- **Touches:** `packages/simulator` (`renderFleetManifest`: one field rename, one wrapper removed), plus one test or CI command comparing printed output with the committed file.
- **Sequencing:** independent of every other stub; it can land today.
- **Cost of reversal:** cheap.
- **If it stays open:** the printed manifest remains unusable as server input, so the documented handoff between the two packages is a step nobody can actually follow.

**Required evidence (unchanged):** The server rejects malformed configuration; whichever simulator input strategy is chosen produces exactly the shipped robot identifiers; missing or invalid required configuration fails startup rather than silently defaulting; and one-command startup resolves paths from a clean clone.

---

## D7 — Authority and drift guard for the supported-vendor set

**Question:** Where is the finite set of supported ingest adapters authoritative, and how does the simulator’s deliberately independent vendor set stay aligned with it?

**In plain terms:** Only the adapters package knows which vendors we can actually decode. The simulator writes the same list out a second time so it does not have to depend on adapters. Two copies of one list need something that fails when they stop matching, and that something was never written.

**Current package position:** `packages/adapters` owns `SUPPORTED_VENDORS`/`SupportedVendor`; simulator restates `VENDOR_IDS` to avoid a production dependency on adapters. A test-only comparison is intended to guard the duplication.

**Implementation:** Both identical literals exist. The documented guard does not: `simulatedRobot.ts` names a nonexistent `vendorId.test.ts` and incorrectly calls the adapter type `VendorId`. Simulator has no adapter dev dependency and no test compares the sets.

**The set now has a third consumer**, which strengthens the case for adapters as its home and widens the blast radius of drift: `packages/server/src/config/fleetManifest.ts` imports `SUPPORTED_VENDORS` from `@fleet/adapters` and enumerates it in the manifest schema (`vendorId: z.enum(SUPPORTED_VENDORS)`). A vendor added to the simulator alone is therefore not merely unadapted — every manifest entry naming it fails server startup, which is a louder failure than the silent one this stub was written against, but only for robots that reach the manifest.

### Educational context & solution weighing

Adding a fourth vendor must not change the canonical model (ADR 1). Therefore the set of supported vendors lives in adapters, not in contracts. The simulator must stay in sync without taking a production dependency.

| Alternative                                                                                   | Educational summary                                                                                                       | Pros                                                                              | Cons                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Independent production sets + test-only comparison** (current)                           | Duplicate the literal; add a test that imports both and asserts equality.                                                 | • No production coupling.<br>• Drift is caught in CI.                             | • The test must actually exist (currently missing).<br>• Two places to update when a vendor is added.                                 |
| **2. Keep the contract’s vendor identifier open; prove coverage with an integration fixture** | Contracts only know “string vendor id”; a higher-level test asserts that every simulated vendor has a registered adapter. | • Contracts stay open-ended.<br>• No simulator → adapters dependency of any kind. | • The proof is weaker (it only checks presence, not the exact set).<br>• Still needs a place that is allowed to import both packages. |
| **3. Move the supported set into contracts**                                                  | `SupportedVendor` becomes part of the canonical model.                                                                    | • Single authoritative declaration.                                               | • Adding a vendor now changes the contracts package, which ADR 1 explicitly wants to avoid.                                           |

**Recommendation (not ratified):** **Option 1 — independent literals plus the test-only comparison.** Write the test the source comment already names.

The duplication is the right call: a production import from simulator to adapters would invert the boundary the simulator exists to exercise. What is wrong today is that a _named_ guard does not exist, which reads as verified and is therefore worse than plain duplication. Option 3 would move the set away from its only enumerating consumers, and adding a vendor would become a contracts change — the thing ADR 1 exists to prevent.

**What would change this call:** nothing plausible. This is the cheapest stub here to close.

**Implications if adopted:**

- **Touches:** `packages/simulator` (a devDependency on `@fleet/adapters` and one test), and the stale comment in `simulatedRobot.ts`, which names a file that does not exist and a type name that is wrong.
- **Sequencing:** independent.
- **Cost of reversal:** not applicable.
- **If it stays open:** a fourth vendor added to one list only fails loudly for robots that reach the manifest and silently everywhere else.

**Required evidence (unchanged):** A test that fails if the simulator emits a vendor for which no adapter is registered, without importing adapters in the simulator production path.

---

## D8 — Tenant configuration source, validation, and feature flags

**Question:** Where does deployment tenant configuration come from, how is it validated, what is the failure/fallback policy, and which concrete feature flag distinguishes the second tenant profile?

**In plain terms:** Each customer deployment gets its own name, colours, and — according to the design system — one panel switched off. Today that is a hand-written object with no validation and no flag at all. Where does that configuration come from, what happens when it is wrong, and which panel does the second tenant actually turn off?

**Current package position:** Web exports a typed module literal (`TENANT`) and a stable context default. No external loader, runtime schema, fallback path, or feature-flag field exists. The design system says Tenant B disables one panel but does not name it.

**Implementation:** Typed static identity/theme selection exists; validation, loading, fallback behavior, and flags are not implemented.

### Educational context & solution weighing

Tenant configuration is currently a static TypeScript module. The design system already talks about a second tenant that disables a panel, yet no flag exists. The decision is whether to keep the configuration build-time static or to introduce runtime loading.

| Alternative                                                                       | Educational summary                                                                                             | Pros                                                                                                                | Cons                                                                                                                                                                             |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Build-time validated tenant configuration, one deployment tenant per build** | The CI/CD pipeline selects the tenant and bakes the validated config into the bundle.                           | • Zero runtime failure modes.<br>• Easy to reason about; perfect for the current “one tenant per deployment” model. | • Changing tenant requires a rebuild/redeploy.<br>• Feature-flag story stays compile-time only.                                                                                  |
| **2. Startup-loaded validated configuration with a documented safe fallback**     | Read a JSON/YAML file (or environment) at process start; fall back to a known-good default if validation fails. | • Supports multi-tenant or dynamically provisioned deployments.<br>• Validation failures are explicit.              | • Adds a runtime failure path that must be tested and monitored.<br>• Fallback policy must be carefully designed so the UI never renders an inconsistent theme/flag combination. |
| **3. Server-provided tenant configuration decoded by web**                        | Web fetches `/api/tenant-config` on startup.                                                                    | • Single source of truth living on the server.<br>• Can be changed without rebuilding the web bundle.               | • New transport dependency and startup ordering.<br>• Web can no longer render until the server answers.                                                                         |
| **4. Remove the unimplemented Tenant B flag claim**                               | Delete the design-system promise and keep only theme/wordmark static configuration.                             | • Honest about the current scope.<br>• No new code required.                                                        | • Loses the ability to demonstrate the second tenant profile that the design system already describes.                                                                           |

**Recommendation (not ratified):** **Option 1 — build-time configuration, validated at module load** — with option 4 as the honest fallback if nobody will name the flag.

One tenant per deployment is the actual model, so a runtime loader buys a failure path nobody needs. Running the literal through a schema at import satisfies Principle 13's "parsed and validated" without introducing that path. The design system's promise is only worth keeping if someone names the panel: recommend `flags: { lidarHealthPanel: boolean }`, `false` for Tenant B, because lidar health is a panel that only some vendors declare, so the difference is visible in the demo without inventing new UI.

**What would change this call:** a requirement to serve more than one tenant from one build.

**Implications if adopted:**

- **Touches:** `packages/web/src/config` (schema plus a `flags` field), the panel registry in `features/robot` (a panel renders when the capability is declared **and** the tenant enables it), and `DESIGN_SYSTEM.md` if option 4 wins instead.
- **Sequencing:** independent of the transport; can land now.
- **Cost of reversal:** cheap while there is one tenant literal.
- **If it stays open:** the design system keeps promising a second tenant profile the code cannot demonstrate.

**Required evidence (unchanged):** Invalid-input tests, stable provider identity, both theme profiles, and one test proving wordmark, theme, and the named flag change together—or a docs change removing the flag promise.

---

## D9 — Where vendor identity travels on an ingest request

**Question:** Does the server learn which adapter to dispatch to from the URL path, a request header, or the payload body?

**In plain terms:** When telemetry arrives, the server must know which vendor sent it before it can decode it. That hint can live in the URL, in a header, or inside the message. Inside the message is circular — you would have to read the message to learn how to read the message.

**Current package position:** The route. `POST /api/telemetry/:vendor`, with the segment validated against the registry's key set before any body decoding (`packages/server/TODO.md` **M7**, still filed under "Open decisions").

**Implementation:** Shipped on the client side, unratified on the server side. `ingestUrlFor` in `packages/simulator/src/config/simulatorConfig.ts` posts to `{endpoint}/api/telemetry/{A|B|C}` and its integration test asserts that route shape; ADR 8 § Assumptions records the route as "already fixed by a working caller"; and `isSupportedVendor(value: unknown)` in `packages/adapters` was deliberately widened to take an unvalidated route parameter, a signature that only makes sense under this option. No server route exists and no ADR decides it.

### Educational context & solution weighing

The body is untrusted, and the vendor is what selects the schema that would make it trustworthy — so reading vendor identity out of the body is circular. The design question is which part of the request can be validated cheaply and independently of the payload.

| Alternative                                                 | Educational summary                                                                                          | Pros                                                                                                                                                         | Cons                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Path segment `POST /api/telemetry/:vendor`** (current) | Adapter selection is a decision about a validated path segment, made before a single body byte is inspected. | • Breaks the circularity cleanly.<br>• Visible in logs and access records without parsing bodies.<br>• Already implemented by a working caller and by ADR 8. | • Vendor identity is now part of the URL contract; changing it is a coordinated client change.<br>• A caller can lie about the segment (so can a body field). |
| **2. Request header (e.g. `X-Fleet-Vendor`)**               | Same validated-before-decode property, but out of the URL.                                                   | • Keeps one route for all vendors.<br>• Easy to add a second discriminator later.                                                                            | • Invisible in ordinary HTTP logs.<br>• Header handling differs across proxies; a dropped header becomes an unsupported-vendor rejection with no clue why.    |
| **3. Field inside the payload body**                        | The vendor names itself in the document it sends.                                                            | • One route, no transport-level metadata.                                                                                                                    | • Circular: the body must be parsed before it can be validated.<br>• Forces a permissive pre-parse that is a second decode authority (Principles 1 and 2).    |

Inferring the vendor from payload _shape_ is not a fourth option; `packages/simulator/TODO.md` § 1 rules it out explicitly, and it would make adding a fourth vendor a change to the dispatch heuristics of the other three.

**Recommendation (not ratified):** **Option 1 — the path segment.** Ratify it by promoting ADR 8's assumption into a decision rather than writing a new ADR.

Two packages are already built on it, it breaks the circularity cleanly, and it is the only option visible in ordinary HTTP logs without parsing bodies. An assumption doing a decision's work should be written as a decision; that is the whole complaint this register exists to raise.

**What would change this call:** a deployment where a proxy rewrites paths but preserves headers, which would favour option 2.

**Implications if adopted:**

- **Touches:** ADR 8 (assumption becomes decision), `packages/server` (the route plus validation of the segment before any body work), `packages/adapters` (`isSupportedVendor` can narrow from `unknown` to `string`, because the server validates first).
- **Sequencing:** blocks ingest (**D1**–**D3** in the server TODO); nothing else can decode telemetry until it is settled.
- **Cost of reversal:** a coordinated simulator, server and test change — cheap now, and one more package every week it waits.
- **If it stays open:** the server route gets written to match a caller nobody ratified, and the guard keeps a parameter type that only makes sense under an unstated assumption.

**Required evidence:** an unsupported vendor produces a defined rejection plus a counted metric and never a fallback adapter; a test proving no body byte is read before the adapter is selected; and the simulator's route test, the adapter guard's parameter type, and the server route re-read together in one change (Principle 14) — the guard's `unknown` parameter is redundant and should become `string` if this resolves to anything other than option 1.

---

## D10 — Delta payload granularity, and the flush sequence the wire does not carry

**Question:** Does a WebSocket delta carry the whole canonical envelope for each changed robot, or only what changed — in particular for the freshness-only transition, which is the most common delta at scale?

**In plain terms:** When a robot changes, the server pushes an update to the browser. Today that update carries the robot's whole record even when the only thing that changed is "this data is now stale". Do we keep one simple message shape, or add a smaller one for the common case? A second, unrelated problem lives in the same place: the message is missing a counter that reconnecting clients need.

**Current package position:** Robot-level, whole envelope. `telemetryBatchSchema` in `packages/contracts` states it in its own doc comment: "'Delta' is at the robot level, not the field level — ADR 2 coalesces changed robots and sends each one whole, which keeps the client's apply step a keyed replace rather than a merge."

**Implementation:** Already in the contract and already decoded by the browser, with no ADR behind it. `docs/ARCHITECTURE_AUDIT.md` § 5 and § 7 both challenge it: a freshness-only transition resends roughly 5–10× the bytes the change requires, and the recommended order of work is "add a freshness-only delta type **before** the fan-out is written rather than after". Separately, and independently of which granularity wins: `telemetryBatchSchema` carries `sentAt` and **no flush sequence**, while ADR 2 § Decision (amended 19 August 2026) requires a monotonically increasing server-wide flush sequence on both the snapshot and every delta, and no fleet-snapshot response schema exists at all. The batch schema as shipped cannot support the cold-start reconciliation ADR 2 decided (server **H3a**).

### Educational context & solution weighing

Coalescing is settled; what is not settled is what one coalesced entry contains. The trade is bytes against apply-step complexity, and it interacts with the thundering herd the audit names — when telemetry stops, every robot transitions inside one threshold window and a single flush carries the whole fleet.

| Alternative                                             | Educational summary                                                | Pros                                                                                                                                        | Cons                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Whole envelope per changed robot** (current)       | One message shape; the client replaces by `robotId`.               | • Client apply is a keyed replace, never a merge.<br>• One schema to decode and one to test.<br>• Cannot produce a partially-updated robot. | • A freshness-only change resends every capability payload.<br>• Worst case is the mass transition, which is exactly when bytes matter most.                     |
| **2. A second, freshness-only delta type alongside it** | The common case gets a small message; everything else stays whole. | • Removes most of the waste with one extra shape.<br>• The freshness-only transition is already a first-class concept in `PendingDeltaSet`. | • Two message shapes on the socket, which ADR 2's initial-state decision was explicitly written to avoid.<br>• The client now has a merge path, however narrow.  |
| **3. General field-level patch**                        | Deltas describe changed fields for any field.                      | • Minimum bytes in every case.                                                                                                              | • The client's store becomes a merge engine with ordering requirements.<br>• Partial application bugs are invisible: a robot displays a mixture of two instants. |

**Recommendation (not ratified):** **Split the item. Fix the flush sequence now; keep option 1's granularity until it is measured.**

The missing flush sequence is not a choice at all — it contradicts a decided ADR and blocks reconnect — so it lands regardless of which granularity wins. The granularity concern is real but rests on an estimate: option 2 buys bytes with a second message shape and a client merge path, which is precisely what ADR 2's initial-state decision paid the flush sequence to avoid. Measure one mass-transition flush with the ADR 2 harness (see **D17**), then reopen with a number instead of a multiplier.

**What would change this call:** a measured flush at 500 robots that saturates the socket or the client's frame budget — at which point option 2, not option 3, is the next step.

**Implications if adopted:**

- **Touches:** `packages/contracts` (flush sequence on `telemetryBatchSchema`, plus the fleet-snapshot response schema that does not yet exist), `packages/server` (**H3a**), `packages/web` (cold-start order, **H3b**).
- **Sequencing:** contracts, then server, then client — and before the fan-out is written, not after; retrofitting a sequence into a live wire format is a coordinated three-package change.
- **Cost of reversal:** adding option 2 later is additive on the wire but changes the client's apply path from replace to replace-or-merge.
- **If it stays open:** the socket cannot be written correctly, because a reconnecting client has no way to discard the deltas its snapshot already covers.

**Required evidence:** a byte measurement of one freshness-only flush at 500 robots for whichever shapes are on the wire; a decode test per shape; a test proving a client that misses one frame cannot display a mixed-instant robot (options 2 and 3); and — whichever granularity is chosen — the flush sequence added to the batch schema _and_ to a fleet-snapshot response schema in the same change, with the cold-start order test the server TODO **H3b** describes.

---

## D11 — `sequence` as a declared capability, against envelope metadata

**Question:** Is `sequence` a capability at all, given that it is transport metadata rather than a machine capability, and that every capability-rendering surface has to carve it out by name?

**In plain terms:** "Sequence" sits on the list of things a vendor can declare it supports, next to real machine features like docking and water level. But it is bookkeeping, not a machine feature, so every screen that renders "whatever the vendor declared" has to remember to skip it. Does it belong on that list at all?

**Current package position:** It stays a capability. Page spec 03 § 6 excludes it from capability panels, and `capabilityPanels.tsx` implements that exclusion through a `PanelCapabilityName` subset.

**Implementation:** Shipped, and load-bearing in two other arguments. `CAPABILITY_NAMES` includes `sequence`; `sequenceCapabilitySchema` exists and is round-trip tested; the panel registry is keyed by the reduced set. `docs/ARCHITECTURE_AUDIT.md` § 4.4 calls this "breaks the capability model on its first day" and proposes nullable envelope metadata instead. Note the coupling before reopening it: adapters **B2**'s argument for vendor B declaring `dock` and nothing else partly rests on `sequence` being excluded from panels, and web's "not evaluated ≠ zero gaps" treatment reads from the same absence.

### Educational context & solution weighing

The capability model's headline rule is "render exactly the capabilities the adapter declared". A member that must never render makes the rule carry a permanent exception list, and exception lists are where the next capability gets added by mistake.

| Alternative                                                            | Educational summary                                                                                    | Pros                                                                                                                        | Cons                                                                                                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Keep it a capability with a documented exclusion** (current)      | One vocabulary for "things an adapter declares"; the console filters by name.                          | • No contracts change.<br>• Presence still expresses "this vendor supports ordering", which is genuinely per-vendor.        | • The rendering rule has an exception, enforced only by a spec sentence and a hand-maintained subset type.<br>• A fifth capability can be added to the wrong side without failing anything. |
| **2. Move it to optional envelope metadata**                           | `sequence` becomes a nullable field on the envelope; capabilities become exactly the renderable set.   | • The rendering rule loses its exception.<br>• Absence is modelled where the other diagnostics live.                        | • A contracts change touching every adapter and the web mapper.<br>• Loses the uniform "declared or not" mechanism for a fact that really is per-vendor.                                    |
| **3. Split `CapabilityName` into operator-facing and diagnostic sets** | Two named subsets in contracts, both derived from one mapping; panels key off the operator-facing one. | • Keeps one declaration mechanism while making the exclusion a type rather than a convention.<br>• Extends to future cases. | • More vocabulary for a distinction that currently has one member.<br>• Both sets must stay derived from the mapping or they become a second authority.                                     |

**Recommendation (not ratified):** **Option 3 — two derived name sets in contracts.**

It buys option 2's "one rule, no exception list" without option 2's blast radius: no adapter change, no wire change, and the panel registry's subset type stops being hand-maintained. `sequence` genuinely is a per-vendor fact — vendor B has none — so removing it from the declaration mechanism, as option 2 does, discards information the vendor B argument in ADR 1 depends on.

**What would change this call:** a second diagnostic-only capability appearing, which would confirm the split is structural; or none ever appearing, which would make option 1's single documented exception tolerable.

**Implications if adopted:**

- **Touches:** `packages/contracts` (derive an operator-facing and a diagnostic name set from the single payload mapping), `capabilityPanels.tsx` (keys off the operator set instead of a local subset), ADR 1 amendment.
- **Sequencing:** independent, and cheapest before more panels exist.
- **Cost of reversal:** cheap — both sets stay derived from the one mapping, so the change is additive either way.
- **If it stays open:** the exclusion remains a sentence in a page spec, and the next capability lands on the wrong side of it without failing anything.

**Required evidence:** whichever is chosen, exactly one rule with no hand-maintained exception list — either every declared capability renders a panel, or the type separates the two kinds mechanically; plus adapters **D6**'s capability-absence tests and the vendor B reasoning in ADR 1 § Observed consequences re-read against the outcome.

---

## D12 — Which response shapes `packages/contracts` owns, and how "not evaluated" travels

**Question:** `GET /api/fleet`, `GET /api/health`, and the diagnostics half of `GET /api/robots/:id` all cross the server-to-console boundary. Does contracts model them, and how does a robot whose sequence cannot be evaluated appear on the wire?

**In plain terms:** Three server responses reach the browser: the fleet list, the health numbers, and one robot's diagnostics. Only some of them have a single shared definition; the rest are described twice, once per package. And the fact "we cannot count missed messages for this robot" is already written two different ways in two places.

**Current package position:** Split, and unratified in both halves. `packages/contracts/TODO.md` § 6 says "Add only boundary types that are genuinely shared by multiple packages. Server-only response composition stays in `packages/server`" — but Principle 2 requires the console to decode everything it receives, which makes all three shapes shared by definition.

**Implementation:** Contracts ships `canonicalEnvelopeSchema`, `registeredRobotStateSchema`, `robotDiagnosticEnvelopeSchema` and `telemetryBatchSchema`, and **no fleet-snapshot or health-response schema**. `robotDiagnosticEnvelopeSchema` is the canonical envelope plus `rawPayload` and nothing else — it carries no sequence gaps, no clock delta and no unknown-field count, all of which robot-detail spec § 6 requires on that surface. Two representations of the same absence already exist in two packages: `packages/server/src/health/healthMetrics.ts` types `SequenceObservation = "gap" | "duplicate" | "not-evaluated"`, while `packages/web` expresses it as `sequenceGaps: number | null` in `AdapterHealthCounters`, injected into `toRobotDetail` from outside the envelope because nothing on the wire carries it (entity TODO **W-8**).

### Educational context & solution weighing

"Not evaluated" is the distinction the audit singles out as one almost nobody makes — reporting `0 gaps` for vendor B is a false statement to an operator. A distinction that valuable should have one representation, not one per package.

| Alternative                                                                 | Educational summary                                                                                                       | Pros                                                                                                                      | Cons                                                                                                                                                    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Contracts owns every response the console decodes**                    | Fleet snapshot, health, and diagnostics get schemas next to the envelope; the sentinel for not-evaluated is defined once. | • One decode authority, one vocabulary.<br>• The console cannot invent a representation, as it has already done once.     | • Contracts grows response-composition concerns its own TODO tried to keep out.<br>• Every server response change is a contracts change first.          |
| **2. Contracts owns telemetry only; web keeps local decoders** (status quo) | Fleet/health shapes live in the server and are re-declared for decoding in the console.                                   | • Contracts stays minimal.<br>• Server response shape can change without a shared-package release.                        | • Two declarations of one shape, which is the drift Principle 1 forbids — already visible in the two spellings of not-evaluated.                        |
| **3. Move per-robot counters onto the envelope**                            | Sequence gaps and unknown-field counts become envelope fields, removing the out-of-band injection entirely.               | • The console stops assembling a read model from two sources.<br>• Kills `AdapterHealthCounters` and its injection point. | • ADR 1 § Implications deliberately keeps unknown-field accounting per-adapter; per-robot counters imply a precision the ledger does not have (see D5). |

**Recommendation (not ratified):** **Option 1 — contracts owns every response the console decodes — with the two counters separated by their true scope.**

The console decodes everything it receives (Principle 2), so the fleet and health responses are shared boundary types whether or not contracts admits it; the proof is that "not evaluated" is already spelled two different ways. The apparent conflict with ADR 1 in option 3 dissolves once the counters are separated by scope: **sequence gaps are a per-robot fact** and belong on the diagnostic envelope, while **unknown-field counts are per-adapter** and belong on health, labelled as such. For the representation, prefer a discriminated shape — `{ evaluated: false } | { evaluated: true; count: number }` — over `null`, which is indistinguishable from "field absent"; `number | null` with the meaning documented in the schema is the acceptable minimum.

**What would change this call:** a decision to keep the console's decoders local, which would still need an answer to how two packages keep one shape aligned.

**Implications if adopted:**

- **Touches:** `packages/contracts` (fleet-snapshot and health schemas; per-robot counters added to the diagnostic envelope), `packages/server` (response composition), `packages/web` (the per-robot half of the `AdapterHealthCounters` injection disappears, and with it entity TODO **W-8**).
- **Sequencing:** contracts before the server's read endpoints (**G1**–**G3**); the console's fixtures already anticipate the shapes.
- **Cost of reversal:** moderate — three response shapes and their decode tests.
- **If it stays open:** the console keeps re-declaring server shapes, which is the drift Principle 1 forbids, and which has already produced two spellings of one fact.

**Required evidence:** one representation of "not evaluated" spanning server, wire and console, asserted by a test that renders it; a decode test for every response shape the console reads; and a test proving the console never displays `0` for a robot whose sequence was not evaluated.

---

## D13 — Runtime endpoint configuration, and how the console finds the server

**Question:** Where do the server's port, host and allowed origins come from, and how does `packages/web` learn the HTTP and WebSocket origins it must connect to?

**In plain terms:** Nothing in the system says which port the server listens on or which address the browser should call. The simulator has an address baked in, the server reads no port at all, and the console does not mention a server anywhere. Whatever we choose also decides whether the browser needs cross-origin permission.

**Current package position:** None recorded. Server **C5** wants it "typed, validated, read once", with `process.env` lint-restricted to `src/config/**`. `CLAUDE.md` places tenant _endpoints_ in typed configuration alongside branding and flags.

**Implementation:** Not started, with one hardcoded assumption already shipped against it. The simulator defaults to `endpoint: "http://127.0.0.1:8080"` while `packages/server/src/config/serverConfiguration.ts` reads only `freshness.json` and `fleet-manifest.json` and nothing in the package reads a port. `packages/web/src/config/tenant.ts` declares `id`, `wordmark` and `theme` with no endpoints field, and a grep across `packages/web` finds no host, no `VITE_` variable, and no dev proxy in `vite.config.ts`. The console currently cannot express where its server is.

### Educational context & solution weighing

Three consumers need to agree on one origin — simulator to server, console to server over HTTP, console to server over WebSocket — and two of them are already guessing. Whatever is chosen also decides whether a CORS policy exists at all.

| Alternative                                                                                              | Educational summary                                                                                                     | Pros                                                                                                                        | Cons                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **1. A third root `config/` file, read and validated by the server; console origin baked at build time** | Matches the treatment `freshness.json` and `fleet-manifest.json` already get (see D6), and keeps startup failures loud. | • One place a reviewer looks for deployment configuration.<br>• Invalid port or origin fails startup by the same mechanism. | • The console's copy is build-time, so the two can still disagree; needs the same compatibility test D6 needs.                            |
| **2. Environment variables at server startup plus a Vite dev proxy**                                     | The server reads `PORT`/`HOST`/`ALLOWED_ORIGINS`; in development the console talks to its own origin through a proxy.   | • Conventional, and the proxy makes CORS a non-issue in development.<br>• No new file, no new schema.                       | • Development and production paths differ, so a CORS bug appears only in production.<br>• Two configuration mechanisms in one repository. |
| **3. The server serves the built console**                                                               | One process, one origin; the console fetches relative URLs.                                                             | • CORS disappears entirely.<br>• `pnpm dev`'s one-command promise gets simpler to keep true.                                | • Couples the server's lifecycle to a web build.<br>• Contradicts the "thin server" weighting and adds a static-asset concern to ADR 8.   |

**Recommendation (not ratified):** **Option 2 — environment variables at server startup plus a dev proxy — carrying option 1's validation discipline.**

`process.env` is already lint-restricted to `src/config/**`, which anticipates exactly this; pairing that with a schema that fails startup on an invalid port or origin gives the loud failure option 1 is chosen for, without adding a third root file for values that vary per machine rather than per deployment. The Vite dev proxy makes the one-command start work with no CORS at all, and the console's own API origin belongs in tenant configuration, per `CLAUDE.md`'s rule that endpoints live in typed configuration.

**What would change this call:** production serving the console from a different origin than the API, which turns CORS from a non-issue into a tested path.

**Implications if adopted:**

- **Touches:** `packages/server/src/config` (a runtime schema beside the two file loaders), `packages/web` (`vite.config.ts` proxy and an `endpoints` field on tenant config), `packages/simulator` (its hardcoded `127.0.0.1:8080` becomes a documented default rather than an assumption).
- **Sequencing:** blocks the first end-to-end run; nothing can be demonstrated until three packages agree on one origin.
- **Cost of reversal:** cheap — configuration keys and a proxy entry.
- **If it stays open:** three packages keep guessing, and the demo cannot be started from a clean clone, which is the one-command promise the README makes.

**Required evidence:** an invalid port or origin fails startup with the field named, rather than defaulting; one-command start from a clean clone reaches both the HTTP endpoint and the WebSocket from the console; and, if the origins differ, a rejected cross-origin request is tested rather than assumed.

---

## D14 — Fleet-table rendering at several hundred robots

**Question:** Does the fleet table virtualize, and if so by what mechanism — given that adding a dependency requires an ADR of its own?

**In plain terms:** The fleet table draws every row it is handed. With ten fake robots that is fine; the target is several hundred, and the project's own principles promise the table stays usable at that size. So: make it draw only the rows on screen, or stop promising.

**Current package position:** None. Principle 12 requires virtualized lists and a table usable at several hundred robots; `fleetPage.tsx` renders `filteredRobots.map(...)` with no windowing, against a 10-robot fixture set.

**Implementation:** Not started. `docs/ARCHITECTURE_AUDIT.md` § 4.3 records the gap and § 5 puts the browser table as the first thing in the whole stack to choke, at roughly 300–500 rows — before the server, which is the deliverable's own worst case. The estimate is unmeasured, which is itself part of what needs resolving.

### Educational context & solution weighing

This is the one open item where the claim, not just the implementation, is on the table: Principle 12 is a graded deliverable, so leaving the claim unmet is worse than narrowing it deliberately.

| Alternative                                              | Educational summary                                                                          | Pros                                                                                             | Cons                                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. A virtualization library**                          | Adopt an established windowing component for the table body.                                 | • Handles variable rows, scroll restoration and accessibility edge cases already solved.         | • Requires its own dependency ADR (ADR 6 § Constraints).<br>• Accessible table semantics and keyboard order need re-verification against WCAG 2.2 AA. |
| **2. Hand-rolled windowing**                             | Render a slice around the scroll position with spacer rows.                                  | • No dependency, no ADR.<br>• Small enough to read in one sitting.                               | • The edge cases the library solves are exactly the ones an audit finds later.<br>• Accessibility regressions are easy to introduce and hard to see.  |
| **3. Narrow Principle 12's claim to the measured scale** | Keep the plain map, measure honestly, and state the ceiling in the README and PRINCIPLES.md. | • Honest, and cheap.<br>• Keeps focus on the vertical slice the audit recommends shipping first. | • Gives up a graded claim.<br>• The delta stream will still re-render the whole table, so the ceiling may be lower than the row count suggests.       |

**Recommendation (not ratified):** **Option 3 now, option 1 once the transport exists.** Narrow the claim honestly today; virtualize against measured delta churn, not against a fixture.

The 300–500 row ceiling is an estimate taken against ten static robots. Virtualizing before the delta stream exists optimizes the wrong workload: the audit's own point is that the table re-renders on every delta, so windowing rows may not move the ceiling at all if the re-render is the cost. Measure with live deltas, then adopt a component — and evaluate MUI's own data grid first, because a second component system would cut against ADR 5's "no second styling system".

**What would change this call:** a measurement showing the plain map is fine at 500 rows under live deltas, which retires the item outright.

**Implications if adopted:**

- **Touches:** now, `PRINCIPLES.md` and the README measurements section (state the ceiling you can defend); later, a dependency ADR, the fleet table, and its accessibility evidence — a virtualized table has to keep semantic rows, keyboard order and focus visible under WCAG 2.2 AA.
- **Sequencing:** the measurement needs the transport, so this is gated behind **D10** and **D13**.
- **Cost of reversal:** not applicable in the interim — narrowing a claim is reversible by measuring.
- **If it stays open:** a graded principle stays unmet with no stated ceiling, which is worse than a stated smaller one.

**Required evidence:** a rendered-row assertion at 500 robots; a measurement of delta-apply cost at that size rather than an estimate; and README measurements, `PRINCIPLES.md` and the code agreeing on whichever ceiling is claimed.

---

## D15 — How stream connection state reaches the features that must suppress freshness

**Question:** By what channel do `features/fleet` and `features/robot` learn that the stream is down, without violating ADR 4's dependency rule (`features` may not import `app`)?

**In plain terms:** When the live connection drops, the console must stop showing per-robot freshness badges and let the banner explain the outage instead. The banner already exists at the top of the app, but the pages that draw the badges are not allowed to import anything from the app layer. So the fact has to travel by some other route.

**Current package position:** A recommendation only — a `ConnectionContext` declared in `shared/lib`, provided in `app`, consumed by both `AppShell` and the features, because `shared/lib` is the only layer both may import (`features/fleet/TODO.md` **A2**).

**Implementation:** Not started, and it is an ADR 3 correctness gap rather than a cosmetic one. `AppShell` takes `connectionState` as a prop that defaults to `"connected"`, and both pages render `FreshnessLabel` unconditionally, so a dead socket would leave every row asserting a currency the client cannot support (`features/robot/TODO.md` **R1**). The same hole exists in two features, which is why fixing it in one place only would create a second authority for one question.

### Educational context & solution weighing

The constraint is structural: the fact lives in `app`, the consumers are in `features`, and the arrow between them is banned. Every option is a different answer to "which shared layer owns connection state".

| Alternative                                                                            | Educational summary                                                                                  | Pros                                                                                                                                  | Cons                                                                                                                                              |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. `ConnectionContext` in `shared/lib`, provided in `app`** (current recommendation) | The only layer both sides may import holds the context; `app` supplies the value.                    | • Legal under ADR 4 without new element types.<br>• One provider, so one authority.<br>• `AppShell` and features read the same value. | • `shared` gains a stateful concern, having so far held pure helpers and presentational UI.<br>• Easy to grow into a general app store.           |
| **2. Connection state on the transport client / entity read model**                    | Features subscribe to the same client that delivers deltas; connection state is part of its surface. | • The state lives with the thing that produces it.<br>• No new context; features already read entities.                               | • Connection state is not robot state — Principle 11 warns against collapsing channels with different authorities and lifetimes.                  |
| **3. Prop drilling from `app` through the router**                                     | Pages receive `connectionState` as a prop.                                                           | • No new mechanism at all.<br>• Explicit and greppable.                                                                               | • Every intermediate component carries a prop it does not use.<br>• Nothing prevents a future page from forgetting it and re-asserting freshness. |

**Recommendation (not ratified):** **Option 1 — `ConnectionContext` in `shared/lib`, scoped to connection state and nothing else.**

It is the only option legal under the dependency rule that keeps a single authority, and Principle 11 rules out option 2 directly: connection state and robot state have different authorities and different lifetimes, and collapsing them is the failure that principle names. The real risk is drift into a general application store, so the module should export exactly the connection state, and say why in a comment that names the rule.

**What would change this call:** nothing structural — this item is blocked on the transport existing, not on the choice being hard.

**Implications if adopted:**

- **Touches:** `packages/web/src/shared/lib` (its first stateful module), `app` (the provider), and both features (label suppression).
- **Sequencing:** needs a transport client with a connection state to publish; the shape can be built and tested against a fake before that.
- **Cost of reversal:** cheap.
- **If it stays open:** both pages keep rendering per-robot freshness from a socket that may be dead — presenting stale state as current, which is the single thing the README's first guarantee says the console never does.

**Required evidence:** with the transport reporting disconnected, neither page renders a `FreshnessLabel` and `ConnectionBanner` states the condition; the test fails if the suppression is removed; and no client-side freshness timer exists anywhere in `packages/web` (ADR 3).

---

## D16 — The shape of a decode failure crossing adapter → server → console

**Question:** What does a rejected payload look like at each hop: what the adapter returns, what the HTTP error body carries, and what the console renders?

**In plain terms:** When something fails to decode, three places have to describe it: the adapter that rejected it, the server that counts it and answers the request, and the console that tells a technician what happened. Each is currently planning its own wording, and detail is lost at every handoff.

**Current package position:** Planned in three places and ratified in none. Adapters **A8** proposes building `AdapterError` on the contract's issue shape (`readonly issues: readonly ContractIssue[]`) rather than flattening to one `message` + `path`, because flattening discards the per-field detail the server's malformed-ingest metric wants. Server **D4** requires "a defined error shape carrying no vendor payload contents". Web **W-6** already renders `issue.path` and `issue.code` in its terminal error state, with the coupling recorded at contracts **C-4**.

**Implementation:** `ContractIssue` and `ParseResult` ship from contracts and the console already reads them. `AdapterError` still carries a single flattened message and path, and `packages/adapters` does not yet depend on `@fleet/contracts` at all (**A7**). No HTTP error body exists. Ordering matters here and is recorded in the adapters FIXME: `packages/server` already declares `@fleet/adapters`, so changing `AdapterError` after ingest is written is a breaking change across a package boundary rather than a free edit.

### Educational context & solution weighing

Three surfaces describe one event. The question is whether they share a vocabulary or translate at each hop — and translation is where per-field detail silently disappears.

| Alternative                                                         | Educational summary                                                                          | Pros                                                                                                                                | Cons                                                                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. One issue vocabulary end to end** (`ContractIssue` everywhere) | Adapter failures, ingest metrics and the console's terminal state all speak `path` + `code`. | • No translation, so no detail loss.<br>• The console's existing rendering already fits.<br>• One thing to test at three hops.      | • Couples the adapter error type to a contracts type (`A7` first, and before ingest lands).<br>• Contract issue shape becomes console copy. |
| **2. Adapters keep a flat error; the server re-derives detail**     | Each layer owns its own error shape and maps between them.                                   | • Packages stay independently evolvable.<br>• Adapters need no contracts dependency for errors.                                     | • Per-field detail is gone by the time the metric counts it.<br>• Two error vocabularies to keep aligned by review rather than by types.    |
| **3. A separate HTTP error contract in `packages/contracts`**       | Wire errors get their own schema, distinct from both adapter results and Zod issues.         | • The HTTP body is designed rather than leaked from an internal type.<br>• Easiest place to enforce "no payload contents" (**G6**). | • A third shape to maintain.<br>• Overlaps `ContractIssue` unless it is defined in terms of it.                                             |

**Recommendation (not ratified):** **Option 1 — one issue vocabulary end to end**, with the HTTP body defined _in terms of_ `ContractIssue` rather than as a third shape.

The console already renders `path` and `code`, so a single vocabulary costs a dependency adapters was going to take anyway (**A7**) and removes the two translation points where per-field detail disappears. Option 3's real concern — that no vendor payload content leaks into an error body — is a property of the HTTP envelope, and is satisfied by embedding issues in a designed envelope, not by inventing a parallel vocabulary alongside them.

**What would change this call:** a requirement to return errors to a consumer that must not see internal field paths, which would justify a separate outward-facing shape.

**Implications if adopted:**

- **Touches:** `packages/adapters` (**A7** dependency, **A8** error shape), `packages/server` (malformed-ingest metric and the error body), `packages/web` (already fits — no change).
- **Sequencing:** **do this before the server writes ingest.** `packages/server` already declares `@fleet/adapters`, so changing `AdapterError` is free today and a breaking cross-package change the moment an ingest handler consumes it.
- **Cost of reversal:** expensive after ingest lands; that asymmetry is the whole argument for deciding now.
- **If it stays open:** the adapter error shape gets frozen by whichever consumer reads it first, rather than by a decision.

**Required evidence:** a malformed fixture per vendor producing per-field issues at ingest; an HTTP error-body test proving no vendor payload content leaks (server **G6**); and the console's terminal state rendered from that body rather than from a locally constructed message.

---

## D17 — Numeric gates and budgets nobody has ratified

**Question:** Which of this repository's quality numbers are decisions, and which are placeholders — specifically the web bundle budget, the adapter coverage threshold, and where the ADR 2 harness figures are published?

**In plain terms:** Three numbers in this repository behave like rules — a bundle size, a test-coverage percentage, and the performance figures — but none was derived from anything and two are not enforced at all. A threshold nobody can defend gets deleted the first time it fails.

**Current package position:** Three unratified numbers, each recorded honestly by the package that invented it. Contracts **C-5** measures Zod's cost to the console (491.70 kB → 567.32 kB raw; 154.33 → 175.01 kB gzip) and notes "there is no bundle budget in the repository yet (Principle 12 asks for one); this is the first number to hold one against". Adapters **D8** proposes failing under 90% coverage for `src/vendors/**` and marks the number "one I picked … it has no derivation". ADR 2 commits to measurement at 50 and 500 robots with a stated falsification threshold, and its Observed consequences are still empty.

**Implementation:** No bundle budget, no coverage gate in `packages/adapters/vitest.config.ts`, and no harness. `docs/ARCHITECTURE_AUDIT.md` § 5 publishes estimates explicitly labelled as such, pending that harness.

### Educational context & solution weighing

Principle 12 asks for budgets, and a gate nobody defends is the specific failure adapters' own FIXME names: it will be raised or deleted the first time it fails, which makes it worse than no gate at all.

| Alternative                                          | Educational summary                                                                                        | Pros                                                                                        | Cons                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **1. Ratify each number with its derivation**        | Every gate lands with a sentence saying what it was derived from and what would justify changing it.       | • Gates become defensible under pressure.<br>• Matches how thresholds are treated in ADR 3. | • Requires deriving numbers that are currently guesses, which for the bundle budget means choosing a target device/network. |
| **2. Measure and report, gate nothing**              | CI publishes bundle size and coverage as reported numbers; no build fails on them.                         | • No false authority.<br>• Regressions are still visible in the diff.                       | • Nothing stops a slow slide.<br>• Principle 12's "budgets" claim stays unmet.                                              |
| **3. Gate only what has a consumer-visible failure** | Budget the bundle (an operator waits for it) and the harness numbers; leave coverage as a reported figure. | • Enforcement lands where a human notices the failure.<br>• Fewer numbers to defend.        | • Coverage becomes advisory in the one package whose fixtures are its primary evidence.                                     |

**Recommendation (not ratified):** **Option 3 — gate what a human notices, report the rest.**

The bundle is the one number an operator actually feels, and ADR 2 already states a falsification threshold for the harness, which makes both defensible as gates. The 90% coverage figure is self-described as underived; reporting it keeps the signal without the false authority, and avoids the outcome its own author warns about — a gate that gets raised the first time it fails.

**What would change this call:** adapters shipping with materially untested vendor mappings, which would justify deriving a real coverage threshold rather than deleting an invented one.

**Implications if adopted:**

- **Touches:** `packages/adapters/vitest.config.ts` (coverage reported, no threshold), CI (a bundle-size check against the contracts **C-5** baseline), ADR 2 § Observed consequences and the README measurements table (harness output replaces the audit's estimates).
- **Sequencing:** the harness needs a running server, so the bundle budget can land first and independently.
- **Cost of reversal:** cheap in both directions.
- **If it stays open:** three numbers keep reading like rules while enforcing nothing, in a repository whose thesis is that enforcement is what makes a rule real.

**Required evidence:** each surviving number carries its derivation in the file that enforces it; the ADR 2 harness output replaces the estimates in `docs/ARCHITECTURE_AUDIT.md` § 5 and lands in ADR 2 § Observed consequences and the README together; and a deliberate regression proves each gate actually fails (Principle 15).

---

## D18 — Raw vendor-payload retention and diagnostic access

**Question:** How much of the untrusted raw vendor payload does the server retain, for how long, under what size/redaction rules, and who may retrieve it from the single-robot diagnostic endpoint?

**In plain terms:** The server keeps the last raw message each robot sent so a technician can see exactly what the vendor transmitted. Nothing limits how big that message may be, nothing strips sensitive content out of it, and — because there is no login — nothing stops anyone who can reach the endpoint from reading it.

**Current package position:** Retain only the latest accepted payload for each robot, separately from canonical current state and history, and return it only from `GET /api/robots/:id` for technician diagnosis. ADR 1 decides the separation and endpoint placement; ADR 6 explicitly says raw-payload retention is a separate question and does not decide its lifetime or bounds.

**Implementation:** Already encoded without an authoritative decision. `CurrentStateStore` keeps one `rawPayload` object in every robot slot, replaces it on each accepted upsert, excludes it from `list()` and `history()`, and returns it from `diagnostic()`. The value is shallow-copied but has no byte/depth bound or redaction step. `robotDiagnosticEnvelopeSchema` accepts an arbitrary `Record<string, unknown>` and the robot-detail page prints it with `JSON.stringify`. The technician toggle controls presentation only; authentication and authorization are an explicit product cut, so today there is no server-side distinction between an operator allowed to read canonical telemetry and one allowed to retrieve vendor payloads.

### Educational context & solution weighing

Raw payloads are useful precisely because they preserve data the canonical model does not understand. That also makes them the least predictable data held by the server: a vendor can add a large nested value or a field containing identifiers or credentials. “Not in history” bounds the number of retained documents, but not their size, sensitivity, or exposure.

| Alternative                                                                                                                          | Educational summary                                                                                                                                                      | Pros                                                                                                                                                          | Cons                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Latest accepted payload per robot, with an ingest byte limit and explicit redaction policy** (current storage shape only) | Keep one diagnostic snapshot, reject an oversized request before adapter decoding, and redact or deny fields according to a documented boundary policy before retention. | • Preserves the useful latest-vendor view.<br>• Memory is bounded by fleet size × request limit.<br>• Sensitive-field treatment happens once, before storage. | • Redaction can remove the exact evidence a technician needs.<br>• A field policy must evolve with vendor dialects and cannot reliably identify unknown secrets by name alone.        |
| **2. Latest accepted payload exactly as received, request-size bounded, protected by a diagnostic permission**                       | Treat byte fidelity as the diagnostic requirement and rely on server authorization and audit to constrain access.                                                        | • Best evidence for adapter diagnosis.<br>• No misleading claim that generic redaction catches every secret.<br>• Retained memory remains calculable.         | • Requires an authentication/authorization capability currently cut from scope.<br>• A privileged endpoint still holds potentially sensitive vendor content in process memory.        |
| **3. Demo-only exact payload, request-size bounded, with the exposure stated explicitly**                                           | Keep the latest bytes without redaction or authorization only while this remains a local demonstration, and make that limitation visible in the ADR and UI.              | • Preserves diagnostic fidelity without pretending generic redaction is reliable.<br>• Can ship within the current no-authentication scope.<br>• Memory is bounded. | • Anyone who can reach the endpoint can read potentially sensitive vendor content.<br>• Must become a release blocker rather than silently surviving into a deployed environment.      |
| **4. Do not retain or serve raw payloads**                                                                                           | Keep only canonical data and structured adapter issues/counters.                                                                                                         | • Smallest security and memory surface.<br>• No new diagnostic authorization tier.                                                                            | • Reverses ADR 1 and the robot-detail specification.<br>• Removes the evidence needed to diagnose an unmapped or malformed vendor field after the request ends.                       |
| **5. Bounded per-robot raw-payload history**                                                                                         | Keep several exact source documents so technicians can compare changes over time.                                                                                        | • Stronger diagnosis of intermittent dialect drift.                                                                                                           | • Contradicts the current “latest only” implementation and materially expands memory/sensitive-data exposure.<br>• Needs a separately justified retention duration and export policy. |

**Recommendation (not ratified):** **Option 3 — demo-only exact payload with explicit exposure** — cap the request, keep the bytes verbatim, and do not claim to redact or authorize access.

Field-name redaction over an unknown vendor dialect offers assurance it cannot deliver: the fields you would need to name are exactly the ones you do not know about, and stripping them removes the evidence the endpoint exists to provide. Bound the thing that can actually be bounded — a request byte limit applied before JSON parsing and adapter work, which also protects ingest — keep the latest payload as received, and state plainly in the ADR and in the technician view that this endpoint is unauthenticated for as long as authentication remains cut. Option 5 multiplies both memory and exposure for a diagnosis case nobody has had yet.

**What would change this call:** any deployment beyond the demo, which turns the missing access rule from a documented cut into a blocker.

**Implications if adopted:**

- **Touches:** the ingest handler (byte cap before decode), `CurrentStateStore` (`slot.rawPayload = { ...rawPayload }` is a shallow copy, so a caller holding a nested object can still mutate retained evidence — deep-copy it or document decoded input as immutable), the robot-detail page (state the exposure rather than implying protection), and ADR 1/ADR 6, which defer retention lifetime and bounds to exactly this decision.
- **Sequencing:** the byte cap belongs in the ingest handler the first time it is written; retrofitting a limit after adapters run means the limit no longer protects the work it was meant to protect.
- **Cost of reversal:** cheap for the cap; deciding to redact later is a breaking change to what technicians can see, and to the tests that assert it.
- **If it stays open:** the server holds unbounded, unredacted, unauthenticated vendor content by accident rather than by decision — the worst of the four options, chosen by not choosing.

**Required evidence:** a request at the chosen maximum is accepted and one byte over it is rejected before JSON/adapter work; retained-memory arithmetic at 500 robots is recorded; raw payload never enters fleet, history, health, logs, errors, or WebSocket deltas; replacement rather than accumulation is proved; mutation of the caller's top-level and nested objects cannot mutate retained evidence (or the contract explicitly documents immutable decoded input); and the single-robot endpoint has a tested server-side access rule—or the ADR and UI honestly state that raw diagnostics cannot ship until such a rule exists.

---

## Existing ADR reconciliation required alongside these decisions

This is metadata/prose repair, not another architectural decision:

- ADR 1 is partially implemented but says Not started and retains stale artifact notes.
- ADR 2 has implemented producer/coalescer pieces but no server transport; its status should describe that boundary accurately.
- ADR 3 has contracts and server primitives but no live transport or web suppression; its status and “no code exists” notes are stale.
- ADR 6 has an implemented 60-entry ring buffer and current-state store while its header and related-artifact prose still say Not started.
- ADR 9 must reconcile its top-level `tsx` statement with its simulator exception and the currently unused server `tsx` dependency.

Found by the 19 August 2026 exhaustiveness pass, and different in kind — these are places where shipped code contradicts an ADR, not merely where an ADR is behind:

- **ADR 2's amended Decision has a contradicting artifact.** The amendment requires a monotonically increasing server-wide flush sequence on the snapshot and on every delta. `telemetryBatchSchema` in `packages/contracts` carries `sentAt` and no sequence, and no fleet-snapshot response schema exists, so the shipped contract cannot express the cold-start reconciliation the ADR decided. Amending an ADR whose status is Not started was safe on the reasoning that nothing had been built against the earlier text; part of it had. See **D10**.
- **ADR 8 is Not started, but one of its assumptions is already load-bearing.** Its assumption that the route shape “is already fixed by a working caller” is doing the work of a decision: the simulator ships against `/api/telemetry/:vendor` and the adapters vendor guard takes `unknown` specifically to receive that path segment. Either ratify it (**D9**) or record that two packages are built on an assumption.
- **The scale cliff spans ADR 2 and ADR 6 and is recorded in neither.** `docs/ARCHITECTURE_AUDIT.md` § 6 shows the first mitigation for ADR 2's named bottleneck — forking with `node:cluster` — invalidating ADR 6's in-memory state architecture, so the staged path has a cliff at step two. It is discoverable only by reading both ADRs together and noticing what neither says. Amend one of them; do not leave it only in the audit.
- **ADR 5's Partial status is accurate**, and its outstanding items (`FreshnessLabel` duplicating class styling inline, `TENANT_PALETTE` duplicating `tokens.css`, stylelint suppressions for spec-required BEM names, no recorded contrast evidence) are defects tracked at `packages/FIXME.md` **F8**, not decisions. Listed here only so a reader does not go looking for a stub that should not exist.

Do not mark an ADR Implemented merely because its pure primitives exist. Status must describe the complete decision, including the cross-package path the decision promises.

---

## Considered during the audit and deliberately not made stubs

Recorded so the next reader can see these were examined rather than missed:

- **Vendor B's web fixture declaring `lidarHealth`** (`useRobotDetail.ts`) against ADR 1's resolved `dock`-only profile. A fixture defect with an authoritative decision already behind it — `packages/FIXME.md` **F1**. The simulator's vendor B now emits no lidar source data, so the “vendor B emits lidar” note in `packages/simulator/TODO.md` § “Decisions taken that another package must honour” is stale and should be deleted rather than promoted.
- **`packages/web` being named `web` rather than `@fleet/web`.** A repository convention, not an architecture decision, though it costs two lint configs a two-spelling ban (adapters and server both note it). Fix or keep; either way it needs no ADR.
- **`@ts-nocheck` in the two adapter enforcement fixtures.** A tooling consequence with its risk already written down in the adapters FIXME.
- **Command endpoints.** Their absence is decided (`README.md` § 9, server **K1**); the preconditions for ever adding one are written at server **K2**. Nothing is open until someone proposes one.
- **Ring-buffer capacity and structure.** Resolved — array with a write cursor, 60 entries. Only ADR 6's Observed consequences need to catch up.
- **Simulator retry, overdue-work, fault-recovery, and shutdown policies.** These are package-local operational choices while the simulator remains the only caller. Their cross-package effects are already bounded by ADR 2's one-reading-per-request contract and the server's duplicate/out-of-order handling; promote one only if it changes that wire contract or a shared delivery guarantee.
- **Web resource-state unions and retry presentation.** Principle 5 and the page specifications already require the complete visible state set. The exact hook union is an implementation contract inside `entities/robot`, not an unresolved repository architecture choice; **D15** captures the one part that crosses feature/app boundaries.

---

**How to use this annotated register**

1. Pick the decision that is blocking the next pull-request — the at-a-glance table names what each one blocks.
2. Read the plain-terms line, then the pros/cons table.
3. Read the recommendation **and its falsifier**. Disagreeing with it is expected; disagreeing without addressing the falsifier is not.
4. Choose (or refine) an alternative, and check the implications block for what your choice drags with it and what it costs to undo.
5. Promote the choice into the appropriate ADR (or amend an existing one).
6. Update the implementation, the tests that constitute the required evidence, and the ADR’s “observed consequences” section in the same change set.
7. Delete the stub only after the decision has an authoritative home.
