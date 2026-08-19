# ADR 16 — The Supported-Vendor Set Lives in Adapters and Is Duplicated Under a Test-Only Parity Check

**Decision:** `packages/adapters` remains the authority for the supported-vendor set; `packages/simulator` keeps its independent literal and takes `@fleet/adapters` as a **dev** dependency, banned in production code, so one test can assert the two agree.
**Group:** Data / integration (the drift guard for a duplication ADR 1 requires).
**Status:** Decided · 2026-08-19 · Implemented

## Issue

Three vendor identifiers are written down twice. `packages/adapters` declares `SUPPORTED_VENDORS` / `SupportedVendor`, the finite set of dialects something here can actually decode. `packages/simulator` declares `VENDOR_IDS`, the set of dialects it emits. The duplication is deliberate — a production import from the simulator to the adapters would invert the boundary the simulator exists to exercise — and it is the right call.

What was wrong was not the duplication. It was that the duplication carried a **named guard that did not exist**. `simulatedRobot.ts` said, in its own doc comment, that `vendorId.test.ts` asserts the two lists agree. There was no such file anywhere in the repository, and nothing under `packages/simulator` imported `SUPPORTED_VENDORS` or otherwise compared the sets. `packages/README.md` repeated the claim.

Two identical literals with an imaginary guard are worse than two identical literals, because the comment makes the reader stop looking. The register recorded the question as **D7** and called it "the cheapest stub here to close".

The blast radius had also grown since the stub was written. `packages/server/src/config/fleetManifest.ts` now enumerates the set (`vendorId: z.enum(SUPPORTED_VENDORS)`), so a vendor added to the simulator alone fails server startup for every manifest entry naming it — loud, but only for robots that reach the manifest, and silent everywhere else.

## Assumptions

- The two lists are meant to be **equal**, not merely overlapping. A simulator that emits a dialect no adapter handles is a broken demo; an adapter with no producer is untested code that will be quietly dropped.
- A vendor is added rarely, so a two-file change is an acceptable tax paid at the moment someone is already adding a vendor module and fixtures.
- ESLint file scoping is a sufficient mechanism for a test-only dependency. ADR 12 established this exact pattern for `packages/web` and it holds here.
- The simulator's test runner can import a workspace package that the production build must not (ADR 9 — packages are consumed as source).

## Constraints

- **Adding a vendor must not change `packages/contracts`** (ADR 1). That is what rules out moving the set down into the canonical model.
- **The simulator must not depend on adapters in its production path.** It exists partly to falsify the adapters, and a producer that shares a literal with its consumer cannot emit the payload that would falsify it.
- The guard must fail in **both** directions. A one-way check leaves the other half of the drift undetected.
- The ban must itself be tested. Principle 15, and ADR 7's record of a boundary rule sitting inert while reporting nothing for any input.

## Decision

**Adapters keeps the set.** `SUPPORTED_VENDORS` and `SupportedVendor` stay in `packages/adapters/src/core/vendor.ts`, where the only two enumerating consumers are — the dispatch switch that needs the exhaustiveness check, and the server's manifest schema.

**The simulator keeps its own literal.** `VENDOR_IDS` stays restated in `simulatedRobot.ts`.

**`@fleet/adapters` becomes a dev dependency of `packages/simulator`**, banned package-wide by `no-restricted-imports` and lifted for test files only. The ban's message names the one file the exception exists for, because that is the only legitimate reason to reach for the specifier.

**`src/fleet/vendorId.test.ts` is that file** — the name the source comment already used, now real. It asserts four things: the two lists are equal including order; every emitted vendor satisfies `isSupportedVendor`; every supported vendor appears in the emitted set; and a fleet built at `SUPPORTED_VENDORS.length` actually contains all of them, which catches an allocation rule that skips a vendor the list still names.

**`src/__enforcement__/` pins the rule in both directions**, following `packages/adapters`' existing fixture pattern: a production import that must report `no-restricted-imports`, the same import under a test filename that must not, a `@fleet/server` import that must still be rejected, and a control that violates nothing. Without the control, a rule set reporting nothing for any input passes every other assertion.

## Positions

1. **Independent literals plus a test-only comparison.** Chosen. No production coupling, drift caught in CI, and the duplication stays honest about being duplication.
2. **Keep the contract's vendor id open; prove coverage with an integration fixture.** No simulator-to-adapters dependency of any kind. Rejected: the proof is weaker — it checks presence, not the exact set — and it still needs a place allowed to import both, so it does not actually avoid the problem it is meant to avoid.
3. **Move the supported set into `packages/contracts`.** One authoritative declaration, no duplication at all. Rejected: adding a vendor would become a contracts change, which is precisely what ADR 1 exists to prevent. It also moves the set away from the two consumers that enumerate it.
4. **Import adapters from simulator production code.** Not seriously considered, but worth naming: it is what "just remove the duplication" means in practice, and it deletes the simulator's ability to emit a payload the adapters reject.

## Argument

Position 1 was chosen because the duplication is not a defect to be removed — it is a property to be maintained. The simulator's independence is what makes it useful as a producer: it can emit a fourth dialect, or a malformed one, precisely because nothing ties its vocabulary to the decoder's. Positions 3 and 4 both buy "one source of truth" by spending that independence.

Given that the duplication stays, the only question is what notices when the copies diverge, and a test that imports both is the cheapest thing that can. Position 2 avoids the dev dependency but pays for it twice: a weaker assertion, and a home for the test that still has to be allowed to import both packages.

The dev dependency is the one genuine cost, and it is bounded by making the ban mechanical rather than conventional. The pattern is not novel here — ADR 12 made the identical trade for `packages/web`, for the identical reason, and this ADR follows its shape deliberately so there is one pattern in the repository rather than two.

## Implications

- **Adding a vendor is now a two-file change made in one commit**: the adapter module and fixtures in `packages/adapters`, and `VENDOR_IDS` in `packages/simulator`. Doing one without the other fails `vendorId.test.ts` with a message naming both lists.
- **`packages/simulator` now has a workspace dependency it did not have.** It is `devDependencies` only, and the production ban is what keeps that true; the enforcement fixtures are what keep the ban true.
- **The exception is narrow by construction.** The test override re-states `FORBIDDEN_PACKAGES`, so relaxing the rule for adapters did **not** relax it for `@fleet/server` or `@fleet/web` — a fixture asserts exactly that, because a blanket `"no-restricted-imports": "off"` in the test block would have been the easy and wrong way to write it.
- **`packages/simulator` gains its first `__enforcement__` directory**, and with it the convention that lint fixtures are named `*.fixture.test.ts` and excluded from vitest collection. That convention is now in three packages.
- **The parity test does not prove a dialect decodes.** It proves the vocabularies match. Exact vendor-to-canonical mapping is the adapter contract tests' job, on recorded fixtures (ADR 13). Conflating the two would make this test fail for reasons it cannot explain.
- **`packages/README.md` can now make the claim it was already making.** It stated that "a test asserts the two lists agree" before one existed; that sentence was corrected during an earlier audit and can be restored as true.
- **Cost of reversal is not applicable.** There is no scenario short of deleting the simulator in which two copies of this list should stop being compared.

## Open questions

- **Should the set move to `packages/contracts` if a fourth consumer appears?** Currently three. If a fifth package needed to enumerate supported vendors, the cost of the duplication would start to exceed the cost of an ADR 1 amendment. Not close today.
- **Does order equality hold up?** The test asserts declaration order matches, which is stricter than the requirement. Both lists drive round-robin allocation and dispatch, so order is meaningful in both — but if one ever needs a different order for a real reason, this assertion is the thing to relax, deliberately, rather than the thing to delete.

## Observed consequences

- 19 August 2026: implemented. `@fleet/adapters` added as a dev dependency of `packages/simulator`; `no-restricted-imports` extended with a test-only exception; `src/fleet/vendorId.test.ts` and `src/__enforcement__/` written; the stale comment in `simulatedRobot.ts` replaced.
- Both drift directions were exercised before landing. Adding a fourth vendor to `VENDOR_IDS` alone fails two assertions (`expected [ 'A', 'B', 'C', 'D' ] to deeply equal [ 'A', 'B', 'C' ]`); adding it to `SUPPORTED_VENDORS` alone fails three. Neither failure requires reading the test to interpret.
- Adding a vendor to `VENDOR_IDS` alone also fails eight unrelated tests in `createFleet.test.ts`, which pin the vendor mix. That is incidental coverage, not the guard: those tests fail on the shape of the fleet, not on the mismatch, and would not fire for a vendor added to adapters alone.
- The enforcement suite confirmed the exception is one-directional and narrow: the production fixture reports `no-restricted-imports`, the test-named fixture reports none, and `@fleet/server` is still rejected.

## Related

- **ADR 12** (test-only adapters dependency in `packages/web`) — the same trade for the same reason in a different package; this ADR deliberately copies its mechanism so the repository has one pattern for "dev dependency, banned in production, probed by fixtures".
- **ADR 1** (adapter boundary) — adding a vendor is one module plus fixtures in adapters and never a contracts change, which is what keeps the set out of `packages/contracts`.
- **ADR 13** (recorded fixtures with a CI drift guard) — the neighbouring duplication problem. Both answer "two artefacts must agree" with a mechanical check rather than a comment; that is now the house style for cross-package coupling.
- **ADR 7** (module resolution for boundary enforcement) — records the inert-rule failure mode that `src/__enforcement__/` exists to prevent.
- **ADR 14** (shared fleet roster parity) — a third instance of the same shape, and evidence the pattern generalises: two packages mirroring one structure, kept honest by a test neither package's production code can reach.
- **Principle 15** (enforcement is proportionate and tested) — the ban is one lint rule and its probes are four fixtures.
- **Register D7** — resolved by this ADR; the stub is now a tombstone.
