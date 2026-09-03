# ADR 12 — The Console Depends on the Adapters in Tests Only

**Decision:** `packages/web` declares `@fleet/adapters` as a dev dependency, bans the specifier package-wide in production code, and lifts the ban only for test files, so the end-to-end contract path can join a recorded vendor payload to the browser read model without vendor decoding reaching the bundle.
**Status:** Decided · 2026-08-19 · Implemented 2026-08-20
**Group:** Structure / enforcement (the console-side half of ADR 1's adapter boundary, enforced in the build rather than asserted in prose).

## Issue

The most valuable test in this repository is the one nobody can write from inside a single package: a recorded vendor payload, decoded by its real adapter, encoded to the canonical wire form, decoded again as untrusted input by the console, and mapped into the read model a page renders. It is the only evidence that the adapter's output and the console's expectations agree. Everything else tests one side of that seam against a fixture written by the same author.

Writing it requires `packages/web` to reference `@fleet/adapters`, which decodes untrusted vendor dialects and is server-side by construction (ADR 1). Nothing about vendor decoding belongs in a browser bundle: it is dead weight, it is an attack surface the console does not need, and its presence would mean the console _could_ start doing adapter work, which is the coupling the canonical envelope exists to remove.

So the question is not whether the dependency is desirable — it is not — but whether a mechanically enforced exception buys more evidence than it costs in risk, and what stops the exception from widening once it exists.

## Assumptions

- A test-only import tree-shakes out of a production bundle. Measured once already and re-measurable; the number is in Observed consequences rather than assumed.
- Test files are recognizable by filename. The exception is expressed as `**/*.test.{ts,tsx}`, which is the convention this package already uses and already lints against.
- The joining test wants to live beside the code it validates. `packages/web` exports nothing, so any other home for it deep-imports into a Vite application.

## Constraints

- Production code in `packages/web` — `app`, `features`, `entities`, `shared`, `config` — may never import `@fleet/adapters`, by any specifier, including `import type`.
- The exception must fail loudly if removed. An enforcement rule nobody tests is the state this repository was in until 19 August 2026 (ADR 7).
- One mechanism. The console already carries `boundaries/dependencies` for layer rules; a second enforcement system is only justified if the first genuinely cannot express the rule.

## Decision

`@fleet/adapters` is a **dev dependency** of `packages/web`. The specifier is banned package-wide by `no-restricted-imports` in `packages/web/eslint.config.js`, with a message naming the alternative (`@fleet/contracts`) and this ADR. The override block at the foot of that file — the one that already relaxes `no-restricted-syntax` for tests — lifts the ban for `**/*.test.{ts,tsx}` and nothing else.

**The rule is deliberately not expressed through `boundaries/dependencies`.** That plugin classifies a file by the element it sits in, and the `test` element is `pattern: "src/test/**"` — the setup directory. A file at `src/entities/robot/fromEnvelope.test.ts` is an `entity` like its neighbours, so adding `@fleet/adapters` to the entity layer's external `disallow` list would ban the import in precisely the file that needs it. Expressing the exception there would mean inventing a test-file element type and reclassifying every existing test in the package. ESLint's own file scoping says the same thing in two lines, so it says it.

Two fixtures under `src/entities/robot/__boundary-violation__/` pin both directions, and `features/fleet/__boundary-violation__/violation.test.ts` asserts them:

- `adapterImport.ts` — an entity importing `@fleet/adapters`. Must produce exactly one `no-restricted-imports` error.
- `adapterImport.fixture.test.ts` — the same import under a test filename. Must produce none.

`*.fixture.test.ts` is excluded from vitest collection in `vite.config.ts`: these files are inputs to a test, not tests.

## Positions

1. **Test-only dependency with a mechanically tested lint exception.** Chosen. The production dependency graph stays clean, the joining test lives beside the code it validates, and both halves of the rule are asserted rather than trusted.
2. **A dedicated integration package permitted to import both sides.** Rejected, though it is the cleaner story on paper: no exception exists to widen, and ownership of the cross-boundary test is explicit. It was rejected on cost and on honesty. The cost is a package, a CI job, and a third place to look for a test. The honesty problem is that `packages/web` has no export surface, so the integration package would deep-import `src/entities/robot/fromEnvelope.ts` — reaching into an application's internals, which is a worse boundary violation than the one it was created to avoid, and one that nothing would enforce.
3. **Stop the end-to-end path at the canonical wire boundary.** Rejected. Adapters would be tested up to the envelope, the console from the envelope onward, and the two would never meet. This is the position with no dependency question at all, and it is exactly the failure mode the canonical envelope is supposed to make impossible but does not: both sides can satisfy the schema and still disagree about meaning — a battery percentage the adapter emits as a fraction and the console renders as a percentage passes both suites and is wrong on screen. A contract that is only ever checked one side at a time is a contract nobody has tested.

## Argument

Position 1 was chosen because the risk it carries is bounded and observable, while the evidence it buys is not otherwise obtainable.

The risk is that the exception widens — someone adds a helper, a mock, or a second override, and adapter code starts appearing in places nobody audited. That risk is real, and it is why the fixture pair exists: the exception is not a comment saying "tests may do this", it is an assertion that fails when the override is removed and an assertion that fails when the ban stops firing. The failure mode of a widened exception is still open (see Open questions), but the failure mode of a _deleted_ exception — silently breaking the end-to-end path — is closed.

The comparison that mattered was against position 3, not position 2. Position 3 is what a cautious reading of ADR 1 would suggest: keep the packages apart, test each side against the schema. It was rejected because schema agreement is not semantic agreement. The canonical envelope constrains shapes and units-by-convention, not units-in-fact; the assertions this test exists to make — that centimetres and metres land in one unit, that an ISO string and an epoch number produce the same instant, that a vendor declaring no sequence produces "Not reported" rather than `0` — are exactly the ones neither side can make alone.

The cost is accepted and stated: a second enforcement mechanism in a package that already has one, justified by the first being structurally unable to express the rule.

## Implications

**Each item below is work this decision creates, a constraint it imposes, or a property it now guarantees.**

- **The ban covers `import type`.** The base `no-restricted-imports` rule reports type-only imports, and that is deliberate rather than incidental: a type import erases at build time and would not affect the bundle, but it still couples the console's types to vendor decoding, and the coupling is the thing being prevented. A future need for an adapter _type_ in production code is a new decision, not an exemption.
- **The exception is keyed to a filename, so test helpers are banned.** A shared helper at `src/test/adapterFixtures.ts` importing `@fleet/adapters` is rejected, because it is not `*.test.*`. If the joining test grows beyond one file, either the helper is itself a `*.test.ts` module or this ADR is amended. It must not be fixed by widening the glob quietly.
- **A second server-only package extends a list, not a mechanism.** `@fleet/server` or any future server-side package is added to the `paths` array in the same rule with the same override. Nothing about this decision is specific to adapters except the name.
- **The bundle claim must be re-measured when the joining test actually imports an adapter.** Today the import exists only in lint fixtures. A test-only import should still tree-shake, but "should" is not a measurement, and this is the single number that would falsify the decision.
- **The joining test is the reason this exists, and it now lives in
  `src/entities/robot/fromEnvelope.test.ts`.** It runs each recorded representative
  payload through the exhaustive registry, canonical wire encoding and decoding, and the
  browser read-model mapper. Status is Implemented because the exception now buys the
  evidence it was created for, not merely because its fixtures exist.
- **The fixtures are load-bearing and look like dead code.** Both files under `src/entities/robot/__boundary-violation__/` import a package the console does not use and export a value nobody reads. A tidy-up that deletes them removes the only proof the rule is live, and the `__boundary-violation__` convention plus the comment in each file is what stands between them and that tidy-up.
- **`vite.config.ts` now has an exclude that must survive.** If `*.fixture.test.ts` is collected by vitest again, the suite fails on a fixture that contains no tests, and the likely "fix" is deleting the fixture.
- **CI must install dev dependencies for `packages/web`.** Already true, and now load-bearing: without them the lint fixtures cannot resolve, and `checkUnknownLocals` (ADR 7) turns an unresolvable import into an error rather than a skip.

## Open questions

- **Should the exception be narrowed from all test files to the specific files that need it?**
  _Current lean:_ No. A per-file allowlist is a list nobody updates, and its rot is silent; the fixture pair already makes a widened exception visible at review time. Revisit if adapter imports appear in test files that are not the joining test.
- **Should the bundle symbol grep run in CI rather than by hand?**
  _Current lean:_ Yes, once the joining test imports an adapter for real. The check exists and passes today (Observed consequences), but run by hand it proves the state of one afternoon; the size comparison it replaces cannot be automated at all, because the hash moves for unrelated reasons. Dependency-cruiser as a second static guard is _not_ wanted — one mechanism, per § Constraints.
  _Resolves on:_ the first real adapter import in a test.

## Observed consequences

- **20 August 2026 — the joining test landed for all three dialects.** It proves battery
  and position normalization, the shared instant, B's absent sequence, A/C capability
  differences, C's unknown-field tally, unsourced connectivity, and declared-but-dropped
  heading through the browser read model. The production build remains checked separately
  by the bundle gate; the import is confined to the test override described above.

- **19 August 2026 — the plan's own mechanism was wrong, and the enforcement caught it before the code did.** This decision was first written as "add `@fleet/adapters` to the entity layer's external `disallow` list, where the `test` element type keeps test files legal." That element is the setup directory, so the ban would have hit `entities/robot/fromEnvelope.test.ts` — the one file the exception exists for. The error surfaced while reading the config rather than after writing the joining test, which is the argument for enforcement-before-consumer stated in TODO **T1**.
- **19 August 2026 — both directions observed firing.** `adapterImport.ts` produces exactly one `no-restricted-imports` error; `adapterImport.fixture.test.ts` produces none. The negative assertion was probed for vacuity: with a `console.log` appended, the fixture reports `no-console`, proving the file is fully linted and only the one rule is lifted rather than the file being skipped.
- **19 August 2026 — bundle unchanged, then verified by symbol.** Immediately after adding the dev dependency and both fixtures, `dist/assets/index-*.js` was byte-identical to the build before them: 567.32 kB raw, 175.01 kB gzip, same content hash `index-D1sx2tKT.js`. That equality is a before/after with everything else held constant and does **not** survive as a standing claim — the hash moves whenever anyone touches the console, and it had already moved to 567.36 kB by the end of the same day for reasons unrelated to this decision.
  The durable check is by symbol, and it is the one to automate: `SUPPORTED_VENDORS`, `isSupportedVendor`, `createUnknownFieldLedger`, `malformed_payload` and `unmappable_value` each appear **zero** times in the built output. A size comparison answers "did this change cost anything"; only the symbol grep answers "is adapter code in the browser", which is the question this ADR actually turns on.

## Related

- **ADR 1** (adapter boundary) — this ADR is the console-side enforcement of its rule that vendor decoding stays behind the canonical envelope.
- **ADR 7** (module resolution for boundary enforcement) — `checkUnknownLocals` and the resolver configuration are what make an unresolvable import an error here rather than a silent skip; the fixture-pair convention comes from the same place.
- **ADR 10** (pre-freshness adapter envelope) — the other half of the same seam: ADR 10 fixes what an adapter produces, this ADR fixes who may call one.
- **ADR 11** (public `./testing` subpath for fixtures) — how the joining test reaches a recorded vendor payload once this ADR permits it to import one. Register **D2** and **D3** are the two halves of the same test: ADR 11 decides how the bytes arrive, this ADR decides who may ask for them.
- **ADR 4** (feature-sliced structure) — the layer rules this decision deliberately does _not_ extend, and § Decision says why.
- **Principle 2** (external contracts decoded once) — the joining test exists to prove the console's decode agrees with the adapter's encode.
- **Principle 15** (enforcement proportionate and tested) — the fixture pair is the "and tested" half; a rule that cannot fail mechanically does not exist.
- **Register D3** (`docs/PENDING_ARCHITECTURE_DECISIONS.md`) — the stub this ADR ratifies; now a tombstone.
- **Artifact `packages/web/eslint.config.js`** — the rule and its override.
- **Artifact `packages/web/src/entities/robot/__boundary-violation__/`** — both fixtures.
- **Artifact `packages/web/src/features/fleet/__boundary-violation__/violation.test.ts`** — § "server-only package imports" asserts both directions.
- **Artifact `packages/web/src/entities/robot/TODO.md`** — **W-1** and **W-2** carry the implementation notes and the bundle baseline.

## Notes

- 19 August 2026: ratified from register stub **D3**, option 1, as recommended. The enforcement predated the ratification by three hours; this ADR records a decision already probed rather than one taken on paper, which is the reverse of the usual order and worth noting as such.
- 19 August 2026: numbered 12 rather than 11. Two sessions ratified two stubs from the same register within minutes of each other and both reached for 11; the other landed first and kept it (ADR 11, register **D2**). Worth a procedural note — the register hands out stub identifiers but nothing hands out ADR numbers, so concurrent ratification collides by default.
