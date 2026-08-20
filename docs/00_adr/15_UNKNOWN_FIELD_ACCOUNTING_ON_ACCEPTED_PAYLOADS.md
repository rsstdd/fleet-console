# ADR 15 — Unknown Fields Are Counted on Accepted Payloads Only, Under a Scope-Named Metric

**Decision:** An adapter counts unrecognized vendor fields only after its schema has accepted the payload, detects them by comparing the raw payload against dotted paths derived from that schema, and reports them under a counter whose name states its population: `unknownFields.accepted`.
**Status:** Decided · 2026-08-19 · Partial
**Group:** Data / integration (the accounting half of ADR 1's adapter boundary).

## Issue

ADR 1 requires unknown vendor fields to be counted rather than silently dropped: a vendor that starts sending something new must be visible before the new thing matters. It does not say what happens when a payload is both unrecognized in parts and broken overall, and it does not say how "unrecognized" is detected at all.

Both gaps had to close before the three vendor schemas were written, because all three inherit whatever mechanism is chosen — the register recorded this as **D5**, and `packages/adapters` **B4** as the item blocking **B1**–**B3**.

The detection question is sharper than it looks. The obvious implementation — declare the schema strict and read the unrecognized keys out of the validation error — cannot work, because strict mode _rejects_ the payload, and ADR 1 wants the count taken on a payload that is otherwise **accepted**. Counting and rejecting are the same operation in that design, and this ADR needs them to be different ones.

## Assumptions

- The interesting signal is dialect change: a vendor added a field. A vendor whose payloads are being rejected outright is a different problem with its own counter.
- Unknown-field counts stay per adapter, not per robot (ADR 1 § Implications). A per-robot counter is a contracts change first, and neither the ledger nor the console may imply that precision before it exists.
- A second tally for rejected payloads may become necessary. The question is whether its arrival is additive or a rename across two packages.
- Vendor schemas are Zod objects whose shape can be walked. If a dialect ever needs a union or a discriminated shape at its root, the path derivation gets more work to do.

## Constraints

- The count must be taken on payloads the schema accepted, without a second schema declaring the same dialect (Principle 1).
- Nested unknowns must be distinguishable from top-level ones. `telemetry.undocumented` and `undocumented` are different facts about a dialect, so paths are dotted.
- The mechanism runs in the ingest path at ADR 2's stated peak of roughly 2,500 readings per second, so per-message work has to stay proportionate.
- No cast at the boundary (`packages/adapters` lint). Whatever reads a schema's internals narrows with real runtime checks.
- The health endpoint's numbers are operator-facing. A counter that means something narrower than its name says is the kind of quiet lie this console exists to argue against (Principle 4's spirit, applied to metrics).

## Decision

**Behaviour.** Unknown fields are counted only on payloads that pass their vendor schema. A payload the schema rejected increments the server's malformed-ingest counter and leaves the unknown-field ledger untouched.

**The gate is schema acceptance, not overall success** (amended 20 August 2026). An adapter can still reject a payload its schema accepted — an `unmappable_value` from a timestamp that names no instant, or a status code outside the vendor's table — and that rejection comes _after_ the ledger has been written. The count is therefore taken on the population "payloads that were well-formed for their dialect", which is what `scope: "accepted"` names, and not on the narrower "payloads that produced an envelope". Ratified as it was built; see the argument below for why the wider population is the right one.

**Naming.** The ledger's snapshot carries `scope: "accepted"` as data, and the health endpoint serves it under a scope-named key. The scope is not a caption a consumer adds; it travels with the number, so the console renders the qualification from the value.

**Detection.** Vendor schemas are loose — unknown keys are accepted so they can be counted rather than rejected. `knownFieldPaths(schema)` derives the dialect's declared dotted paths from the schema itself; `findUnknownFieldPaths(raw, known)` walks the **raw** payload and returns what is not declared. Both live in `src/core/`, because all three vendors need them.

Four detection rules, each of which is a judgment that could have gone the other way:

- **Array elements collapse to `[]`.** `telemetry.modules[].firmware`, never `modules[0].firmware`. Indexed paths would let a 500-element array produce 500 distinct ledger entries and drown the signal.
- **An unknown subtree is reported once, at its root.** A new block with ten children is one dialect change, not ten.
- **One path per payload, however many times it occurs.** Otherwise the total becomes a function of payload size rather than of dialect change.
- **The raw payload is walked, not the parsed result.** Parsing applies defaults and transforms; the question is what the vendor actually sent.

`noteAcceptedPayload({ ledger, vendor, accepted, payload, knownPaths })` takes the precondition as an argument, so the ordering is structural rather than something each of three vendor adapters remembers.

## Positions

1. **Count on accepted payloads only.** Chosen. Simple mental model — "unknown" is a statement about an otherwise valid document — and it never attempts to walk deeply malformed data.
2. **Safe top-level key comparison before full validation.** Compare top-level keys against the known set first, so unknowns are counted even when validation later fails. Rejected: it captures only top-level unknowns, so a nested addition — the common case, and the one vendor C actually demonstrates — stays invisible, and an accepted payload still needs the deeper walk. Two mechanisms, one of them partial.
3. **Two explicit counters, accepted and rejected.** Full observability, nothing thrown away. Rejected _for now_, not on principle: it is the right answer if the blind spot below turns out to matter, and this ADR's naming decision exists precisely so it can be added without a rename.
4. **Count only what becomes an envelope** — move the ledger write after every mapping step, so an `unmappable_value` rejection leaves no trace in it (added 20 August 2026). Rejected. It narrows the population to "payloads that fully succeeded" while the metric is still called `accepted`, which is the quiet lie the constraint above forbids; it makes the ledger blind in precisely the case it exists for, since a vendor that adds a field and a status code in one release is dialect change by definition; and it would have to be done in all three adapters at once, because two adapters counting different populations into one snapshot is worse than either ordering.

For detection, the alternatives were strict-schema error inspection (rejected: it rejects the payload it was meant to accept, and most validators stop at the first error, so the list is incomplete by construction) and a loose schema with a hand-listed known-path set (rejected: a second declaration of the dialect, which drifts from the schema silently — the drift Principle 1 exists to prevent).

## Argument

Position 1 was chosen because it is what ADR 1 describes and the simplest thing that is correct, and because its weakness has a known, cheap remedy that this ADR pre-pays for.

The weakness is real and worth stating plainly: **a vendor that changes shape in two ways at once — adds a field and changes a type — shows no unknown-field growth at all**, because every payload is rejected before the ledger sees it. The integration is breaking and the counter built to notice dialect change says nothing.

That is survivable because the two counters are read together. A flat unknown-field count beside a climbing malformed-ingest count is itself the signal; it says "this vendor is broken", which is the more urgent statement anyway. What would not survive is discovering later that the blind spot matters and having to rename `unknownFields` to `unknownFields.accepted` across the server's health response and the console's diagnostics panel — a coordinated two-package change to add a number. Naming the scope on day one makes position 3 an addition rather than a migration. That is the whole reason the snapshot carries `scope` as data rather than a comment.

**On the ordering, amended 20 August 2026.** The blind spot above is the whole reason the gate sits at schema acceptance rather than at the end of the decode. An `unmappable_value` rejection is a payload that was well-formed for its dialect and carried a value the canonical model could not take — which is _dialect change_, the exact signal this ledger exists to surface. Discarding its unknown fields would widen the blind spot in the direction it is already widest: a vendor shipping a new field and a new status code in one release would move neither counter in a way that names the vendor's change. What schema acceptance buys is the property the argument for position 1 actually rests on — the walk never runs on deeply malformed data, and a retry loop full of garbage cannot inflate the map. That property is unaffected by what happens after the parse succeeds.

The one thing this ordering must not do is get summed with anything. A single `unmappable_value` payload can increment the ledger _and_ the malformed-ingest counter, because it is both a well-formed document and a rejected request. The two numbers answer different questions and were already forbidden from being added together; this makes that rule load-bearing rather than tidy.

Deriving known paths from the schema, rather than listing them beside each vendor module, is the same argument in miniature: one declaration of what a dialect contains. The cost is reading Zod's `_zod.def` internals, which is a private surface. That cost is named here rather than discovered: if a Zod upgrade moves it, `knownFieldPaths` returns fewer paths and this package's tests fail loudly, rather than the ledger quietly reporting declared fields as unknown.

## Implications

**The roadmap half. Each item is work this decision creates, a constraint it imposes, or a property it now guarantees.**

- **Vendor schemas must be loose, not strict.** `packages/adapters` **B1**–**B3** are written with `z.looseObject`, and each vendor module computes `knownFieldPaths(schema)` **once at module load** rather than per payload. Calling it per message puts a schema traversal in the ingest path at 2,500 readings a second for no benefit.
- **The canonical schemas stay strict, and that asymmetry is deliberate.** `@fleet/contracts` rejects unrecognized keys because canonical drift must be loud; vendor schemas accept them because vendor drift must be counted. Anyone tempted to make the two consistent should read this line first.
- **A payload the schema rejected must never reach the ledger.** `noteAcceptedPayload` takes `accepted` as an argument so the rule cannot be forgotten, and the ledger's method is named `noteAccepted` so a wrong call site reads wrong. The adapter contract tests (**D5** in that package's TODO) prove it for each vendor.
- **`noteAcceptedPayload` is called immediately after the parse, before any mapping step, in every adapter.** This is now a rule rather than an accident of how vendor A was written: a new adapter that defers the call until after its mapping is a review finding, and moving it in one adapter alone puts two populations into one snapshot. Vendor B is where the ordering is visible — four post-schema rejection paths against vendor A's one — and its contract test pins the behaviour so a later reordering fails rather than quietly changes the metric.
- **An `unmappable_value` rejection can move two counters at once**, and that is correct: the ledger sees a well-formed document, the server sees a rejected request. It is one more reason the two numbers must never be summed. Whoever wires `noteMalformedIngest` into the ingest handler inherits this — it has no production call site yet.
- **The health endpoint serves the ledger under a scope-named key.** `unknownFields.accepted`, not `unknownFields`. The coupling is commented in `packages/server/src/health/healthMetrics.ts`, which owns the other population's counter.
- **The two counters must never be summed or presented as one number.** Their pairing is the signal; a total erases it. This constrains the health response's shape and the console's diagnostics panel, which must also keep the existing per-adapter caveat (ADR 1).
- **The console's label can now be derived rather than written.** `scope` travels with the data, so the diagnostics panel renders "(adapter, accepted payloads)" from the value instead of hardcoding a caveat that can go stale. `packages/web` does not consume it yet — its `unknownFieldCount` is still injected from a fixture — and should read the scope when the health endpoint lands.
- **Adding the rejected tally later is additive.** A second ledger with `scope: "rejected"` sits beside this one; no consumer renames anything. If it is added, ADR 1's "counted, not dropped" claim gets stronger, and this ADR should be amended rather than superseded.
- **This package now reads a Zod private surface.** One module, three helpers, all narrowing with type predicates rather than casts. A Zod major upgrade is a reason to re-run this directory's tests specifically.
- **Unknown-field accounting remains per adapter.** Nothing here moves it toward per-robot, and the register's **D12** is where that question lives — it is a contracts change first.

## Open questions

- **Does the accepted-only blind spot matter in practice?**
  _Current lean:_ no, because the malformed-ingest counter rises in exactly the case the ledger goes quiet, and the two are read together. Narrower than it first looks since the 20 August 2026 amendment: a payload rejected for an unmappable _value_ is still counted, so the blind spot covers only payloads the schema itself refused.
  _Resolves on:_ an integration where a vendor changed shape and the pairing failed to make it obvious — at which point position 3 lands as an addition.
- **Does a dialect ever need a schema shape the path walk cannot read — a union, a record with dynamic keys, a discriminated root?**
  _Current lean:_ not for A, B or C, which are all plain nested objects. A dynamic-key block would need a path convention of its own, `metrics.*` or similar.
  _Resolves on:_ **B1**–**B3** landing, or a fourth vendor.
- **Should the ledger bound the number of distinct paths it retains?**
  _Current lean:_ not yet. A vendor sending randomly-named keys would grow the map without limit, but that is a hostile-input scenario the demo does not model, and a bound would need a documented eviction policy to avoid quietly under-reporting.
  _Resolves on:_ the load harness (ADR 2) or the first unbounded-growth observation.

## Observed consequences

- 19 August 2026: implemented in `packages/adapters` and green — `knownFieldPaths`, `findUnknownFieldPaths`, `noteAcceptedPayload`, and the ledger renamed to `noteAccepted` with a scope-carrying snapshot. Adapters at 40 tests; all five packages lint, typecheck, test and build.
- 19 August 2026: the package's cast ban shaped the implementation rather than being worked around. Reading Zod's `_zod.def` with `as` was rejected by `no-unsafe-type-assertion` seven times across source and tests; the result narrows through `isRecord` type predicates and the test payloads are built by spreading a typed helper instead of casting. The rule was right — a cast here would have been trusting a private surface twice over.
- 20 August 2026: the ordering question was found by building vendor B, not by re-reading this ADR. Vendor A has one post-schema rejection path and vendor B has four, so the gap between "the schema accepted it" and "the adapter accepted it" only became a visible population difference once a second dialect existed. It was pinned by a contract test in `src/vendors/b/adapter.test.ts` before it was ratified here, so the behaviour was never in doubt — only its authority.
- 20 August 2026: ratified as built, and this ADR's wording was the thing that changed. Two sentences said "a rejected payload" where they meant "a payload the schema rejected", which read as a contradiction the moment a second kind of rejection existed. No adapter changed.
- 19 August 2026: one test expectation was wrong rather than the implementation. Unknown paths come back in depth-first document order, so a nested unknown under an earlier key precedes a shallower one declared later. The test now says depth-first order explicitly, because "first seen" was ambiguous about exactly the case that matters.

## Related

- `ADR 1 — requires unknown fields to be counted rather than dropped, and fixes their scope as per-adapter; this ADR decides on which population, and how they are found.`
- `ADR 2 — the ingest path this runs in, and the measurement budget the per-message cost belongs to; knownFieldPaths runs once per module for that reason.`
- `ADR 10 — the adapter's return type; an adapter's unknown-field paths ride alongside the AdapterEnvelope it produces.`
- `ADR 13 — recorded fixtures; vendor C's fixture carries firmware_channel, which is the payload this mechanism has to count.`
- `ADR 20 — the issue vocabulary; unmappable_value is the post-schema rejection whose existence forced this ADR's "rejected" to be said precisely.`
- `ADR 30 — the field-level decisions at the same boundary; its declared-and-dropped rule exists so this ledger does not report the repository's own choices as vendor drift.`
- `Artifact packages/adapters/src/vendors/b/adapter.test.ts — pins the ordering: the ledger is written on a payload the schema accepted and the mapping then rejected.`
- `Principle 1 (one authoritative implementation) — the reason known paths are derived from the schema rather than listed beside it.`
- `Principle 2 (external contracts are decoded once) — the reason detection reads the raw payload and never a second parse.`
- `Principle 12 (performance and observability are product behaviour) — the reason the health endpoint's number has to mean what its name says.`
- `Artifact packages/adapters/src/core/unknownFieldPaths.ts — the derivation and the walk.`
- `Artifact packages/adapters/src/core/unknownFields.ts — the ledger, its scope, and noteAcceptedPayload.`
- `Artifact packages/server/src/health/healthMetrics.ts — the malformed-ingest counter this one must never be summed with; coupling commented there.`
- `docs/PENDING_ARCHITECTURE_DECISIONS.md D5 — the stub this ADR resolves.`

## Notes

- 19 August 2026: **the short version of the implications.** Vendor schemas are loose; each computes its known paths once at import. Unknown fields are counted only when the schema accepted the payload, and `noteAcceptedPayload` makes that ordering an argument rather than a habit. The number is served as `unknownFields.accepted` and must never be summed with malformed-ingest — their pairing is the signal. The accepted blind spot is real and priced: a vendor breaking and changing at once shows a flat ledger and a climbing malformed count. If that proves insufficient, a `scope: "rejected"` ledger is added beside this one and nothing gets renamed.
- 19 August 2026: this ADR ratifies a position `packages/adapters/TODO.md` had carried as an explicit FIXME — "B4's recommendation is unratified" — since the package was bootstrapped. That FIXME is now discharged.
- 20 August 2026: **the amendment in one line.** "Accepted" means the schema accepted it. A payload rejected later for an unmappable value has already been counted, deliberately, because that is dialect change and it is what this number is for.
