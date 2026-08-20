# ADR 11 — Recorded Vendor Fixtures Are Public Through a Test-Only `./testing` Subpath

**Decision:** `packages/adapters` exposes its recorded vendor payloads through a second public export, `@fleet/adapters/testing`, which carries no production behaviour and which every consuming package bans in production code.
**Status:** Decided · 2026-08-19 · Implemented 2026-08-20
**Group:** Data / integration (the packaging half of ADR 1's fixture evidence).

## Issue

Fixtures are the evidence that an adapter understands a vendor dialect. They are also the input to the highest-value test in the repository: the joining test that feeds a recorded vendor payload through the adapter, into the canonical envelope, over JSON, and into the console's read model. That test lives in `packages/web`, and it is only worth something if both halves are looking at **the same bytes**.

Two ways to get those bytes were already in use elsewhere in the industry and both were available here. A consumer can deep-import `node_modules/@fleet/adapters/src/vendors/<v>/__fixtures__/`, which freezes an internal layout the export map exists to keep free and contradicts the package's own rule that deep imports are not the contract. Or it can keep a second copy of the JSON, which drifts the first time either side is edited — silently, because both tests still pass.

The register recorded the question as **D2**. It had to be answered before fixtures existed, because the answer decides where they live.

## Assumptions

- `packages/web` is the consumer that forces the decision. `packages/server` may want fixtures for an ingest test later, but the browser-targeted package is the one whose constraints are binding.
- The fixture surface stays small — load a payload by vendor and name. If it grows decoders or adapter behaviour, this ADR is being applied to something it did not decide.
- A test-only export can be kept out of production code by lint, because that is how every other cross-package rule in this repository is kept (ADR 7, Principle 15).
- Consumers resolve workspace packages through a bundler or `tsx`, so a static JSON import works in all of them (ADR 9).

## Constraints

- No Node-only APIs on this surface. `packages/web` runs its tests under jsdom through Vite; a `node:fs` read in the fixture loader would put a Node-only module on a path a browser-targeted package imports. This is the constraint that shapes the implementation, and adapters `TODO_E2E_JOIN.md` **A-2** named it as the falsifier before anything was written. **Corrected 20 August 2026: that falsifier does not fire, and the constraint is now enforced instead.** Adding `node:fs` to `src/testing/fixtures.ts` leaves `packages/web` green at 208 tests, because jsdom is an environment inside Node and the import resolves there — only a real browser build would break. The rule had lived in two comments and nothing else for a day. `packages/adapters/eslint.config.js` now bans Node builtins and `import.meta.dirname`/`.filename` under `src/testing/**`, and `src/testing/__enforcement__/nodeApi.ts` is the fixture proving it fires (Principle 15, ADR 7).
- The production bundle must not grow. `packages/web` already proves adapters do not reach browser output (**W-2**); a public subpath must not quietly change that.
- Deep imports stay blocked. Adding one public way in is only an improvement if the other ways stay shut.
- Adapters must not depend on the simulator, in production or in tests (ADR 1, **A-3**). Whatever the fixtures are recorded from, the dependency arrow does not reverse.
- Payloads stay untrusted at the point of use. A fixture handed over as a typed object would let a contract test pass while the schema it exercises is wrong.

## Decision

`packages/adapters/package.json` gains a second export:

```json
"exports": {
  ".": "./src/index.ts",
  "./testing": "./src/testing/index.ts"
}
```

`src/testing/` holds `loadVendorFixture(vendor, name)`, `listVendorFixtures()`, and `FIXTURE_RECORDING` — the pinned simulator inputs the payloads were recorded from. The payloads themselves stay JSON, one file per vendor under `src/vendors/<v>/__fixtures__/`, imported statically with an import attribute rather than read from disk. `VendorFixture.payload` is typed `unknown`.

The surface is **test-only by rule, not by convention**. `packages/web` bans `@fleet/adapters/*` in production code and lifts the ban for test files; `packages/server` already bans every adapters subpath, tests included. Both bans are asserted by fixtures that lint reports on, in both directions.

The public surface is pinned by name in `src/testing/fixtures.test.ts`, the same way `@fleet/contracts` pins `.`, so growing it is a deliberate edit to a test.

## Positions

1. **A public test-only subpath, `./testing`.** Chosen. One intentional public surface, enforceable with the export map and the import bans that already exist, and the fixtures stay co-located with the adapters that own them.
2. **A plain JSON fixture subpath with no loader.** Publish the directory; consumers `import` the files directly. Genuinely simpler — zero runtime code, works anywhere — and it remains the fallback if the loader ever needs an environment-specific API. Rejected as the first choice because every consumer then re-implements the same boilerplate, and the provenance a fixture needs to be useful (which seed, which instant, which robot) has nowhere to live but a comment.
3. **A dedicated integration-test package owning cross-package fixtures.** Clean ownership, and production packages stay free of test-only code. Rejected: another package, another CI job, and the fixtures end up one step removed from the adapters that recorded them — which is exactly the distance drift needs.
4. **Deep imports or copied fixtures.** Rejected, and it is worth naming as a position because it is what happens by default when no decision is made. It breaks the export boundary and the copies go stale silently.

## Argument

Position 1 was chosen because it is the only one that makes the rule mechanical without adding a package. The subpath is a real boundary — the export map refuses everything else, and `no-restricted-imports` refuses this one in production code — so "fixtures are for tests" fails a build rather than relying on review.

The comparison against position 2 was closer than it looks. Plain JSON is less machinery, and if the loader ever needs the filesystem, position 2 is where this lands. What decided it was provenance: a recorded fixture is only trustworthy if you can say what produced it, and `FIXTURE_RECORDING` (seed, fleet size, instant) is a value a joining test actually consumes — it uses the pinned instant as `receivedAt` so it can assert exact canonical output without reading a clock. Under position 2 that number lives in a comment, or in each consumer, or nowhere.

The cost is one more public entry point on a package that had one, plus the `resolveJsonModule` and import-attribute machinery to keep the loader free of Node APIs. Both are named here rather than discovered later.

## Implications

**The roadmap half. Each item is work this decision creates, a constraint it imposes, or a property it now guarantees.**

- **An exact-name import ban does not cover subpaths, and this decision walked straight into that.** `packages/web` banned `@fleet/adapters` by name; `@fleet/adapters/testing` matched nothing and would have been importable from production code the moment the subpath existed. A `patterns` entry for `@fleet/adapters/*` closes it, and a boundary-violation fixture asserts it. **Any package that bans a workspace package by name must ban its subpaths too** — that is the generalizable lesson, and it applies to every future subpath, not just this one.
- **`packages/server` bans every adapters subpath including in test files.** That is correct today and will block its own ingest test the first time it wants a recorded payload. When that happens, the fix is an explicit test-file exception mirroring `packages/web`'s, decided at that point rather than pre-built now.
- **No Node-only API may enter `src/testing/`.** The whole surface is loadable from a browser-targeted test run, proven by a smoke test in `packages/web` under jsdom. A `node:fs` read there breaks that consumer, and the response is position 2, not a shim.
- **`packages/adapters` now compiles with `resolveJsonModule`,** and the fixtures are imported with `with { type: "json" }` so the specifier works under Node, `tsx` and Vite alike. A consumer toolchain that does not understand import attributes cannot load this surface.
- **The fixtures are recorded simulator output at pinned inputs.** At this ADR's landing,
  that followed D4's current package position but did not close it because no drift guard
  existed. ADR 13 subsequently closed D4 by adding the deterministic recorder and CI
  re-record-and-diff check. The provenance claim is now enforced rather than procedural.
- **One representative payload per vendor exists; the malformed and boundary cases do not.** `VendorFixtureName` has a single member and the registry's inner record is `Partial` for that reason — a fixture name is not guaranteed for every vendor, and never will be, since only vendor C has an undocumented field to record. Adapters `TODO.md` **C1** owns the rest. _(Overtaken 20 August 2026: **C1** is closed. `VendorFixtureName` now has three members — `representative`, `boundary-empty`, `boundary-full` — recorded for all three vendors, and hand-authored malformed payloads live under a separate accessor in `__malformed__/` because the recorder cannot produce them. The `Partial` inner record survives, and now for the malformed registry rather than the recorded one.)_
- **The public surface is pinned by name in a test.** Adding an export to `./testing` now requires editing that list, which is the point: a test-only surface that grows quietly stops being small enough to reason about.
- **Production output is unchanged, and that is measured rather than assumed.** `packages/web`'s bundle is byte-identical after this change — same content hash, `567.36 kB` raw and `175.03 kB` gzip — and no fixture bytes appear in it. Re-measure when the joining test actually calls an adapter, because that is a different import graph.
- **The joining test now consumes this surface.** `packages/web/src/entities/robot/fromEnvelope.test.ts`
  loads all three representative fixtures through `@fleet/adapters/testing` and dispatches
  them through the real registry. The public subpath therefore has a live consumer and the
  decision is fully implemented.

## Open questions

- ~~**Does `packages/server` need the fixtures, and if so through a test-file exception or by moving the ingest test elsewhere?**~~
  **Closed 20 August 2026, ratifying the stated lean on the event this question named.** Yes, through a test-file exception, because an ingest test belongs next to the ingest handler and the alternative is the second copy of a payload this ADR already rejected for `packages/web`. The exception in `packages/server/eslint.config.js` is **narrower than web's**: web switches `no-restricted-imports` off entirely in test files, while the server re-states the rule with `@fleet/adapters/testing` alone removed, so a test that deep-imports a vendor module is still rejected. Widening it to any other subpath is an amendment to this ADR, not a configuration tidy-up.
- ~~**Does the loader survive contact with the malformed fixtures?**~~
  **Closed 20 August 2026:** yes, through a separate static registry.
  `loadMalformedPayload` returns valid JSON typed `unknown`; malformed means invalid for a
  vendor schema, not invalid JSON. Non-JSON input would require a different test surface.
- **Should `FIXTURE_RECORDING` grow per-fixture provenance rather than one shared record?**
  _Current lean:_ not yet. One recording run produced every current fixture. A second run at a different instant would make the shared record a lie, and that is the trigger to move provenance onto `VendorFixture`.
  _Resolves on:_ the first fixture recorded at different inputs.

## Observed consequences

- **20 August 2026 — the server's exception is narrower than the one it mirrors, deliberately.** `packages/web` turns `no-restricted-imports` off wholesale in test files, which also lifts its ban on deep vendor imports there. The server instead re-declares the rule in its test override with the `testing` subpath removed and every other pattern intact, so `@fleet/adapters/vendors/a/adapter` stays rejected in a test as well as in production code. The two packages differ because the server is the one with a legitimate reason to reach for a vendor module — it dispatches to them — and a ban that lifts in the exact files most likely to violate it is not a ban.
- 19 August 2026: implemented and green. `@fleet/adapters/testing` exports three symbols; three recorded payloads committed under `src/vendors/{a,b,c}/__fixtures__/`; adapters at 21 tests, `packages/web` at 140. All five packages lint, typecheck, test and build.
- 19 August 2026: the subpath ban in `packages/web` was probed by deleting the `patterns` entry, and the rejection test failed as it should. ADR 7's lesson applied: a rule nobody has watched fail is indistinguishable from a rule that does nothing.
- 19 August 2026: the package's own lint rules rejected the first draft of the fixture tests three times — a `Record<string, unknown>` cast on a payload, an unused expression standing in for a type assertion, and an unnecessary-condition error on the loader's missing-fixture guard. The last one was the useful failure: it was correct that the guard was unreachable, which is what exposed that a total `Record<VendorFixtureName, …>` is the wrong type for a registry where fixture names are legitimately per-vendor. The guard is real now because the type is honest.
- 19 August 2026: `packages/web`'s production bundle content hash was unchanged by this work (`index-YnB-3iBb.js` before and after), which is the strongest available form of the "test surface is absent from production output" evidence — not merely a similar size, the same bytes.

## Related

- `ADR 1 — requires recorded fixtures as the evidence an adapter understands a dialect; this ADR decides how other packages reach them.`
- `ADR 9 — workspace packages export TypeScript source; this adds the second export entry to one of them, and its import-attribute requirement follows from that packaging choice.`
- `ADR 7 — the enforcement lesson this ADR applied: the new subpath ban was probed by deleting it and watching the test fail.`
- `ADR 10 — the other half of the joining test's prerequisites; the adapter's return type. Both had to land before a vendor adapter could be written.`
- `ADR 12 — the console's test-only dependency on the adapters; this subpath is what that dependency reaches for, and both bans live in the same no-restricted-imports block in packages/web.`
- `Principle 1 (one authoritative implementation) — the reason a second copy of a fixture is rejected outright.`
- `Principle 2 (external contracts are decoded once) — the reason a fixture payload is handed over as unknown.`
- `Principle 15 (a rule that cannot fail mechanically does not exist) — the reason the test-only rule is two lint fixtures rather than a sentence.`
- `Artifact packages/adapters/src/testing/ — the surface, and its README, which carries the recording procedure.`
- `Artifact packages/web/src/entities/robot/__boundary-violation__/adapterTestingImport.ts — the deliberate violation proving the production ban fires; its .fixture.test.ts pair proves the test exception holds.`
- `Artifact packages/web/src/entities/robot/adapterFixtureAccess.test.ts — the browser-side smoke test.`
- `docs/PENDING_ARCHITECTURE_DECISIONS.md D2 — the stub this ADR resolves.`
- `ADR 13 — subsequently resolved D4 by enforcing the provenance of the fixtures this ADR publishes.`

## Notes

- 19 August 2026: **the short version of the implications.** Fixtures are reachable from any package through `@fleet/adapters/testing` and nowhere else. Production code may not import it — and because an exact-name ban misses subpaths, every package that bans `@fleet/adapters` must ban `@fleet/adapters/*` as well. Nothing Node-only may enter that directory. _(The clause that followed — "or the console's test run breaks" — was disproved on 20 August 2026 and is corrected under Constraints; a lint rule and its enforcement fixture now carry this.)_ At the time this ADR landed, fixture provenance was documented but unenforced. ADR 13 later added the recorder and CI drift guard and closed D4. The joining test landed on 20 August 2026 and moved this ADR to Implemented.
- 20 August 2026: an audit of `packages/adapters` found this ADR's Node-free rule unenforced and its named falsifier false — `node:fs` in the fixture loader left `packages/web` green. The decision stands unchanged; what was missing was the mechanism. A `no-restricted-imports` block over `src/testing/**` and a `no-restricted-syntax` selector for `import.meta.dirname`/`.filename` now carry it, with `src/testing/__enforcement__/nodeApi.ts` proving all four vectors fire. The stale fixture-count claim under Implications was corrected in the same pass.
- 19 August 2026: position 2 (plain JSON, no loader) is the fallback and requires no other change to this design. It becomes correct the moment the loader needs an environment-specific API, or a fixture needs to be invalid JSON.
