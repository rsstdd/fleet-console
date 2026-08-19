# ADR 1 — Adapter Boundary With a Canonical Core Plus Declared Capabilities

**Decision:** Each vendor dialect is translated by its own adapter module into one canonical envelope with a normalized core and a separate record of declared capabilities.
**Status:** Decided · 2026-08-19 · Not started
**Group:** Data / integration (the seam between untrusted vendor-specific wire formats and the typed internal domain).

## Issue
Three simulated vendor dialects disagree on payload shape, units, timestamp format, status vocabulary, and which fields exist at all. Every downstream consumer — the server's upsert logic, the freshness machine, the fleet table, robot detail — needs one consistent model to work against. Without one, each re-implements vendor-awareness independently.

This ADR decides what that model is: how much of it is genuinely shared across vendors, how much is vendor-specific and must stay vendor-specific without being hidden, and where the line falls. The line can be drawn wrong in two directions. Flattening real differences erases what multi-manufacturer normalization exists to handle. Failing to normalize genuine sameness pushes the problem downstream unchanged.

## Assumptions
- The capability model is what the front end's capability-driven rendering actually renders from, so a weak model here degrades the front end more than a shortcut anywhere else in the data layer would.
- Three vendors is enough to make the normalization argument concrete without a fourth. Which two vendors share more is deliberate: A and C are both roughly nested-payload-and-fraction-battery; B alone is flat, integer, and sequence-less. If one vendor is cut under time pressure, the one dropped overlaps most with another rather than carrying the most distinct information.
- Fidelity to the problem shape matters more than exact reproduction of any real vendor's protocol. The three dialects are a realistic shape of the multi-vendor problem, not a reconstruction of a specific competitor's integration, which is why they are named A, B, and C.

## Constraints
- Vendor names, fixtures, and documentation stay generic — A, B, C — and never name a real integration partner. Recorded during design review rather than as a separate ADR.
- Every non-core field must trace to a declared capability that a specific vendor's adapter actually sets. A field that exists on the canonical type but is simply unpopulated for some vendors is the "hard-coded panel list" failure mode principle 3 exists to prevent, and is treated as a defect in review.
- The adapter contract tests — one fixture per vendor, asserting exact canonical output — are the primary evidence this decision is real. Per principle 3's own caution, one fixture per vendor is a smoke test rather than proof of the entire mapping. The fixtures should include at least one boundary or malformed case per vendor where time allows.

## Decision
Each vendor dialect is translated by its own adapter module into one canonical envelope. The envelope's normalized core carries only fields genuinely shared in meaning across all vendors — robot identity, connectivity, battery, position, status, and health — represented in one set of units and one status vocabulary regardless of what the source vendor sent. The canonical envelope carries two distinct timestamp fields: `reportedAt`, the vendor-supplied instant normalized to epoch-milliseconds, and `receivedAt`, the server's own receipt instant.

Everything else is expressed as a declared capability: a single record mapping a capability name to its payload (`capabilities: Partial<Record<CapabilityName, CapabilityPayload>>`), where key presence is the declaration itself. Currently defined capabilities are `dock`, `lidarHealth`, `waterLevel`, and `sequence`. These are never modeled as hard-coded fields on the canonical type that happen to be empty for some vendors. The wire type for this record is an array of key-value payload objects, transformed via Zod into the runtime record type so it survives JSON serialization across the WebSocket boundary.

The canonical status enum is `idle`, `busy`, `charging`, `fault`, `unknown`. Health severity (`nominal`, `degraded`, `critical`) is a separate field rather than folded into status. Three vendor dialects are modeled — A, B, and C, generic names rather than any real integration partner — each deliberately disagreeing with the others in a specific, documented way. Unknown fields a vendor sends that the adapter does not recognize are counted, not silently dropped. The raw payload is retained for diagnosis but excluded from the fleet read model and the delta stream; it is served only as a separate field on the single-robot endpoint. Adding a fourth vendor means adding one adapter module and its fixtures. It never means editing the canonical envelope.

## Positions
1. **A universal schema, with every field any vendor might report present on the canonical model, populated when available and null otherwise.** Rejected: this is the specific failure Budylskii's framing warned against, and it fails in both directions at once. It pretends every robot is the same shape. That forces the UI either to render meaningless fields for robots that do not have them, or to maintain its own vendor-awareness to know which nulls to hide — silently reintroducing the vendor conditionals this design exists to eliminate.
2. **No normalization at all — the server exposes three parallel vendor-specific APIs and the front end handles the difference.** Rejected: this relocates the problem rather than solving it. Every consumer — table, detail view, freshness machine — would need vendor-awareness independently, which is a worse version of the coupling a shared canonical core removes.
3. **Capabilities modeled as optional properties directly on the canonical envelope type (e.g., `envelope.dockStatus?: DockCapability`), rather than as a separate declared capability record.** Considered, since TypeScript's optional-property syntax makes this the path of least resistance. Rejected as the primary mechanism on enforceability grounds. An optional property carries no obligation for any adapter to make an explicit decision about it. A capability model whose purpose is letting the UI ask "can this robot do X" needs that question to have a definite answer derived from an adapter's explicit action, not from a passive absence.
4. **Canonical core plus a declared capability record, adapters translating vendor-specific payloads into both.** Chosen.

## Argument
The canonical-core-plus-capabilities model was chosen because it is the only option that makes the front end's capability-driven rendering literally true rather than approximately true. A robot's detail view renders exactly the panels its adapter declared. There is no representable state in which a panel appears for a capability the robot does not have, because absence is a first-class fact rather than an unpopulated optional field.

The universal-schema alternative was rejected because Budylskii named it directly as the wrong answer to this problem, which makes it the position requiring the least additional argument.

Keeping a separate declared-capability record rather than relying on TypeScript optionality alone is the more debatable call. Optionality removes the obligation for an adapter to make an explicit decision. A mapped record makes a capability's presence an explicit, checkable act by a named adapter.

## Implications
- Adding a new capability (a fifth vendor field beyond `dock`, `lidarHealth`, `waterLevel`, `sequence`) is a contracts-layer change first — the capability name and its payload shape are added to `packages/contracts` — and only then a panel-mapping change in the front end, per the robot-detail page spec's own change rule. This ADR is why that ordering is enforced rather than arbitrary.
- The unknown-field counter is per adapter, surfaced on the health endpoint, so Vendor C's undocumented field is never silently dropped. The count is per-adapter, not per-robot. The robot-detail diagnostics panel must label it accordingly rather than implying a precision it does not have.
- A related precision requirement for the same panel: showing "0 gaps" for a robot that is not checked for gaps is a false statement to an operator. The panel spec must render not-evaluated robots distinctly rather than displaying a zero count.
- Because the raw payload is excluded from the fleet read model and the delta stream, any future capability discovered to be missing from the canonical model requires a contracts change to expose it properly. There is no fallback path where the front end reaches into the raw payload to patch around a missing capability. That constraint is deliberate.
- The three vendors' specific disagreements (A: nested, fractional battery, metres, ISO timestamps; B: flat, integer battery, centimetres, epoch-ms, no sequence; C: mostly like A, plus `waterLevel`, minus `lidarHealth`, plus one undocumented field) are load-bearing test fixtures rather than incidental flavour. Removing or "cleaning up" any of these disagreements under time pressure removes the specific evidence the adapter contract tests produce.

## Open questions
- **Does the declared-capability-record approach earn its complexity once written, or do TypeScript's discriminated unions make the distinction less load-bearing in practice than argued?**
  *Current lean:* None. The argument holds on paper and has not met code.
  *Resolves on:* Code written for `packages/contracts` and `packages/adapters`.
- **Are `degraded` and `critical` sufficient health severities, or should `fault` status always imply `critical` health severity as a derived invariant rather than two independently-settable fields?**
  *Current lean:* If the two fields need that constraint, it belongs in the schema as a validation rule.
  *Resolves on:* Real fixtures are written.

## Observed consequences
-

## Related
- **ADR 4** (feature-sliced structure, enforced dependency rule) — the entity layer's prohibition on importing React or MUI exists so the capability-to-panel mapping this ADR enables can be tested as pure domain logic, independent of rendering.
- **ADR 2** (transport) — the validation cost ADR 2 reasons about is validation against this ADR's canonical envelope schema; the two ADRs describe the same contract from either side of the wire.
- **ADR 6** (bounded in-memory history, no database) — history and current state both store this canonical envelope, not raw vendor payloads, which is part of why history stays small.
- **Principle 2** (external contracts are decoded once and evolved deliberately) — this ADR's envelope is that contract, and the boundary where it is decoded.
- **Principle 3** (the canonical model preserves shared meaning without erasing differences) — this ADR is its direct implementation, and the principle most explicitly tested by the adapter contract fixtures. Vendor-specific behaviour is a capability, never a branch in a component.
- **Principle 4** (provenance and freshness are explicit where they affect a decision) — indirect; freshness is carried alongside the canonical core rather than as a vendor-specific capability, and the envelope's two timestamps are what make age evaluable at all.
- **Budylskii's framing** (avoiding a universal schema) — the direct source of Position 1's rejection.
- **Artifact `packages/contracts`** (not yet implemented) — the canonical envelope type, the capability record type, and the Zod schemas validating both, including the array-to-record transform.
- **Artifact `packages/adapters`** (not yet implemented) — one module per vendor dialect, with fixtures.
- **Artifact `docs/01_page-specs/02_ROBOT_DETAIL.md`** — the capability-driven rendering rule this model makes literally true.
- **Artifact `packages/server`'s health endpoint** (not yet implemented) — surfaces the per-adapter unknown-field count.

## Notes
- 19 August 2026: decision recorded ahead of implementation.
- **Amendment (Recorded):** Initial iterations carried a parallel `Set<CapabilityName>` alongside optional payload fields. That duplicated information and gave no type-level guarantee the two agreed — an adapter could declare a capability but omit its payload, or the reverse. The initial rejection of Position 3 also overstated the ambiguity of undefined properties. Both are resolved in the current Decision and Position 3. Capabilities are now a mapped record `Partial<Record<CapabilityName, CapabilityPayload>>` where key presence is the declaration, which eliminates representable drift and provides exhaustiveness checking against `CapabilityName`. The wire type is an array, transformed via Zod to the runtime record to survive JSON serialization. Position 3's rejection was narrowed to enforceability of an explicit adapter decision.
