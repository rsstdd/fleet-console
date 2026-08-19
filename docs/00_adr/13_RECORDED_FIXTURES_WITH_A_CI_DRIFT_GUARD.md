# ADR 13 — Vendor Fixtures Are Recorded Simulator Output, Guarded by a CI Re-Record and Diff

**Decision:** Adapter fixtures are deterministic recorded output from the simulator's dialect generators, written by a committed recorder that lives in `packages/simulator`, and a CI step re-records and fails on any diff.
**Status:** Decided · 2026-08-19 · Implemented
**Group:** Data / integration (the provenance half of ADR 1's fixture evidence; ADR 11 decided how those fixtures are published).

## Issue

A fixture is the evidence that an adapter understands a vendor dialect. It is only evidence if it is what the producer actually emits. Two ways to get one were available, and the difference between them is invisible in the file: a hand-authored payload and a recorded payload look identical on disk, and both make the test suite green.

The repository already claimed the stronger of the two. `packages/adapters/src/testing/fixtures.ts` exported `FIXTURE_RECORDING` — seed, fleet size, instant — and its README described the payloads as "recorded output from the simulator … not hand-authored approximations". But the procedure behind that claim was a scratch file a human was expected to run and remember to re-run, and the README said so plainly: "This procedure is not enforced. Nothing fails if a dialect changes and the fixtures are not re-recorded, which is the weakest link in the chain."

That is the failure mode this ADR closes. The register recorded the question as **D4**, and `fixtures.ts` named D4 in its own module comment as the open half of its provenance story.

The claim was true when audited — regenerating at the pinned inputs reproduced all three committed payloads exactly. Being true today is not the property that matters. Nothing kept it true.

## Assumptions

- The simulator's generators are deterministic at a pinned seed and instant. This is already enforced: `packages/simulator/eslint.config.js` bans `Date.now`, `Math.random` and `performance.now` outside `src/runtime/`, and the generators take an injected clock and a seeded `RandomSource`.
- Vendor dialects change rarely, so an explicit re-record step is a small tax paid at the moment someone is already editing the dialect.
- CI runs on every pull request and can run a workspace script and a `git diff`.
- Fixture bytes are stable under the repository's formatter. If they were not, the diff would fire on formatting and the guard would be turned off within a week.

## Constraints

- **Adapters must not depend on the simulator, in production or in tests** (ADR 1, ADR 11 § Constraints). This is the binding constraint and it decides where the recorder lives.
- The fixture files stay where ADR 11 put them, `src/vendors/<v>/__fixtures__/`, statically imported by `src/testing/fixtures.ts`. This ADR decides provenance, not layout.
- The recording must be reproducible from values a reader can see. A seed buried in a script is not provenance.
- The guard must fail on dialect drift and on nothing else.

## Decision

Fixtures are **recorded**, and the recording is **mechanical**.

`packages/simulator/src/recording/` holds two modules. `fixtureSet.ts` is pure: it exports the pinned inputs — `RECORDING_SEED`, `RECORDING_FLEET_SIZE`, `RECORDING_INSTANT_MS` — and `buildRecordedFixtures()`, which returns the payload set as a value with no I/O. `record.ts` is the executable boundary: it writes those payloads into `packages/adapters/src/vendors/<v>/__fixtures__/`.

The recorder lives in `packages/simulator` because the constraint above forbids it living in `packages/adapters`. What crosses the package boundary is **bytes on disk, not a module import**, and the arrow points one way. Adapters gains no dependency, in either direction, in production or in tests.

`pnpm record:fixtures` runs the recorder and then Prettier over what it wrote, so the committed bytes are always exactly `record + format`. `.prettierrc.json` pins `objectWrap: "collapse"` for those files so the formatting is canonical rather than a function of how the recorder happened to emit line breaks.

CI runs `pnpm record:fixtures` and then `git diff --exit-code` over the fixture paths. A non-empty diff fails the build with a message naming the fix: run the command locally and commit the result, never edit the JSON.

Two guards, not one. The diff catches a dialect that moved without its fixtures. `record.ts` additionally reads `packages/adapters/src/testing/fixtures.ts` as text and fails if the `FIXTURE_RECORDING` constants disagree with the pinned inputs it used — because provenance can go stale while every byte stays correct, and the diff cannot see that. It is a textual check specifically so this package still does not import that one.

## Positions

1. **Recorded simulator output with no runtime dependency, plus a CI re-record and diff.** Chosen. Fixtures are bit-for-bit what the simulator produces; drift becomes a build failure rather than a thing someone notices later.
2. **Hand-authored fixtures checked against the vendor schemas.** No coupling to the simulator at all, and fixtures can be minimal or adversarial. Rejected as the primary source: the fixture is then evidence that the adapter agrees with a _second hand-written artefact_, not with the producer. It remains the only option for malformed payloads — see Implications.
3. **Generate fixtures during tests by importing the simulator.** Always current, no re-recording. Rejected, and it is the position worth naming: a defect present in both producer and consumer cancels out and the test still passes. It also inverts the boundary ADR 1 and ADR 11 defend.
4. **Recorded output with no guard** — the status quo before this ADR. Rejected because it is indistinguishable from position 2 after the first missed re-record, and nothing announces when that happens.

## Argument

Position 1 was chosen because it is the only one where the fixture's claim about itself is checkable. The value of "this is exactly what the field device produces" is entirely in whether something enforces it; position 4 makes the claim and position 1 keeps it.

The comparison with position 3 is the substantive one, because position 3 is strictly more convenient and that is what makes it tempting. Importing the generator into the adapter's test suite means the fixture is never stale. It also means the test is comparing the producer against itself: if a unit conversion is wrong in `vendorB.ts` and wrong in the same direction in the vendor B adapter, the round trip is clean and the suite is green. The recorded byte is what breaks that symmetry — a human reviewing a fixture diff sees `batt_pct` become `battery_pct` and asks why. That review moment is the actual product of this decision, and position 3 deletes it.

Position 1's one real weakness is "someone must remember to re-record". The CI step removes exactly that weakness, which is why the two halves are one decision rather than two.

The cost is a recorder to maintain, one CI step, and a formatting pin. All three are named here rather than discovered later.

## Implications

- **Malformed fixtures cannot be recorded, and must not pretend to be.** The simulator only emits well-formed payloads, so the malformed cases adapters `TODO.md` **C1** calls for are necessarily hand-authored or mutated from a recorded payload. They are therefore **outside** the diff guard, and when they land they belong in a separate directory or naming scheme so the guard's path filter does not sweep them in. A hand-authored payload sitting next to recorded ones under the same name is the confusion this ADR exists to prevent.
- **Boundary fixtures are a later, deliberate addition.** Only `representative` is recorded today, which is why `VendorFixtureName` has one member. Adding a case means extending `buildRecordedFixtures()` **and** that package's registry in the same change; the recorder is structured to take more cases, and the loader's record is already `Partial` to allow them.
- **The re-record step is now part of a dialect change, not a follow-up.** Editing `vendorA.ts`, `vendorB.ts` or `vendorC.ts` and not running `pnpm record:fixtures` fails CI. The three generators carry a comment saying so.
- **Recorded fixtures are generated files.** They are reviewed, not edited. An edit is reverted by the next recorder run, and CI fails in between.
- **`FIXTURE_RECORDING` is now load-bearing rather than descriptive.** It is checked. Changing the pinned inputs on either side without the other fails the recorder with a message naming the field.
- **The formatter is part of the contract.** `objectWrap: "collapse"` on the fixture glob is what makes the output canonical. Removing that override reintroduces input-dependent formatting and the guard starts reporting whitespace.
- **Cost of reversal is cheap.** Deleting the CI step returns the repository to position 4; deleting the recorder returns it to position 2. Neither requires touching an adapter.

## Open questions

- **Does the guard survive contact with a real dialect change?** It has been exercised synthetically — renaming a vendor B wire field produces the expected one-line diff — but not yet by an actual dialect edit in a pull request.
- **What replaces the diff if the simulator stops being deterministic at a pinned seed?** That is the falsifier this decision rests on. If evolution or generation ever takes an ambient input, the diff becomes noise and the guard has to be replaced with a schema-shaped check that asserts the fixture's _shape_ against the dialect rather than its bytes. The lint bans in `packages/simulator/eslint.config.js` are what currently make that unlikely.
- **Where do malformed fixtures live?** Named above as outside the guard, but the directory convention is not settled and does not need to be until **C1** lands.

## Observed consequences

- 19 August 2026: implemented. `packages/simulator/src/recording/{fixtureSet,record}.ts`, a `record:fixtures` script at the root and in the simulator, a CI step, and a `objectWrap` override for the fixture glob.
- The three fixtures committed under ADR 11 were verified to reproduce exactly at the pinned inputs before the guard was added, so the guard was adopted against a tree already in the state it enforces. No fixture content changed in this ADR — only its provenance became checkable.
- Both failure paths were exercised before landing: a renamed vendor B wire field produces a one-line fixture diff, and a changed `RECORDING_SEED` fails the recorder by name against `FIXTURE_RECORDING` rather than silently re-recording.
- `fixtureSet.test.ts` asserts the determinism the guard depends on, including that both encodings of the pinned instant agree and that the vendor B and vendor C absences (`seq`, `telemetry.lidar`) survive recording.

## Related

- **ADR 11** (public test-only `./testing` subpath) — decided how fixtures are _published_; this ADR decides where they _come from_. ADR 11 § Constraints states the no-simulator-dependency rule this ADR had to route around, and `fixtures.ts` named **D4** as its open half.
- **ADR 1** (adapter boundary) — the fixtures are the evidence its contract tests rest on, and § Implications calls the three dialects' disagreements "load-bearing test fixtures rather than incidental flavour". Recording is what keeps that true.
- **ADR 9** (source exports, `tsx` runtime) — the recorder is run by Node directly against TypeScript source, like every other executable script here.
- **Principle 10** (tests prove behaviour at the cheapest reliable boundary) — a recorded byte compared in CI is cheaper than an integration test that would catch the same drift.
- **Principle 14** (the repository is operable by agents and auditable by people) — an agent editing a dialect is exactly the actor most likely to skip a manual re-record step, which is why this one is mechanical.
- **Principle 15** (enforcement is proportionate and tested) — the guard is one CI step, and the determinism it depends on is unit-tested rather than assumed.
- **Register D4** — resolved by this ADR; the stub is now a tombstone.
- **Artifact `packages/adapters/src/testing/README.md`** — carries the re-record command and the generated-file rule for whoever opens the fixtures first.

## Notes

The recorder writing _into_ another package is unusual enough to state plainly: it is a one-way file write performed by a script, not a module dependency, and it was chosen because the alternative — adapters importing the simulator to generate its own fixtures — is the position this ADR rejects most strongly. The direction of the write matches the direction of authority: the simulator owns the dialects, so it emits them.
