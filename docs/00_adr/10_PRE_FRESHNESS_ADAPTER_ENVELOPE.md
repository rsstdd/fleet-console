# ADR 10 — Adapters Return a Validated Pre-Freshness Envelope

**Decision:** A vendor adapter returns `AdapterEnvelope` — every canonical envelope field except `freshness` — and the server completes it into a `CanonicalEnvelope` through `withFreshness`, which remains the only place freshness is written.
**Status:** Decided · 2026-08-19 · Partial
**Group:** Data / integration (the type-level half of ADR 1's boundary, carrying ADR 3's freshness authority into the type system).

## Issue

ADR 1 says an adapter translates a vendor dialect into one canonical envelope. ADR 3 says freshness is derived by a server-side sweep and by nothing else. Held together, those two decisions left an adapter with no legal value to return: `canonicalEnvelopeSchema` requires `freshness`, so building one meant inventing the single field the adapter is forbidden to assert.

The gap was not theoretical. `packages/adapters` was about to be written — three vendor modules and a dispatch registry, all returning the same type — and the register recorded the question as **D1**, the seam blocking the vertical slice everything else waits on. A type chosen late here is a type changed in three adapters and one ingest handler at once; a type chosen now costs one schema.

The wrong answers are both available and both cheap. An adapter can stamp a placeholder freshness the server overwrites, or the envelope can go unmodelled and be assembled by the server from loose parts. This ADR decides against both.

## Assumptions

- The server's ingest handler receives one whole pre-freshness value from the adapter rather than assembling an envelope from separately validated identity, core and capability parts. This is the assumption most likely to be wrong, and contracts `TODO_E2E_JOIN.md` **C-1** recorded it as the falsifier before any code existed: if ingest turns out to assemble from parts, this type is ceremony and the loose-parts shape is right.
- `freshness` stays the only server-owned field on the envelope. A second one would force either another pre-shaped schema or a different pattern entirely.
- Adapters are the only producer of this type. Nothing else in the system has a reason to construct an envelope that is deliberately incomplete.
- Three vendors is enough to fix the return type. A fourth vendor adds a module, not a shape (ADR 1).

## Constraints

- Freshness authority is not reopened. ADR 3 gives derivation to the server sweep exclusively; any position that lets an adapter write the field, even as a placeholder later overwritten, contradicts it and would require superseding ADR 3 first.
- The value crossing the adapter boundary must have a schema. `packages/contracts` exists so that no value crosses a package boundary on trust alone (Principle 2); an intermediate that only the type system knows about would be the one exception, at exactly the boundary that handles untrusted input.
- One authoritative implementation per rule (Principle 1). There must remain exactly one function that writes freshness, which is what contracts `TODO_E2E_JOIN.md` **C-2** turns on.
- The canonical and pre-freshness shapes may not be maintained as two hand-written field lists. Two lists that must agree are the drift this repository has already been bitten by in prose; here it would be silent.
- `withFreshness` must keep returning the identical reference when a canonical envelope's state is unchanged. The fan-out coalescer skips unchanged robots by identity (ADR 2), so widening the input may not cost that property.

## Decision

`packages/contracts` exports `adapterEnvelopeSchema`, its inferred type `AdapterEnvelope`, and `parseAdapterEnvelope`. The schema is the canonical envelope's field set minus `freshness`, strict like every other shape in the package, with capabilities decoded from the wire array into the runtime record exactly as the canonical envelope decodes them.

The two shapes are **derived from one field list, not written twice**. `preFreshnessShape` holds every field an adapter can produce; `envelopeBaseShape` is that shape spread with `freshness` added. A field added to the canonical envelope therefore reaches both, and `envelopeSchema.test.ts` carries a compile-time assertion — `keyof AdapterEnvelope` equals `keyof CanonicalEnvelope` minus `"freshness"` — that fails if anyone stops deriving it.

`withFreshness` is widened to accept `AdapterEnvelope | CanonicalEnvelope` and to return `CanonicalEnvelope`. It is the only bridge between the two, and it stays the only place freshness is written: the sweep's write and ingest's completion are the same call. No second constructor is added.

`AdapterEnvelope` never travels on the wire. It exists between a vendor adapter and the server's ingest handler and nowhere else; the canonical envelope is what gets stored, fanned out and serialized.

## Positions

1. **Adapter returns a validated pre-freshness envelope.** Chosen. One explicit "incomplete but valid" type, schema-validated at the boundary, with freshness authority intact.
2. **Adapter returns separately validated identity, core, provenance and capability parts; the server assembles.** Rejected, though it is the position most likely to be right if the ingest assumption above is wrong. Each piece can evolve independently, and there is no almost-canonical intermediate to explain. But the value that actually crosses the package boundary is then a bag of parts with no schema over the whole, the assembly logic is easy to get subtly wrong, and there is no single "this is what an adapter produces" contract for a test to assert against — which is precisely what three vendor adapters and their contract tests need most.
3. **Adapter supplies a placeholder freshness the server overwrites.** Rejected. It contradicts ADR 3 directly, and its failure mode is the worst kind: the placeholder is correct-looking, so an overwrite that is ever skipped produces a plausible freshness value nobody derived, which can then reach metrics, logs and the console. A rule enforced by remembering to overwrite is not a rule.

## Argument

Position 1 was chosen because it converts a documented rule into a mechanical one at the lowest available cost. "An adapter never asserts freshness" was, until this ADR, a sentence in two documents. It is now a compile error — the field is not on the type — and a runtime rejection: because the schema is strict, an adapter that supplies `freshness` anyway is rejected with an `unrecognized_keys` issue naming exactly that field, rather than having its value silently overwritten. Principle 15's standard is that a rule which cannot fail mechanically does not exist; this is the cheapest way to make this one exist.

The comparison that mattered was against position 2, not position 3. Position 2 is a real design, and its supporters have the better argument about evolution: a bag of independently validated parts never needs a "pre-X" schema when a second server-owned field appears. What decided it was the consumer. Three adapters and a registry are about to be written, and every one of them needs a return type that a contract test can assert against exactly. Position 2 gives them four types and an assembly step that lives in the server, which means the adapter's output — the thing the contract tests exist to pin — is never a single value anyone can name.

The accepted cost is stated plainly: a second schema and a conversion function today, and a second "pre-X" schema if another server-owned field ever appears. Deriving the two shapes from one field list is what keeps that cost from compounding into drift.

## Implications

**This is the roadmap half of the decision. Each item below is work the decision creates, a constraint it imposes, or a property it now guarantees.**

- **The adapter return type is fixed before the first adapter exists.** That was the point of the timing. `packages/adapters` must now take its dependency on `@fleet/contracts` (its TODO **A7**) and write `B1`–`B3` and `C2`–`C4` against `AdapterEnvelope`. Landing this after three vendor modules existed would have been a change to all three plus their contract tests.
- **The server's ingest handler has exactly one way to finish an envelope.** It calls `withFreshness` with the receipt instant's derived state. There is no other constructor to reach for, and adding one would reopen contracts **C-2** and weaken ADR 3 from a guarantee to a convention.
- **A new canonical field is now one edit, not two.** `preFreshnessShape` is the single field list; the canonical shape is derived from it. The compile-time assertion in `envelopeSchema.test.ts` is what makes that stay true, so it must survive refactoring — it looks like a redundant type test and is not.
- **The pre-freshness type is in-process only.** It is exported from `@fleet/contracts` but never serialized. Putting `AdapterEnvelope` into an HTTP response or a WebSocket frame would be a different decision, not an application of this one.
- **A per-message runtime cost is now possible but not mandated.** If the server calls `parseAdapterEnvelope` on every reading, that is a second full schema validation per message, inside the budget ADR 2 committed to measuring at 2,500 messages per second. See Open questions — the current lean is that adapters validate their output in contract tests, not on every message.
- **`packages/contracts`' public surface grew by three exports** (`adapterEnvelopeSchema`, `AdapterEnvelope`, `parseAdapterEnvelope`), each pinned by name in `src/index.test.ts`. That pin means the barrel cannot grow by accident, and it also means every future export is a deliberate edit to a test.
- **The sweep is unaffected.** Widening `withFreshness` preserved reference identity for an unchanged canonical envelope, which ADR 2's coalescer depends on to skip robots without deep comparison. A future change to this function must re-check that property; the test that pins it says why.
- **The adapter evidence exists; the server evidence remains deferred.** Every vendor
  contract suite asserts that freshness is absent. A server ingest test must still prove
  registry output is completed only through `withFreshness`, but ADR 10's runtime
  re-validation question and ADR 11's server-fixture-access question are unresolved. The
  status remains Partial until those decisions permit that consumer evidence.
- **`packages/web` is untouched and must stay that way.** The console consumes `CanonicalEnvelope` and has no business knowing that a pre-freshness form exists; if `AdapterEnvelope` ever appears in the web package, the boundary this ADR draws has been crossed.

## Open questions

- ~~**Does the server re-validate the adapter's output at runtime, or trust the type and validate only in contract tests?**~~
  **Closed 20 August 2026, ratifying the stated lean on the event this question named** (the ingest handler, which reached it before ADR 2's harness did). Contract tests only. The vendor payload is decoded once by the adapter's own schema, and a second full parse per reading doubles the per-message validation cost ADR 2 is measuring — against an input that is not untrusted by the time it arrives, because `packages/adapters` produced it. `parseAdapterEnvelope` stays exported for the tests and for any caller that wants it, and is **not** a mandated ingest step.
  The limit of this, stated plainly: it trusts `packages/adapters` to be correct at runtime, so an adapter bug reaches fleet state as a well-typed wrong value rather than a rejection. That is accepted because the adapter's own contract tests assert exact output per vendor and the boundary this ADR protects — no adapter supplies `freshness` — is a compile error and a strict-schema rejection in the adapter's own tests, not something a re-parse at ingest would be the first to catch. **Reverse it by measurement:** if ADR 2's harness shows validation is not the bottleneck, a `parseAdapterEnvelope` call at ingest is one line and buys a runtime guarantee.
- **Does ingest receive a whole pre-freshness value, or assemble one from parts?**
  _Current lean:_ a whole value, which is what this ADR assumes. Position 2 becomes correct if the handler ends up assembling.
  _Resolves on:_ the ingest handler being written (`packages/server` TODO **D1**–**D2**).
- **Does a second server-owned envelope field ever appear?**
  _Current lean:_ no. If one does — a server-assigned ingest sequence is the plausible candidate — this pattern forces either another pre-shaped schema or a rethink of the whole approach, and position 2 should be re-read at that point.
  _Resolves on:_ the first proposal for such a field.

## Observed consequences

- 20 August 2026: all three adapter suites now assert absence of freshness. The server
  half remains deferred and is flagged prominently in `packages/adapters/TODO.md`; no
  implementation chooses the open runtime-validation or server-fixture-access questions.

- 19 August 2026: implemented in `packages/contracts` and green across the workspace — `adapterEnvelopeSchema`, `AdapterEnvelope` and `parseAdapterEnvelope` exported; `withFreshness` widened; 103 contracts tests passing, and `packages/adapters`, `packages/server`, `packages/simulator` and `packages/web` all typecheck and test unchanged against the widened signature. The widening was source-compatible: no existing caller changed.
- 19 August 2026: measured against contracts `TODO_E2E_JOIN.md` **C-5**, the console's bundle moved from 567.32 kB raw / 175.01 kB gzip to **567.36 kB / 175.03 kB** — 40 bytes raw, 20 gzip. The new schema is a spread of shapes already in the bundle, and `packages/web` never references it, so the residue is barrel plumbing rather than the schema itself. Recorded because C-5 asked for the number to be re-measured rather than assumed, not because the delta is interesting.
- 19 August 2026: the strictness of the schema turned out to carry more weight than expected. An adapter that supplies `freshness` is rejected with `unrecognized_keys` naming that field, so the rule fails loudly at runtime as well as at compile time. The test asserting this read the raw Zod issue rather than the flattened contract issue, because `ContractIssue` dropped the key list — a small gap in the contract error shape, noted here rather than fixed, since **D16** was deciding that shape. **Closed 19 August 2026 by [ADR 20](./20_ONE_ISSUE_VOCABULARY_END_TO_END.md):** `toContractIssues` now expands an `unrecognized_keys` issue into one issue per key with the key in the `path`, and this test asserts on the contract issue.

## Related

- `ADR 1 — decided the adapter boundary and the canonical envelope; this ADR names the value an adapter is actually able to return.`
- `ADR 3 — gives freshness derivation to the server sweep alone; this ADR is the type-level enforcement of that authority and is void without it.`
- `ADR 2 — the coalescer depends on withFreshness returning an unchanged canonical envelope by identity, a property this widening preserves; its measurement harness also owns the open question about per-message re-validation.`
- `Principle 1 (one authoritative implementation) — the reason a second freshness constructor is excluded rather than merely discouraged.`
- `Principle 2 (external contracts are decoded once, at the boundary) — the reason the intermediate has a schema instead of being type-only.`
- `Principle 15 (a rule that cannot fail mechanically does not exist) — the reason strictness matters here as much as the missing field.`
- `Artifact packages/contracts/src/envelope/envelopeSchema.ts — preFreshnessShape, adapterEnvelopeSchema, and the widened withFreshness.`
- `Artifact packages/contracts/src/envelope/envelopeSchema.test.ts — the compile-time assertion that the two shapes differ by exactly one field.`
- `Artifact packages/adapters — the consumer; its TODO A7, B1–B3 and C2–C4 are written against this type.`
- `Artifact packages/server — the other consumer; ingest completes the envelope through withFreshness (TODO D1–D2).`
- `docs/PENDING_ARCHITECTURE_DECISIONS.md D1 — the stub this ADR resolves.`

## Notes

- 19 August 2026: **the short version of the implications, for anyone who reads only this section.** An adapter can no longer produce a canonical envelope, by construction. Adapters must be written against `AdapterEnvelope`; the server must complete every envelope through `withFreshness`; and a canonical field added later belongs in `preFreshnessShape`, which both shapes derive from. The type is in-process only and must never appear on the wire or in `packages/web`. This ADR stays **Partial** until the server ingest evidence exists; the adapter half is proved.
- 19 August 2026: position 2 was not rejected on merit and is the fallback if the ingest handler turns out to assemble the envelope from parts. Check the assumption before writing that handler, not after.
