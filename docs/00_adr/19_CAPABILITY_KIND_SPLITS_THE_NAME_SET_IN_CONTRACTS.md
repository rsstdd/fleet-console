# ADR 19 — Every Capability Is Classified Operator or Diagnostic in Contracts, and Both Name Sets Are Derived From That

**Decision:** `packages/contracts` classifies every capability as `operator` or `diagnostic` in a total `CAPABILITY_KINDS` mapping and derives `OperatorCapabilityName` and `DiagnosticCapabilityName` from it; `packages/web` keys its panel registry off the operator-facing set instead of maintaining its own exclusion list.
**Group:** Data / presentation boundary (which capabilities earn an operator panel, and where that fact lives).
**Status:** Decided · 2026-08-19 · Implemented

## Issue

ADR 1's headline rule is that the console renders exactly the capabilities the adapter declared. `sequence` is declared like a capability and must never render like one: it is the vendor's reading counter, which is a fact about the integration rather than about the machine, and robot detail shows it under Diagnostics (page spec 03 § 6).

So the rule carried a permanent exception, and register stub **D11** asked whether `sequence` should be a capability at all given that every capability-rendering surface has to carve it out by name.

The exception was enforced by prose and by three hand-written lists in `packages/web`, none of which any check compared to the contract:

- `entities/robot/model.ts` declared `DiagnosticCapabilityName = "sequence"` as a literal, with `PanelCapabilityName = Exclude<CapabilityName, DiagnosticCapabilityName>` built on it.
- `entities/robot/selectors.ts` declared `DIAGNOSTIC_ONLY_CAPABILITIES = ["sequence"]` again, at runtime.
- The same file also declared `CAPABILITY_ORDER = ["dock", "lidarHealth", "waterLevel", "sequence"]`, a verbatim copy of the contract's `CAPABILITY_NAMES`.

A fifth capability added to `packages/contracts` would compile everywhere, appear in no panel, appear in no diagnostic list, and fail nothing. `docs/ARCHITECTURE_AUDIT.md` § 4.4 puts it more bluntly: a capability model whose first member must never render "breaks the capability model on its first day".

## Assumptions

- Whether a capability describes machine behaviour or integration metadata is a stable property of the capability, not a per-console styling choice. `sequence` would be diagnostic in any console anyone builds on this contract.
- Capabilities are added rarely, and always by someone already editing `packages/contracts` — so a mandatory extra field costs nothing at the moment it is paid.
- One classification is enough. No capability is operator-facing on one surface and diagnostic on another; if one ever is, that is a new decision, not a widening of this one.
- `sequence` genuinely is a per-vendor fact, not merely envelope metadata. Vendor B sends none (ADR 1), which is why removing it from the declaration mechanism entirely would discard information.

## Constraints

- **Adding a capability must stay a contracts change first, then a panel change** (ADR 1 § Implications). Anything that lets the console lead is a reversal of that ordering.
- **`entities` may not import `config`** (ADR 4). Deployment-level panel suppression therefore stays injected, exactly as ADR 17 built it, and must not be folded into this classification.
- **`shared/ui` may not import `@fleet/contracts`** at all (`packages/web/eslint.config.js`). The classification can reach the feature layer but must never reach the presentational primitives.
- The guard must be mechanical. Principle 15, and ADR 7's record of a boundary rule that reported nothing for any input while appearing to pass.

## Decision

**One classification, in contracts, with both subsets derived from it.**

`CapabilityKind` is `"operator" | "diagnostic"`. `CAPABILITY_KINDS` maps every capability to one, and is declared `as const satisfies Record<CapabilityName, CapabilityKind>`. That `satisfies` is the whole mechanism: the record is **total**, so a capability added to `CapabilityPayloadByName` and not classified fails to compile, and a name here that is not a capability fails too.

`OperatorCapabilityName` and `DiagnosticCapabilityName` are mapped types over `CAPABILITY_KINDS`, never written out. `OPERATOR_CAPABILITY_NAMES` and `DIAGNOSTIC_CAPABILITY_NAMES` are `CAPABILITY_NAMES.filter(...)` through the two guards, so canonical order comes from one place and membership from another and neither is restated. `isOperatorCapability` / `isDiagnosticCapability` read the same mapping the types are derived from, so a guard cannot disagree with its own type.

**`packages/web` stops deciding.** `PanelCapabilityName` becomes a plain alias of `OperatorCapabilityName` — kept as a name because "panel" is the feature layer's word for how an operator capability is drawn, but an alias rather than a computation, so it cannot drift. `selectPanelCapabilities` iterates `OPERATOR_CAPABILITY_NAMES` directly, which deletes `CAPABILITY_ORDER`, `DIAGNOSTIC_ONLY_CAPABILITIES` and `isPanelCapability` outright.

**Three authorities, cleanly separated, and this ADR only creates the first:**

| Question                                | Answer lives in                         |
| --------------------------------------- | --------------------------------------- |
| What kind of fact is this capability?   | `@fleet/contracts` — `CAPABILITY_KINDS` |
| How is a capability of that kind drawn? | `packages/web/src/features/robot`       |
| Does this deployment offer that panel?  | tenant flags, injected (ADR 17)         |

## Positions

1. **Keep it a capability with a documented exclusion** (the status quo). Rejected. It is what produced three uncompared lists and a rule whose exception was enforced by a sentence.
2. **Move `sequence` to optional envelope metadata**, leaving capabilities as exactly the renderable set. Rejected: a contracts change touching every adapter and the web mapper, and it discards a genuinely per-vendor fact — Vendor B sends no sequence, and ADR 1's Vendor B profile argument reads from that absence.
3. **Two derived name sets in contracts.** Chosen. Buys option 2's "one rule, no exception list" with none of its blast radius: no adapter change, no wire change, no change to what any vendor declares.
4. **Fold the kind into `CapabilityPayloadByName`** as `{ payload; kind }`, so there is literally one mapping. Considered and rejected: `CapabilityPayloadByName` is exported and consumed by `packages/web`, so restructuring it ripples for a gain that `satisfies Record<CapabilityName, …>` already delivers. Two mappings tied by a total record cannot disagree about the name set, which is the only disagreement that matters.

## Argument

The audit's framing — that a member which must never render breaks the model — points at option 2, and option 2 is wrong for a reason the framing hides. The problem was never that `sequence` is declared. It is that the _classification_ was implicit, so it had to be re-derived by every consumer, and each re-derivation was a copy nothing compared. Option 2 fixes that by deleting the category; option 3 fixes it by naming the category. Naming it is better because the category is real and will get a second member — an adapter revision counter, a duplicate count, anything that varies by vendor and is not machine behaviour — and the second member is exactly what would have been added to the wrong side under option 1.

`satisfies Record<CapabilityName, CapabilityKind>` was chosen over a hand-checked list because it fails at the point of the mistake with the mistake's own name. The exhaustive switches in this file already work this way; the classification now does too.

The counter-argument is that this moves a presentation concern into contracts, and `packages/web`'s own comment said so: "`@fleet/contracts` knows what a capability is, not which ones earn a panel." That comment conflated two questions. _Which ones earn a panel_ is indeed presentation — and it stayed in `packages/web`, in the registry, and in the tenant flags that can switch a panel off for one deployment. What moved is _what kind of fact this is_, which is a property of the capability. The proof that it was never a presentation choice is that the console had no freedom in it: `packages/web` could not have decided `sequence` was operator-facing without lying to an operator about what the number means.

## Implications

- **Adding a capability is now a four-step change and every step is enforced.** Add it to `CapabilityPayloadByName`; classify it in `CAPABILITY_KINDS` (or fail to compile); if `operator`, add a panel to `capabilityPanels.tsx` (or fail to compile); if `diagnostic`, render it in the Diagnostics section. Only the last step is still by hand — see Open questions.
- **`packages/web` lost three hand-maintained lists and gained no new ones.** `CAPABILITY_ORDER`, `DIAGNOSTIC_ONLY_CAPABILITIES` and `isPanelCapability` are gone; `PanelCapabilityName` survives as an alias that cannot drift.
- **The console's rendering order is now the contract's canonical order, by construction.** It was a copy that happened to agree. A reordering of `CAPABILITY_NAMES` now moves the panels, which is correct and was not previously true.
- **Reclassifying a capability is a visible, testable act.** `CAPABILITY_KINDS.sequence` is pinned by name in a test, so moving `sequence` to `operator` to get a panel for free fails with an assertion that says what was reclassified.
- **`@fleet/contracts` gains five runtime exports and three types.** Its public surface is pinned by name in `index.test.ts`, so this was a deliberate addition rather than a drift.
- **This does not touch the wire.** `CAPABILITY_KINDS` is a compile-time and in-process fact; no envelope, batch or snapshot field changed, and no adapter needs editing. That is the cost difference between option 3 and option 2, and it is why this landed in one package plus its consumer.
- **Tenant flags are unaffected and stay separate.** ADR 17's `lidarHealthPanel` still answers "does this deployment offer the panel", which is a different question from "is this capability operator-facing" and must not be folded in — a tenant switching a panel off does not make the capability diagnostic.
- **The `ARCHITECTURE_AUDIT.md` § 4.4 recommendation is answered but not taken.** The audit proposed nullable envelope metadata (option 2). This ADR is the record of why the cheaper structural fix was preferred, so the audit item should be read as closed-by-alternative rather than outstanding.

## Open questions

- **Nothing forces a diagnostic capability to be rendered anywhere.** An `operator` capability without a panel is a compile error; a `diagnostic` capability that the Diagnostics section never displays is silent. That asymmetry is real and is the remaining hole in "a capability cannot reach neither surface". Closing it needs a diagnostics registry keyed by `DiagnosticCapabilityName`, which is more machinery than one member justifies today.
- **Does a third kind appear?** `operator` and `diagnostic` are a partition of what exists now. A capability that is operator-facing only for a technician persona would want a third value rather than a boolean flag bolted onto one of these two.
- **Should adapters read the classification?** They do not today and have no reason to — an adapter declares what the vendor sent, not how it is shown. Worth revisiting only if a vendor's diagnostic capability ever needs different validation from an operator one.

## Observed consequences

- 19 August 2026: implemented in one change across `packages/contracts` and `packages/web`. Contracts at 119 tests, up from 115; web unchanged at 163, because the behaviour is identical and only its authority moved.
- The guard was probed in three directions before landing, by adding a fifth capability `brushWear` to `CapabilityPayloadByName`:
  - **Unclassified** — `capabilitySchemas.ts` fails with `TS1360: Type '{ … }' does not satisfy the expected type 'Record<keyof CapabilityPayloadByName, CapabilityKind>'`, naming the mapping that is incomplete.
  - **Classified `operator`** — `capabilityPanels.tsx` fails with `TS2741: Property 'brushWear' is missing … but required in type 'Readonly<Record<OperatorCapabilityName, CapabilityPanelEntry>>'`, in the console, naming the panel that does not exist.
  - **Classified `diagnostic`** — the console compiles clean, confirming the requirement is keyed to the classification and not merely to "any new capability".
- The probe also exposed that `npx tsc --noEmit` in `packages/web` silently checks nothing: `tsconfig.json` there is `files: []` plus project references, so only `tsc -b` (the package's actual `typecheck` script) reads any source. A verification run that did not use `-b` would have reported success against a deliberately broken tree.
- Deleting `CAPABILITY_ORDER` removed a duplicate of `CAPABILITY_NAMES` that had been correct by coincidence for the life of the file.
- 19 August 2026, found by a documentation audit: `docs/WIREFRAMES.md` had not been updated with page spec 03. Its § 0 listed three capabilities and put `sequence` under envelope metadata, and its § 3 annotation still gave the panel rule as "declared non-core capabilities", the exclusion-by-name phrasing this ADR replaced. Corrected in wireframes revision 5. Worth noting against this ADR's own claim: the type system makes the _code_ consequence unmissable, and did — no panel registry could drift — but it reaches no prose, and the prose drifted for exactly as long as nobody read it.

## Related

- **ADR 1** (adapter boundary) — declares `sequence` a capability because Vendor B sends none, and defers "which ones render" to the page spec. This ADR gives that deferral a typed home; the vendor profiles in ADR 1 § Observed consequences are unchanged.
- **ADR 17** (build-time tenant configuration) — the neighbouring question that stays separate. It answers whether a deployment _offers_ a panel; this answers whether a capability _is_ one, and a panel renders only when the robot declared it, the tenant enabled it, and it is operator-facing.
- **ADR 4** (feature-sliced structure) — the reason the tenant's half stays injected into `entities` rather than imported.
- **ADR 16** (test-only adapters dependency) and **ADR 13** (recorded fixtures) — the same house style: where two artefacts must agree, a mechanical check rather than a comment. This ADR is the type-system instance of it.
- **Page spec 03 § 6** (robot detail) — stated the exclusion in prose; revised to state that the classification now enforces it.
- **Register D11** — resolved by this ADR; the stub is now a tombstone.
- **`docs/ARCHITECTURE_AUDIT.md` § 4.4** — raised the defect and recommended option 2; answered here by option 3.
- **Principle 1** (one authoritative implementation) — three copies of one classification was the violation; one derived mapping is the repair.
- **Principle 3** (canonical model, vendor differences as declared capabilities) — unchanged by this ADR, which is the point: no vendor, adapter or wire format was touched.
