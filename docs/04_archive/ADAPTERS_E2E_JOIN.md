# TODO — decisions this package must absorb before the end-to-end path can close

**Authority:** Historical only. This completed joining checklist is retained for provenance;
current ADRs and package specifications govern behavior.
**Archived:** 2026-08-20
**Superseded by:** ADRs 10, 11, 13, and 25; the adapters package specification; and the
raw-fixture-to-browser joining test.

**Created:** 19 August 2026 · **Audited:** 20 August 2026
**Owner:** the session implementing the end-to-end contract path (`packages/contracts/TODO.md` § 10, last item).
**Completion:** 20 August 2026. A-1 settled (ADR 10, and the signature is now stated in
`docs/03_package-specs/02_ADAPTERS.md` § 1), A-2 done (ADR 11), A-3 done and enforced
(ADR 13), A-4 verified, A-5 settled (ADR 25), and A-6 satisfied by the browser joining
test. `TODO.md` here plans the vendor work
as **B1–B4**, **C1–C9**, **D1–D8**; nothing below replaces those items — these are the
additional constraints the _joining test_ puts on them, which that checklist does not
cover because it was written before the client half existed.

Separate from the package [`TODO.md`](../../packages/adapters/TODO.md) to avoid two writers on one file. Fold these in
when the bootstrap settles.

---

## A-1 — SETTLED 20 August 2026: the adapter signature is `(payload: unknown, receivedAt: number) => AdapterResult<AdapterEnvelope>`

Receipt time is injected by the caller and never read from a clock here, per
`AGENTS.md` § Adapter contract. `AdapterEnvelope` is the pre-freshness type
`packages/contracts` **now exports** (ratified as
[ADR 10](../00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md), 19 August
2026): the canonical envelope minus `freshness`, which the server completes
through `withFreshness`. Adapters take their `@fleet/contracts` dependency
(**A7**) and write `B1`–`B3` / `C2`–`C4` against it. An adapter that supplies
`freshness` is a compile error and a strict-schema rejection, so the rule this
sequencing existed to protect is now mechanical.

The joining test passes a literal `receivedAt`, so it can assert an exact
canonical output; a wall-clock read anywhere in this chain makes that impossible
(**D3** says the same thing for the contract tests).

**No longer an assumption.** `docs/03_package-specs/02_ADAPTERS.md` § 1 states this
signature as the package's definition of an adapter, so the falsifier below is now a
decision to reverse rather than a discovery to make.

**Would be falsified if:** dispatch ended up passing a context object rather than two
arguments. Harmless, but the joining test's call site changes with it, and the package
spec changes first.

## A-2 — DONE 19 August 2026 · ratified as [ADR 11](../00_adr/11_PUBLIC_TESTING_SUBPATH_FOR_FIXTURES.md) — fixtures reach other packages through a `./testing` export, not a deep import and not a copy

The joining test in `packages/web` needs the _same bytes_ the adapter contract test
uses. Three ways to get them, one acceptable:

- **Chosen:** `package.json` `exports` gains `"./testing"`, exposing the **D2**
  fixture loader. One public way in, consistent with **C9**'s rule that deep
  imports are not the contract.
- Rejected: deep import into `src/vendors/<v>/__fixtures__/` — **C9** forbids it,
  and it freezes the internal layout the export map exists to keep free.
- Rejected: a second copy of the payload in `packages/web` — two fixtures for one
  dialect drift the first time either side is edited, and the drift is silent
  because both tests still pass.

**Environment constraint:** the fixture surface must remain free of Node-only APIs.
The original falsifier said a Node API would break web's jsdom tests; the 20 August audit
disproved that because jsdom runs inside Node. ADR 11 now records the correction, and the
adapter lint configuration enforces the constraint with a deliberate fixture.

**Landed and mechanically enforced.** The loader uses static JSON imports with no Node
API, while `packages/web/src/entities/robot/adapterFixtureAccess.test.ts` proves the public
subpath resolves. One consequence worth carrying forward: the exact-name
`no-restricted-imports` entry in `packages/web` did **not** cover the new subpath,
so a `patterns` entry was added and asserted by a boundary fixture. Any future
subpath on any workspace package inherits that gap.

## A-3 — DONE 19 August 2026 · ratified and enforced by [ADR 13](../00_adr/13_RECORDED_FIXTURES_WITH_A_CI_DRIFT_GUARD.md) — fixtures are recorded simulator output, and this package still does not depend on the simulator

`packages/simulator/src/vendors/{vendorA,vendorB,vendorC}.ts` are the authoritative
wire dialects and already name their adapter counterparts in `Coupling:` comments.
Fixtures here must be the simulator's actual output at a pinned instant, recorded
once and committed — not hand-written approximations, which drift from the producer
without anything failing.

**The dependency stays absent.** Adapters consuming the simulator would invert the
direction of the boundary this package exists to defend. The link is a documented
coupling plus a recording step, not an import.

**Enforced consequence:** when a dialect changes, re-record in the same change with
`pnpm record:fixtures`. CI runs that command and fails on a fixture diff. The recorder
lives in simulator and writes bytes into adapters; adapters imports no simulator module.
Recorded JSON is generated and reviewed, never edited by hand. Malformed fixtures remain
hand-authored outside the recorded-fixture path because the simulator emits only valid
payloads; ADR 13 § Implications records that boundary.

## A-4 — VERIFIED: the three dialect differences the joining test asserts are the ones the simulator emits

Read off the simulator when this was written, and **re-verified 20 August 2026 against the
recorded fixtures themselves** — which is stronger, because those bytes are the recorder's
actual output and CI fails on any drift from them (ADR 13). Every row below matches
`src/vendors/<v>/__fixtures__/representative.json`:

| Vendor | Battery         | Position    | Timestamp  | Status        | Declares                          | Notable                                                |
| ------ | --------------- | ----------- | ---------- | ------------- | --------------------------------- | ------------------------------------------------------ |
| A      | fraction `0..1` | metres      | ISO string | strings       | `dock`, `lidarHealth`, `sequence` | nested payload                                         |
| B      | integer percent | centimetres | epoch ms   | numeric codes | `dock` only                       | no `seq` field at all                                  |
| C      | fraction `0..1` | metres      | ISO string | strings       | `dock`, `waterLevel`, `sequence`  | `firmware_channel` is undocumented and must be counted |

The joining test asserts exactly these: that battery arrives as a percentage from
both a fraction and an integer, that centimetres and metres land in one unit, that
an ISO string and an epoch number produce the same `lastSeenAt`, that B declares no
`sequence` so the console shows "Not reported" rather than `0`, and that C renders a
water-level panel where A renders a lidar panel.

Three things the table does not say, all found at the 20 August audit and all of which
the joining test must account for:

- `firmware_channel` sits at `telemetry.firmware_channel`, nested rather than top-level, so
  the assertion is on a **dotted path** and a top-level key comparison would pass while
  finding nothing.
- **No dialect reports connectivity**, so every robot in the joining test arrives
  `connectivity: "unknown"`. Assert that rather than letting it read as an artefact.
- **All three dialects report a heading** and the canonical model has nowhere to put one.
  The joining test should assert its absence, or the drop is invisible on both sides.

**Falsified if:** the simulator's dialects change. Both the recorded fixtures here
and the assertions in `packages/web/src/entities/robot/fromEnvelope.test.ts` change
with them.

## A-5 — SETTLED: unknown-field accounting is per-adapter, not per-robot

The joining test asserts that vendor C's `firmware_channel` moved the _adapter's_
ledger, and the console labels the number "(adapter, fleet-wide)" for that reason
(ADR 1 § Implications). A per-robot counter would be a better product answer and a
contracts change first; until then, neither side may imply the precision.

**Settled 20 August 2026.** ADR 25 fixed it by scope:
unknown fields stay per adapter because that is the only precision the ledger has, and the
one genuinely per-robot fact — sequence continuity — moved to `sequenceHealth` on the
diagnostic envelope instead. The console now renders the caveat from `unknownFieldScope`
on the health response rather than from a hardcoded caption, so "neither side may imply the
precision" is carried in the data. What the joining test must still not do is sum this
against `malformedIngest`.

## A-6 — SATISFIED: the registry and all three vendor adapters exist

The joining test needs **C2** (or **C3**/**C4**), **C8** dispatch, **C9**/**A-2**
exports, and **D1** fixtures. Phase order is: contracts **C-1** → any one vendor →
the join. All three adapters and the registry now exist, and the browser joining test runs
all three representative fixtures. The production server join also exists: ADR 10 records
the decision not to re-validate typed adapter output per message, and ADR 11 permits the
server ingest test to use `@fleet/adapters/testing` through a narrow test-only exception.
This sequencing constraint creates no remaining adapter work.
