# TODO — decisions this package must absorb before the end-to-end path can close

**Authority:** Planning only. This joining checklist is non-normative; accepted ADRs and current package specifications govern conflicts.

**Created:** 19 August 2026
**Owner:** the session implementing the end-to-end contract path (`packages/contracts/TODO.md` § 10, last item).
**Status:** A-1 and A-2 done (ADR 10 and ADR 11, 19 August 2026); the rest waiting. `TODO.md`
here already plans the vendor work as **B1–B5**, **C1–C9**, **D1–D8**. Nothing below
replaces those items — these are the additional constraints the _joining test_ puts
on them, which that checklist does not cover because it was written before the
client half existed.

Separate from [`TODO.md`](./TODO.md) to avoid two writers on one file. Fold these in
when the bootstrap settles.

---

## A-1 — ASSUMPTION: the adapter signature is `(payload: unknown, receivedAt) => AdapterResult<AdapterEnvelope>`

Receipt time is injected by the caller and never read from a clock here, per
`AGENTS.md` § Adapter contract. `AdapterEnvelope` is the pre-freshness type
`packages/contracts` **now exports** (ratified as
[ADR 10](../../docs/00_adr/10_PRE_FRESHNESS_ADAPTER_ENVELOPE.md), 19 August
2026): the canonical envelope minus `freshness`, which the server completes
through `withFreshness`. Adapters take their `@fleet/contracts` dependency
(**A7**) and write `B1`–`B3` / `C2`–`C4` against it. An adapter that supplies
`freshness` is a compile error and a strict-schema rejection, so the rule this
sequencing existed to protect is now mechanical.

The joining test passes a literal `receivedAt`, so it can assert an exact
canonical output; a wall-clock read anywhere in this chain makes that impossible
(**D3** says the same thing for the contract tests).

**Falsified if:** dispatch ends up passing a context object rather than two
arguments. Harmless, but the joining test's call site changes with it.

## A-2 — DONE 19 August 2026 · ratified as [ADR 11](../../docs/00_adr/11_PUBLIC_TESTING_SUBPATH_FOR_FIXTURES.md) — fixtures reach other packages through a `./testing` export, not a deep import and not a copy

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

**Falsified if:** the fixture loader turns out to need Node's filesystem, which
would put a Node-only module on a path a browser-targeted package imports even in
tests. Then the fixtures must be plain JSON imported directly, and the export map
exposes the directory rather than a loader.

**Landed, and the falsifier held.** The loader is static JSON imports with no
Node API, and `packages/web/src/entities/robot/adapterFixtureAccess.test.ts`
proves it loads under jsdom. One consequence worth carrying forward: the exact-name
`no-restricted-imports` entry in `packages/web` did **not** cover the new subpath,
so a `patterns` entry was added and asserted by a boundary fixture. Any future
subpath on any workspace package inherits that gap.

## A-3 — DONE 19 August 2026 · ratified and enforced by [ADR 13](../../docs/00_adr/13_RECORDED_FIXTURES_WITH_A_CI_DRIFT_GUARD.md) — fixtures are recorded simulator output, and this package still does not depend on the simulator

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

## A-4 — ASSUMPTION: the three dialect differences the joining test asserts are the ones the simulator actually emits

Read off the simulator today:

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

**Falsified if:** the simulator's dialects change. Both the recorded fixtures here
and the assertions in `packages/web/src/entities/robot/fromEnvelope.test.ts` change
with them.

## A-5 — ASSUMPTION: unknown-field accounting stays per-adapter, not per-robot

The joining test asserts that vendor C's `firmware_channel` moved the _adapter's_
ledger, and the console labels the number "(adapter, fleet-wide)" for that reason
(ADR 1 § Implications). A per-robot counter would be a better product answer and a
contracts change first; until then, neither side may imply the precision.

## A-6 — SEQUENCING: nothing on the web side can start until one vendor adapter and the registry exist

The joining test needs **C2** (or **C3**/**C4**), **C8** dispatch, **C9**/**A-2**
exports, and **D1** fixtures. Phase order is: contracts **C-1** → any one vendor →
the join. The join is then repeated per vendor at the cost of three lines each.
