# ADR 25 — Contracts Owns Every Response the Console Decodes, and the Two Counters Are Separated by Their True Scope

**Decision:** `packages/contracts` models every server response the console decodes — adding `healthResponseSchema` beside the existing envelope and fleet-snapshot schemas — and defines "not evaluated" once as a discriminated `sequenceHealth`; per-robot sequence continuity moves onto the diagnostic envelope while unknown-field counts stay per-adapter on the health response.
**Group:** Data / boundaries (which package owns a shape both sides of the wire read).
**Status:** Decided · 2026-08-19 · Partial

## Issue

Three server responses reach the browser: the fleet list, the health numbers, and one robot's diagnostics. Register stub **D12** asked whether contracts models them, and how a robot whose sequence cannot be evaluated appears on the wire.

`packages/contracts/TODO.md` § 6 said "add only boundary types that are genuinely shared by multiple packages; server-only response composition stays in `packages/server`". Principle 2 requires the console to decode everything it receives, which makes all three shapes shared _by definition_ — so the rule and the principle disagreed, and the rule was winning.

The proof that this was a real defect rather than a taxonomy argument is that **one fact already had two spellings**. `packages/server` typed sequence health as `{ evaluated: false } | { evaluated: true; gaps; duplicates }`. `packages/web` typed the same fact as `sequenceGaps: number | null` and injected it into `toRobotDetail` from outside the envelope, because nothing on the wire carried it. Neither package could see the other's version, and nothing compared them.

That fact is worth more than most. `docs/ARCHITECTURE_AUDIT.md` singles it out as a distinction almost nobody makes: reporting **`0 gaps` for a vendor that sends no sequence at all is a false statement to an operator**. A distinction that valuable should not be re-derived per package.

## Assumptions

- The console decodes every response it receives and constructs none of them from an HTTP status. That is Principle 2, and it is what makes these shapes shared rather than server-internal.
- `robotDiagnosticEnvelopeSchema` has no consumer on the wire yet — the server serves nothing — so adding a required field to it is cheap today and a coordinated change later.
- Sequence continuity is genuinely per robot. Each robot has its own vendor counter, so an adapter-scope rollup cannot answer "did _this_ robot miss readings".
- Unknown-field accounting is genuinely per adapter and has no per-robot precision to offer. ADR 15 decided that and this ADR does not reopen it.

## Constraints

- **Adding a vendor must never be a contracts change** (ADR 1). Any per-adapter map here is keyed by open identifier, never an enum.
- **The unknown-field count and the malformed-ingest count must never be summed** (ADR 15). Their pairing is the signal.
- **No raw vendor payload leaves the diagnostic boundary** (ADR 1). The health response carries counts, never content.
- Canonical schemas are strict, and decoding never coerces (Principle 2).
- One authoritative implementation per rule (Principle 1) — which is precisely what two spellings of "not evaluated" violated.

## Decision

**Contracts owns every response the console decodes.** `fleetSnapshotSchema` already landed with ADR 18; this ADR adds `healthResponseSchema` in a new `src/health/` module, with `parseHealthResponse`, `adapterHealthSchema`, `unknownFieldTallySchema`, `unknownFieldScopeSchema` and `lateFreshnessTicksSchema`. The TODO rule is narrowed rather than deleted: server-only composition stays in the server for responses **no console reads**.

**"Not evaluated" is defined once**, as `sequenceHealthSchema` in `shared/primitives.ts`:

```
{ evaluated: false } | { evaluated: true; gaps: number; duplicates: number }
```

Discriminated rather than nullable, and that is the load-bearing part. A `number | null` is indistinguishable from "the field was absent", so a consumer that forgets the check renders `0` and is believed. Here **there is no `gaps` field to read until `evaluated` has been checked**, which makes the distinction structural rather than remembered.

**The two counters are separated by their true scope**, which is what dissolves the apparent conflict with ADR 1:

| Fact                          | True scope      | Where it travels                                  |
| ----------------------------- | --------------- | ------------------------------------------------- |
| Sequence continuity           | per **robot**   | `robotDiagnosticEnvelopeSchema.sequenceHealth`    |
| Unknown fields                | per **adapter** | `healthResponseSchema.byAdapter[…].unknownFields` |
| Adapter's own sequence rollup | per **adapter** | `healthResponseSchema.byAdapter[…].sequence`      |

The adapter rollup and the per-robot value share one schema so "not evaluated" has one representation, and they answer different questions — "is this dialect ordered at all" against "did this robot miss readings". They must never be summed or substituted, and both are labelled by the schema they sit on rather than by a comment.

**`packages/server` imports the contract's `SequenceHealth`** instead of declaring a structural twin, so the server, the wire and the console are one declaration.

**`packages/web`'s `AdapterHealthCounters` loses `sequenceGaps`** and keeps only `unknownFieldCount` — an interface that is now honestly named, because everything left on it really is per-adapter.

## Positions

1. **Contracts owns every response the console decodes.** Chosen. One decode authority, one vocabulary, and the console cannot invent a representation — which it had already done once.
2. **Contracts owns telemetry only; web keeps local decoders** (the status quo). Rejected. Two declarations of one shape is the drift Principle 1 forbids, and the evidence was already on disk in two spellings of one fact.
3. **Move per-robot counters onto the envelope wholesale.** Rejected as stated, and partly adopted once split. Putting _unknown-field_ counts per robot implies a precision the ledger does not have (ADR 15). Putting _sequence_ counts per robot is simply correct. The stub's own recommendation is that separating them by scope is what makes option 3's good half compatible with ADR 1.

## Argument

The stub framed this as "does contracts model these shapes", but the question that decided it is narrower: _what does a fact's scope tell you about where it belongs?_ Once asked that way, option 3's conflict with ADR 1 disappears. Unknown fields are per-adapter because that is the only precision the ledger has; sequence gaps are per-robot because that is the only precision that answers the question. Both were being treated as one category — "counters the technician view shows" — and that category was the mistake, not either counter.

The discriminated shape over `number | null` deserves its own defence, because `number | null` with a documented meaning was named as the acceptable minimum. It is not equivalent. The failure mode is a consumer writing `gaps ?? 0` — which reads as defensive, passes review, and produces the exact false statement the distinction exists to prevent. **Verified rather than argued:** rewriting the console's selector that way does not compile, because `gaps` does not exist on `{ evaluated: false }`. Under `number | null` it would have compiled and shipped.

The cost is the one option 1's own column names: contracts grows response-composition concerns its TODO tried to keep out, and every server response change is a contracts change first. That is accepted, and the ordering is the point — the console's fixtures already anticipate these shapes, so the alternative is not "no coupling" but "coupling nothing checks".

## Implications

- **`GET /api/health` has a shape for the first time.** `packages/server` composes no responses yet; when it does, `HealthMetrics.snapshot()` and the adapters' `UnknownFieldSnapshot` must serialize into this schema rather than into a shape invented at the handler.
- **`robotDiagnosticEnvelopeSchema` gained a required field.** The server must supply `sequenceHealth` per robot, which means it needs per-robot sequence tracking — today `HealthMetrics` keys `#sequence` by **adapter id**, not robot id. That gap is real, is server work, and is now named rather than latent.
- **The console renders duplicates as well as gaps**, on the same terms. Both selectors read one field, so a robot can never report "not evaluated" gaps beside a duplicate count.
- **Every counter on the health response is adapter- or process-scoped**, asserted by a test over its key set. A per-robot field added there later is a decision to reopen, not a convenience.
- **`byAdapter` is keyed by open identifier.** A fourth vendor appears in the health response with no contracts change, which is ADR 1's rule holding at a new surface.
- **`unknownFieldScope` travels as data**, so the console renders its "(adapter, accepted payloads)" caveat from the value rather than a hardcoded string (ADR 15). A rejected-payload ledger arrives as a second scope and renames nothing.
- **Contracts' public surface grew by six runtime exports and four types**, pinned by name in `index.test.ts`, so this was deliberate rather than drift.
- **`packages/web`'s W-8** — the entity TODO item recording that counters are injected because no envelope carries them — is half closed. The sequence half is gone; the unknown-field half stays, correctly, and now has a schema to arrive from.

## Open questions

- **Should the server track sequence continuity per robot as well as per adapter?** It must, to populate the envelope field this ADR added. Whether the per-adapter rollup is then derived from the per-robot map or accumulated separately is a server implementation choice with a real memory implication at 500 robots.
- **Does `capturedAt` on the health response earn its place?** It is there as the analogue of the fleet snapshot's, and nothing consumes it yet. The same question ADR 18 left open about `fleetSnapshotSchema.capturedAt`, and the two should be answered together.
- **Should the diagnostic envelope carry a per-robot unknown-field count?** Deliberately not added. The ledger has no such precision (ADR 15), and adding a field the server would have to invent a value for is the defect ADR 1 calls out. If per-robot accounting is ever built, this is where it goes.

## Observed consequences

- 19 August 2026: implemented across three packages. Contracts at 150 tests, up from 131; web at 204, up from 197; server unchanged at 76 with one type declaration deleted.
- **Making `sequenceHealth` required broke exactly two contracts tests** — the diagnostic envelope's — and nothing else, confirming the schema had no other consumer. The web break was larger and entirely in tests, which is the injection point disappearing.
- **The false-zero was probed in both directions.** Written naturally (`health?.gaps ?? 0`) it **does not compile**: `Property 'gaps' does not exist on type '{ evaluated: false; }'`. Forced through with a cast, **five tests fail**, including one that renders the page and asserts the operator never sees `0`. Under the old `number | null` the first version would have compiled and shipped.
- The duplicate-count row exposed a real test weakness: the page test used `getByText("Not evaluated")`, which throws once two rows say it. Asserting `getAllByText(...)` has length 2 is the stronger claim — that both continuity rows agree — and a complementary test now covers a robot whose sequence _is_ counted, so "Not evaluated everywhere" cannot pass for the wrong reason.
- **The boundary-enforcement suites flaked three times during this work, in two packages** — `packages/simulator`'s twice and `packages/server`'s once — each passing on re-run and in isolation. They lint files on disk with a programmatic ESLint instance while `pnpm --recursive` writes to the tree in parallel, so the failures are unrelated to the boundaries they assert. This was noticed only because the same suite failed twice in one session; a single occurrence reads as noise. Recorded as `packages/FIXME.md` **F14**, scoped to the pattern rather than the two files caught, since `packages/adapters` has the same shape. ADR 7 records what happens when a boundary guard stops being trusted.

- **20 August 2026 — the fleet-snapshot response widened under schema version 3 (ADR 34).** `GET /api/fleet` now carries a required `sites` directory; contracts remains the one decode authority for it, and the ownership boundary this ADR drew held with no new mechanism: `fleetSiteSchema` and the widened `fleetSnapshotSchema` live in contracts, the server encodes through them, and the console decodes through `parseFleetSnapshot` alone. A version-2 body is rejected at the same single boundary rather than in any consumer.

## Related

- **ADR 1** (adapter boundary) — the source of the per-adapter constraint on unknown fields and of the open-identifier rule this schema honours at a new surface.
- **ADR 15** (unknown fields counted on accepted payloads only, under a scope-named metric) — supplies `unknownFieldScope` and the rule that its count and `malformedIngest` are never summed.
- **ADR 18** (flush sequence now, delta granularity when measured) — added `fleetSnapshotSchema`, which was the first response shape contracts owned; this ADR completes the set and generalises the reasoning.
- **ADR 20** (one issue vocabulary end to end) — the same argument for error bodies, decided two days' work earlier. Together these two mean the console decodes every response and every failure with contract types.
- **ADR 8** (server transport) — owns the handlers that must serialize into these shapes; none exists yet, which is why this ADR is Partial.
- **Register D12** — resolved by this ADR; the stub is now a tombstone.
- **Principle 1** (one authoritative implementation) — two spellings of "not evaluated" was the violation; one derived schema is the repair.
- **Principle 2** (decode at the boundary, never coerce) — the reason the console's responses are contract types at all.
