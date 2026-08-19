# `@fleet/adapters/testing`

The public, test-only surface of this package: recorded vendor payloads, loadable
by vendor and name. Decided in
[ADR 11](../../../../docs/00_adr/11_PUBLIC_TESTING_SUBPATH_FOR_FIXTURES.md).

```ts
import { loadMalformedPayload, loadVendorFixture } from "@fleet/adapters/testing";

const { payload, recordedAt } = loadVendorFixture("C");
// payload is `unknown` — decode it with the vendor schema you are exercising

loadVendorFixture("C", "boundary-empty"); // flat battery, docked, tank empty
loadVendorFixture("C", "boundary-full"); // full battery, undocked, tank full

const { payload: bad, reason } = loadMalformedPayload("C", "unparsable-timestamp");
// `bad` must be rejected; `reason` says why, for the assertion message
```

## Why a subpath exists at all

Fixtures are the evidence that an adapter understands a vendor dialect. Other
packages need **those exact bytes**, not an approximation: the end-to-end test
that feeds a recorded payload through the adapter into the console's read model
is only worth something if both halves are looking at the same input.

The alternatives were a deep import into `src/vendors/<v>/__fixtures__/`, which
freezes an internal layout the export map exists to keep free, and a second copy
of the JSON in the consuming package, which drifts the first time either side is
edited — silently, because both tests still pass. One public way in is the
cheapest thing that prevents both.

## Rules

- **Test code only.** Every consuming package bans this specifier in production
  code and lifts the ban for test files. The ban is asserted, not assumed —
  `packages/web/src/entities/robot/__boundary-violation__/` holds a fixture for
  each half.
- **No Node-only APIs here.** The fixtures are static JSON imports rather than
  filesystem reads, so a browser-targeted consumer loads them exactly as a Node
  one does. Adding `node:fs` to this directory breaks `packages/web`'s test run
  and is the falsifier ADR 11 names.
- **Payloads stay `unknown`.** A typed fixture lets a test pass while the schema
  it exercises is wrong.

## Provenance, and how to re-record

The payloads are **recorded output from the simulator**, which owns the
authoritative dialects in
`packages/simulator/src/vendors/{vendorA,vendorB,vendorC}.ts` — not
hand-authored approximations, which drift from the producer without anything
failing.

**These JSON files are generated. Review them; do not edit them.** An edit is
reverted by the next recorder run, and CI fails in between.

Re-record from the repository root:

```bash
pnpm record:fixtures
```

That runs the recorder in `packages/simulator/src/recording/` and then formats
what it wrote, so the committed bytes are always exactly `record + format`. Run
it in the same change as any edit to a vendor dialect and commit the result.

Pinned inputs, also exported as `FIXTURE_RECORDING`:

| Input     | Value                                        |
| --------- | -------------------------------------------- |
| seed      | `1`                                          |
| fleetSize | `9`                                          |
| instant   | `1755600000000` (epoch ms)                   |
| robots    | `R-001` (vendor A), `R-002` (B), `R-003` (C) |

The `representative` robots are serialized in their initial state, straight from
`createFleet` with no evolution ticks. The boundary cases keep those identities and
replace the state with a pinned constant, so every recorded `seq` is `0` either
way. That keeps the recording a function of the seed alone.

**This procedure is enforced** ([ADR 13](../../../../docs/00_adr/13_RECORDED_FIXTURES_WITH_A_CI_DRIFT_GUARD.md)).
CI re-records and fails on any diff, so a dialect that moves without its fixtures
breaks the build rather than going unnoticed. `FIXTURE_RECORDING` is checked as
well: the recorder reads this package's `fixtures.ts` and refuses to run if the
pinned inputs disagree, because stale provenance is invisible to a byte diff.

The recorder lives in `packages/simulator`, not here, and that is deliberate:
**adapters must not depend on the simulator**, in production or in tests. Doing
so would invert the boundary this package exists to defend, and a defect present
in both producer and consumer would cancel out and go unnoticed. What crosses the
boundary is bytes on disk, written by a script — not a module import.

## Two provenances, deliberately not one union

| Surface                                          | Origin                             | Lives in                         |
| ------------------------------------------------ | ---------------------------------- | -------------------------------- |
| `loadVendorFixture` / `listVendorFixtures`       | recorded by `pnpm record:fixtures` | `src/vendors/<v>/__fixtures__/`  |
| `loadMalformedPayload` / `listMalformedPayloads` | hand-authored                      | `src/vendors/<v>/__malformed__/` |

They are separate accessors rather than one loader with a wider name union
because the two have different provenance, and a single union would hide that at
the call site. A recorded fixture carries `robotId` and `recordedAt` and is
reproducible from `FIXTURE_RECORDING`; a malformed payload carries neither and a
`reason` instead, because nothing generated it.

**The simulator cannot produce a malformed payload** — it only emits well-formed
output — so these are written by hand, and ADR 13 § Implications is where that
boundary is recorded. Keeping them in `__malformed__/` rather than `__fixtures__/`
is what lets the recorder's "generated, never edited" rule stay true of everything
in `__fixtures__/`, and what keeps hand-written bytes inside ADR 27's
reviewable-diff budget instead of silently exempt from it.

### The recorded cases

| Name             | What it pins                                                                      |
| ---------------- | --------------------------------------------------------------------------------- |
| `representative` | The fleet robot as `createFleet` built it                                         |
| `boundary-empty` | Battery 0, docked (so `dock_id` is a string), lidar faulted, tank empty, min pose |
| `boundary-full`  | Battery 1, undocked, lidar nominal, tank full, max pose and heading               |

The boundary states are constructed rather than drawn from the fleet, because the
fleet cannot reach them: `initialState` draws battery from `[0.35, 1)`, so no seed
produces a flat or a full robot. They are still states `evolveRobot` can reach, so
"this is what the producer emits" stays true. See `boundaryState` in
`packages/simulator/src/recording/fixtureSet.ts`.

## What is not here yet

Status `fault` and health `critical` appear in no payload, in any case, for any
vendor. Those are the status-vocabulary mapping in adapters `TODO.md` **C5**,
which needs one payload per source value rather than one per extreme.
