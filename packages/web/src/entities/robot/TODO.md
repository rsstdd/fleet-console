# TODO — `entities/robot`

**Authority:** Planning only. This checklist is non-normative; accepted ADRs and current package specifications govern conflicts.

**Created:** 19 August 2026
**Scope:** the robot read model and its mapping from the canonical envelope. The page-level gaps are in [`../../features/robot/TODO.md`](../../features/robot/TODO.md); the cross-package gates are in [`packages/contracts/TODO.md`](../../../../contracts/TODO.md) § 10.

This directory turned into the seam between `@fleet/contracts` and the console on
19 August 2026. Everything below is a decision or an assumption made during that
change, recorded so the next agent can check it rather than inherit it.

---

## Pending — the end-to-end contract path

### W-1 — RATIFIED as [ADR 12](../../../../../docs/00_adr/12_TEST_ONLY_ADAPTER_DEPENDENCY_IN_WEB.md) on 19 August 2026 — enforcement landed, joining test still blocked

This item is no longer a local position. It was register stub **D3**, ratified as
ADR 12 (option 1, as recommended), and the ADR is now the authority — its
Implications section carries the constraints this note only summarises, including
the two that are easy to breach by accident: the ban covers `import type`, and the
exception is keyed to a filename so a shared test helper importing adapters is
rejected. What follows is the implementation record.

The end-to-end path is `raw vendor fixture → adapter → canonical envelope → JSON →
decode → read model`. Its last two steps are in `fromEnvelope.ts`, which cannot be
imported out of this Vite app cleanly, so the test comes to the code:
`fromEnvelope.test.ts` § "wire round trip".

`@fleet/adapters` is a **devDependency** of `packages/web`, and that stays
mechanically true — adapters is server-side vendor decoding and has no business in a
browser bundle.

**The planned mechanism was wrong and was corrected in the writing.** The plan said
to add `@fleet/adapters` to the entity layer's external `disallow` list in
`boundaries/dependencies`, relying on the `test` element type to keep test files
legal. That element is `pattern: "src/test/**"` — the setup directory — so
`entities/robot/fromEnvelope.test.ts` is classified as an `entity` like its
neighbours, and the ban would have hit the one file that needs the import. Expressing
the exception through boundaries would have meant inventing a test-file element type
and reclassifying every existing test.

**What landed instead:** a package-wide `no-restricted-imports` ban on
`@fleet/adapters` in `eslint.config.js`, lifted for `**/*.test.{ts,tsx}` by the
override block already at the bottom of that file — the same idiom the token rules
use. Two fixtures under `src/entities/robot/__boundary-violation__/` assert both
halves: `adapterImport.ts` proves the ban fires, `adapterImport.fixture.test.ts`
proves the exception holds. The second matters more: the exception is the half
someone tidying the config would remove, and its removal would break the end-to-end
path rather than anything visible here.

`*.fixture.test.ts` is excluded from vitest collection in `vite.config.ts` — it is an
input to a test, not a test. The pair is asserted by
`features/fleet/__boundary-violation__/violation.test.ts` § "server-only package
imports", which was verified non-vacuous: with a `console.log` appended, the fixture
reports `no-console`, so the file is fully linted and only the one rule is lifted.

**Rejected:** a dedicated `packages/integration` workspace that may import all four
packages. Cleaner in principle, but it would still deep-import this file, since
`packages/web` exports nothing.

**Still blocked on** (the test itself, not its enforcement): one vendor adapter,
dispatch, and the fixture export (`packages/adapters/TODO_E2E_JOIN.md`), which in
turn wait on the pre-freshness envelope type
(`packages/contracts/TODO_E2E_JOIN.md` **C-1**).

### W-2 — ASSUMPTION: a devDependency does not reach the production bundle — HOLDS, and the check changed

First measured as a before/after: adding the devDependency and both fixtures left
`dist/assets/index-*.js` byte-identical at **567.32 kB raw, 175.01 kB gzip**, same
content hash. That comparison expired within hours — the hash moved to 567.36 kB
from other people's work on the console, and a size figure cannot distinguish
"adapters leaked in" from "someone edited a component".

**The check that survives is by symbol.** `SUPPORTED_VENDORS`, `isSupportedVendor`,
`createUnknownFieldLedger`, `malformed_payload` and `unmappable_value` each appear
zero times in the built output:

```
pnpm --filter web build && grep -c SUPPORTED_VENDORS packages/web/dist/assets/*.js
```

Re-run it when the joining test imports an adapter for real, and automate it then
(ADR 12 § Open questions). A test-only import should still tree-shake, but "should"
is not a measurement.

### W-3 — PENDING: the fleet filter still builds vendor options from a constant

`Robot.vendor` is now `string`, matching the contract's open vendor identifier — a
fourth vendor is an adapter change and never a contracts change (ADR 1). The closed
`Vendor` union and `VENDORS` survive for one reason: `features/fleet` renders its
filter options from them rather than from the robots it was given. Derive the
options from the fleet and both can go.

---

## Decisions taken, recorded so they can be challenged

### W-4 — Contract types are imported, never redeclared; the read model is what remains

`model.ts` imports `RobotStatus`, `HealthSeverity`, `FreshnessState`, `Health`,
`Position`, `Capabilities` and every capability payload from `@fleet/contracts`.
What this package still owns is genuinely different from the wire: ISO strings
rather than epoch milliseconds, and the per-adapter counters the health endpoint
serves. If those two differences ever disappear, so should the read model.

### W-5 — A robot that has never reported has null health, model and diagnostics

The contract models it as `RegisteredRobotState`, a separate schema with no
telemetry at all, which exposed that the console had been asserting
`severity: "nominal"` for machines nobody had heard from. The severity vocabulary
has no word for "not known", so the read model uses null and the page states the
absence (spec § 10, "registration data only"). An em-dashed diagnostics table would
imply the robot reported and said nothing.

### W-6 — A response that fails the canonical schema is terminal, not recoverable

The server did not stumble; it sent bytes this console cannot read, and retrying
returns the same bytes. The message carries `issue.path` and `issue.code` from the
contract's stable failure shape (coupling recorded in
`packages/contracts/TODO_E2E_JOIN.md` **C-4**).

### W-7 — ASSUMPTION, fixture-only: connectivity is `unknown` when freshness is `unreachable`

`fixtureConnectivity` in `useRobotDetail.ts` invents this, because connectivity is
the robot's own link state and the fixture has to choose one. It is a plausible
stand-in, not a rule: when the real endpoint lands, the server reports connectivity
and this function goes away. It must not outlive the fixture.

### W-8 — Counters are injected because no envelope carries them — **half closed 19 August 2026**

**Closed for sequence continuity by [ADR 25](../../../../../docs/00_adr/25_CONTRACTS_OWNS_EVERY_DECODED_RESPONSE_COUNTERS_BY_SCOPE.md)** (register stub **D12**, option 1).

The item bundled two counters as one problem, and that bundling was the defect. They
have different true scopes:

- **Sequence continuity is per robot** — each robot has its own vendor counter — so it
  now travels on `robotDiagnosticEnvelopeSchema` as `sequenceHealth` and
  `toRobotDetail` reads it off the envelope. The injected `sequenceGaps: number | null`
  is gone, and with it this package's second spelling of a fact the server already
  typed.
- **Unknown-field counts are per adapter and stay injected**, correctly. The ledger has
  no per-robot precision to offer (ADR 15), so a per-robot number would imply an
  accuracy that does not exist. `AdapterHealthCounters` now holds only that one field
  and is honestly named.

**Do not "finish" this by moving the unknown-field count onto the envelope.** That is
the half ADR 1 and ADR 15 deliberately keep at adapter scope; the remaining injection is
the decision, not the leftover.

**What is still open:** the count arrives from a fixture, not from a served
`healthResponseSchema`. That waits on the server's health endpoint.

### W-9 — The boundary-enforcement test got a 30 s budget

Each case runs type-aware ESLint, whose program now includes `@fleet/contracts`
sources because this directory imports them. Under the default 5 s timeout the
cases failed intermittently in parallel runs, which reads as "the dependency rule is
broken" when the rule is fine. A false enforcement failure is worse than a slow
test.
