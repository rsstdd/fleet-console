# ADR 30 — Fields With No Counterpart Across The Adapter Boundary Are Answered In The Adapter, Never By Default

**Decision:** Every canonical field no dialect sources and every dialect field the canonical model has no home for is resolved explicitly in the vendor adapter: `adapterId` and `adapterVersion` carry the adapter's own identity rather than the vendor's, `position.frame` is the site id, `connectivity` is `unknown` for all three dialects, and heading is declared in each vendor schema and dropped.
**Status:** Decided · 2026-08-20 · Implemented
**Group:** Data / integration (the field-level half of ADR 1's adapter boundary).

## Issue

ADR 1 fixes what the adapter boundary is for and ADR 10 fixes the shape it produces. Neither says what an adapter does with a field that has no counterpart on the other side, and a canonical envelope cannot be constructed without answering that: `AdapterEnvelope` is a strict object, so every key must be given a value or the code does not compile.

Four such fields turned up while vendor A was built, and all three adapters now inherit the answers. They were carried in `packages/adapters/TODO.md` as an explicit FIXME — decided, implemented, unratified — since 20 August 2026. This ADR is the record they were told to point at.

The four run in both directions, which is why they are one decision rather than four:

- **Canonical field, no vendor source.** `adapterId`, `adapterVersion`, `position.frame`, `connectivity`.
- **Vendor field, no canonical home.** Heading, which all three dialects report (`heading_deg`, `heading_cdeg`) and `positionSchema` does not carry.

Both directions have the same failure mode, and it is quiet: a plausible default. `null` for a frame, an optimistic `online`, the vendor id copied into `adapterId` because it is the nearest string to hand, a heading dropped without a word. Each compiles, each ships, and each states something to an operator that no vendor said.

## Assumptions

- The canonical model is not going to grow a field per dialect. ADR 1 already refused that; a field with no counterpart is the normal case at a three-dialect boundary, not an emergency.
- A field's absence is worth more as a stated fact than as a plausible value. An operator reading `unknown` learns something true; one reading `online` learns something invented.
- Heading is not needed by any surface in the current page specs. If a surface needs it, this decision changes — and it changes in `@fleet/contracts`, not here.
- Adapter identity and vendor identity will not stay one-to-one forever. The first vendor publishing a second dialect version needing its own module is what separates them.

## Constraints

- `AdapterEnvelope` is strict (ADR 10). Every canonical field is populated or the package does not typecheck, so "leave it out for now" is not available.
- A canonical field no adapter populates is the defect ADR 1 § Constraints names in review. Populating one from an absence is the same defect wearing a value.
- Unknown-field accounting counts what the schema did not declare (ADR 15). Anything deliberately dropped must therefore be **declared** in the vendor schema, or the ledger reports the repository's own design choice as vendor drift.
- Nothing downstream may branch on vendor (ADR 1), so a difference resolved here cannot be re-resolved later by a consumer that knows better.
- `connectivitySchema` already states the rule for a vendor that reports no link state: `unknown`, not an optimistic `online`. The adapter does not get to reopen it.

## Decision

**`adapterId` and `adapterVersion` name the software, not the dialect.** `"vendor-a"`, `"vendor-b"`, `"vendor-c"`, each at `1.0.0`. Three spellings were loose in the tree when this was settled — `"A"` in this package's ledger, `"adapter-a"` in contracts and server tests, `"vendor-a"` in `packages/web`'s fixtures — and `"vendor-a"` won because it was the only _product_ spelling; the others were test placeholders. `adapterVersion` bumps when output changes for an unchanged input: a mapping correction, a new capability, a unit fix. Not a comment, not a test, not a refactor.

**`position.frame` is the site id.** Each dialect's pose is metres in that site's own map, so `frame: site` is a statement the payload supports. `null` for every robot would have made a required field into decoration.

**`connectivity` is `unknown`, for every dialect, permanently as things stand.** No dialect reports a link state, and `connectivitySchema` maps that to `unknown`. The consequence is stated rather than discovered: **the console's connectivity column is inert once live data arrives**, and it is asserted in all three contract tests so it reads as a decision.

**Heading is declared and dropped.** Each vendor schema declares its heading field with a comment saying why, and each adapter drops it. Declaring it is what keeps the ledger quiet: a known-but-unmapped field is invisible to unknown-field accounting by construction, and each vendor's contract test asserts that silence. Vendor C's test is the one that separates the two silences, because `telemetry.firmware_channel` is undeclared and counted while `telemetry.pose.heading_deg` is declared and dropped, in the same payload.

## Positions

1. **Answer each field explicitly in the adapter, and say so in code.** Chosen. One place decides, three adapters agree, and every answer is asserted by a test rather than left in a comment.
2. **Let the canonical model carry an optional field per unsourced concept** — a nullable `heading`, an optional `frame`. Rejected: it moves three dialects' gaps into the shared model, and every consumer then handles an absence that exists for adapter-internal reasons. ADR 1's whole point is that the canonical model expresses _operational_ meaning, not integration history.
3. **Populate from the nearest plausible value** — vendor id as `adapterId`, `online` as connectivity, heading dropped silently. Rejected: this is the invented precision `AGENTS.md` § Adapter contract forbids, and it fails Principle 3's "fictional uniformity" test in the direction that is hardest to notice, because nothing ever errors.
4. **Reject payloads carrying a field with no canonical home.** Rejected as absurd for heading specifically — every payload from every vendor would be rejected — but it is the right answer for a _value_ with no honest mapping, which is what ADR 20's `unmappable_value` and this package's C5 tables are for. The distinction is that a value can be wrong; a field the model does not carry is merely unused.

## Argument

Position 1 was chosen because the alternatives all relocate the problem to somewhere with less information. The adapter is the only place that knows both the dialect and the canonical model; a consumer holding an optional field knows neither, and a default knows nothing at all.

The four answers look unrelated and share one property: each converts a silence into a statement that can be reviewed and tested. `connectivity: "unknown"` is the clearest case. It is the least useful value the field can take, it will be the value for every robot in the fleet, and it is still right — because the alternative is a column that says every robot is online on the authority of nobody. Asserting it in three contract tests costs three lines and makes the inert column a decision with a date rather than a bug someone finds in the demo.

Heading is the same argument run backwards. Dropping it is correct — no surface needs it and `positionSchema` has no home for it — but dropping it _silently_ would have been counted as vendor drift by ADR 15's ledger, which walks the raw payload against the schema's declared paths. So the schema declares a field the adapter never reads. That is a strange-looking line of code, and the comment beside it exists because a future reader would otherwise delete it and get a ledger that reports the repository's own choices back at itself.

`adapterId` is the one answer with a loose end, and it is named rather than hidden: `UnknownFieldSnapshot.byAdapter` is keyed by `SupportedVendor` (`"A"`) while ADR 25's health response is keyed by an open identifier, so the server has two candidate keys for one column. That must be chosen once, in the dispatch registry that knows both, and never by joining the two identifier spaces at a handler.

## Implications

**The roadmap half. Each item is work this decision creates, a constraint it imposes, or a property it now guarantees.**

- **A new vendor answers all four, and copies none of them blindly.** `adapterId` is `"vendor-<letter>"` at `1.0.0`; `position.frame` is the site id only if that dialect's pose really is site-local; `connectivity` is whatever the dialect reports, and `unknown` only when it reports nothing; a field with no canonical home is declared in the schema and dropped, with a comment and a test.
- **Any field deliberately dropped must be declared in the vendor schema.** This is now a rule with a mechanism behind it, not a convention: ADR 15's walk cannot tell an intentional omission from vendor drift, so an undeclared drop shows up as a ledger entry that no one can act on.
- **The connectivity column is inert and must not be presented as live.** `packages/web` renders `unknown` for every robot once real data arrives. Whether the dialects should carry a link field at all is a simulator and contracts question, not an adapter one, and it is open — see `packages/FIXME.md` **F4**, which is the fixture-side half of the same gap.
- **`adapterVersion` is a released artefact, not a build number.** Nothing bumps it automatically. The rule above is the whole rule, and a mapping change that forgets it is a review finding.
- **The server must choose one identifier space for the health response's adapter column**, in the **C8** dispatch registry, using either `SupportedVendor` or `adapterId` throughout. Named in each adapter's `ADAPTER_ID` comment so the next reader hits it before writing the handler.
- **Adding heading to the canonical model is a `@fleet/contracts` change first**, and it lands with a unit decision (degrees, and which zero) before any adapter maps it. All three dialects already report it, so the adapter work is small and the contract work is the whole cost.
- **This ADR does not license a default anywhere else.** Positions 3 and 4 are the two ways to get this wrong, and the boundary between "field with no home" (drop it, declared) and "value with no mapping" (reject it, ADR 20) is the line to check first when a new case turns up.

## Open questions

- **Should the dialects report a link state at all?**
  _Current lean:_ yes, eventually — an operations console whose connectivity column is structurally inert is a weak demonstration of ADR 1's own argument. It is a simulator and contracts change, and the adapters would need no new decision, only a mapping.
  _Resolves on:_ the connectivity column being wanted for a real surface, or `packages/FIXME.md` **F4** being closed on the fixture side.
- **Does `adapterVersion` need a mechanism, or is the rule enough?**
  _Current lean:_ the rule is enough at three adapters. A check that fails when a vendor module changes without a version bump would misfire on comments and tests, which is most edits.
  _Resolves on:_ the first mapping change that ships without a bump.
- ~~**Which identifier space keys the health response's adapter column?**~~
  **Closed 20 August 2026, ratifying the stated lean on the event this question named** — **C8** landed, and the server's health handler now consumes it. `byAdapter` is keyed by **vendor id** (`A`), not software `adapterId` (`vendor-a`). The registry's ledger shipped as `Record<SupportedVendor, UnknownFieldTally>`, which is what this question meant by "the registry's call": the decision was effectively taken when that type landed, and any other key would force the health handler to re-key one of its own sources — which is where a display id and a counting id start to disagree. The second reason is independent of that history: the column answers questions about a _dialect_, which is what a vendor id names, while an adapter id names the software that decodes it, and two adapter versions for one dialect must not split the answer. `packages/server`'s `CurrentStateStore.sequenceByVendor()` was rekeyed from `adapterId` to `vendorId` in the same change so the join has one identifier space throughout. Display of a software id remains available from the envelope's `adapterId` and is a console concern.

## Observed consequences

- **20 August 2026 — the health response exists and shows the ADR 15 pairing on a running server.** After one accepted vendor C payload, one rejected vendor A payload and one request for an unregistered vendor: `malformedIngest: 1` and `unsupportedVendors: 1` at process scope, vendor A with `failures: 1` and a **flat** unknown-field ledger because its payload never reached one, and vendor C with `telemetry.firmware_channel: 1` and no failures. That contrast is the signal ADR 15 says a total would erase, and it is now observable rather than argued.
- 20 August 2026: implemented across all three vendor adapters and green. Each of the four answers is asserted rather than commented: connectivity in three contract tests, `position.frame` in three exact-envelope assertions, the identity pair in the same three, and heading in one ledger test per vendor — ten assertions for four decisions, which is what makes overruling any of them a visible change rather than a silent one.
- 20 August 2026: the heading rule was already implemented for vendors A and B and had been missed for vendor C, which declared the field correctly but asserted nothing. Ratifying the decision is what surfaced it: vendor C is the only dialect whose ledger is non-empty, so its test had to name the counted path rather than assert a zero total, and that is the sharpest of the three.
- 20 August 2026: `adapterId` was settled by counting spellings in the tree rather than by preference. Three were in use; only one was in product code.

## Related

- `ADR 1 — the adapter boundary this decides the field-level cases for; its rule that a canonical field no adapter populates is a review defect is the constraint that makes silence unavailable.`
- `ADR 10 — the strict AdapterEnvelope; strictness is why every one of these fields had to be answered before the package compiled.`
- `ADR 15 — unknown-field accounting; the reason a deliberately dropped field must be declared in the vendor schema rather than merely ignored.`
- `ADR 20 — the issue vocabulary; unmappable_value is the answer for a value with no honest mapping, which is the case this ADR is deliberately not about.`
- `ADR 25 — the health response keyed by open identifier, one half of the adapterId loose end named above.`
- `Principle 3 (the canonical model preserves shared meaning without erasing differences) — position 3 fails it in the "fictional uniformity" direction, which is the direction nothing errors on.`
- `Principle 4 (provenance is explicit where it affects a decision) — connectivity, freshness and socket state are three disjoint facts, and this ADR keeps the first one honest rather than inferred.`
- `Artifact packages/adapters/src/vendors/*/adapter.ts — the four answers, one set per dialect.`
- `Artifact packages/adapters/src/vendors/*/schema.ts — the declared-and-dropped heading fields, each with the reason beside it.`
- `Artifact packages/FIXME.md F4 — the fixture-side half of the inert connectivity column.`
- `docs/PENDING_ARCHITECTURE_DECISIONS.md D21 — the stub this ADR resolves.`

## Notes

- 20 August 2026: **the short version.** Four fields have no counterpart across the boundary; each is answered in the adapter and asserted by a test. Adapter identity is `"vendor-<letter>"` at `1.0.0` and names the software, not the dialect. The frame is the site. Connectivity is `unknown` and the console's column is inert until a dialect reports a link state. Heading is declared in the schema so the ledger stays quiet, and dropped. The rule a fifth vendor needs is the second one: **anything you deliberately drop, you declare.**
- 20 August 2026: this ADR ratifies decisions taken while building vendor A and carried in `packages/adapters/TODO.md` as an unratified FIXME for the whole of that package's construction. It settles them; it does not reopen them. Overruling any of the four is a new ADR, and the cheapest to overrule is heading, which is one contracts field and three one-line mappings.
