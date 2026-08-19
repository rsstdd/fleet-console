/**
 * The recorded vendor fixture set: the exact payloads `packages/adapters` commits
 * under `src/vendors/<v>/__fixtures__/` and serves through `@fleet/adapters/testing`.
 *
 * This module is the authority for *what* is recorded and at which inputs.
 * `record.ts` is the only thing that writes it to disk, so the fixture set stays
 * a pure value a test can assert on without any I/O.
 *
 * Determinism is the whole point (ADR 13). Every input is pinned below, so
 * re-running the recorder on any machine at any time reproduces identical
 * payloads. That is what lets CI re-record and diff, which is the guard that
 * stops a dialect change from silently leaving the fixtures behind. If this
 * module ever becomes non-deterministic the diff turns into noise and the guard
 * has to be replaced with a schema-shaped check; ADR 13 records that falsifier.
 *
 * Coupling, and the direction of it: `packages/adapters` consumes the output of
 * this module as committed JSON and holds no dependency on this package — not in
 * production and not in tests (ADR 11 § Constraints, ADR 13). That constraint is
 * why the recorder lives on this side of the boundary. The pinned values below
 * are mirrored in `packages/adapters/src/testing/fixtures.ts` as
 * `FIXTURE_RECORDING`, and `record.ts` fails if the two disagree.
 */
import { createFleet } from "../fleet/createFleet.ts";
import {
  SITE_HALF_EXTENT_M,
  dockIdFor,
  type RobotIdentity,
  type RobotState,
  type SimulatedRobot,
  type VendorId,
} from "../fleet/simulatedRobot.ts";
import { buildPayload, type VendorPayload } from "../vendors/buildPayload.ts";

/**
 * Seed for the recorded fleet. Matches `DEFAULTS.seed`, so the recording is what
 * an unseeded run emits rather than a private corner of the generator nobody
 * else visits.
 */
export const RECORDING_SEED = 1;

/**
 * Robots in the recorded fleet.
 *
 * Nine rather than three because the fixtures were first recorded from a
 * nine-robot fleet and the identities that fell out of it — `R-001`, `R-002`,
 * `R-003` — are now baked into `FIXTURE_RECORDING` and into every assertion that
 * names a robot. Changing this re-rolls `modelFor` and the initial states, so it
 * is a deliberate re-record, not a tidy-up.
 */
export const RECORDING_FLEET_SIZE = 9;

/**
 * The pinned wall-clock instant every recorded payload is stamped with,
 * `2025-08-19T10:40:00.000Z` as epoch milliseconds.
 *
 * Vendors A and C serialize it as ISO-8601 and vendor B as epoch milliseconds,
 * which is exactly the disagreement the adapters must reconcile: both encodings
 * have to decode to this one `reportedAt`. A contract test uses it as its
 * `receivedAt` too, so it can assert exact canonical output without reading a
 * clock (adapters TODO § D3).
 */
export const RECORDING_INSTANT_MS = 1_755_600_000_000;

/**
 * Every recorded case, in the order each vendor's fixtures are emitted.
 *
 * These are the file stems written under `__fixtures__/` and the members of
 * `VendorFixtureName` in `packages/adapters/src/testing/fixtures.ts`. That package
 * imports each file statically, so adding a name here is half a change: the other
 * half is an import and a registry entry there, pinned by its `fixtures.test.ts`.
 */
export const RECORDED_CASE_NAMES = ["representative", "boundary-empty", "boundary-full"] as const;

/** The name of one recorded case. */
export type RecordedCaseName = (typeof RECORDED_CASE_NAMES)[number];

/**
 * One recorded payload with the provenance needed to reproduce it.
 *
 * Mirrors the fields `VendorFixture` in `packages/adapters/src/testing/fixtures.ts`
 * carries, minus the ones that package derives for itself.
 */
export interface RecordedFixture {
  /** Vendor whose dialect this payload is written in. */
  readonly vendor: VendorId;
  /** File stem under `__fixtures__/`; unique within a vendor. */
  readonly name: RecordedCaseName;
  /** The simulated robot the payload came from. */
  readonly robotId: string;
  /** The payload exactly as the simulator would put it on the wire. */
  readonly payload: VendorPayload;
}

/**
 * The first robot of each vendor in the recorded fleet.
 *
 * `createFleet` allocates vendors round-robin by index, so this is `R-001`,
 * `R-002`, `R-003` — but it is derived rather than hard-coded, so a change to
 * the allocation rule surfaces as a fixture diff instead of a silent mismatch
 * between these files and the robot ids `FIXTURE_RECORDING` claims.
 */
function firstRobotPerVendor(fleet: readonly SimulatedRobot[]): readonly SimulatedRobot[] {
  const seen = new Set<VendorId>();
  const chosen: SimulatedRobot[] = [];

  for (const robot of fleet) {
    if (!seen.has(robot.identity.vendor)) {
      seen.add(robot.identity.vendor);
      chosen.push(robot);
    }
  }
  return chosen;
}

/**
 * Builds the complete recorded fixture set, in supported-vendor order.
 *
 * Pure and total: no clock, no ambient randomness, no I/O. Two calls in the same
 * process, or in two processes a year apart, produce equal values —
 * `fixtureSet.test.ts` asserts exactly that, because the CI guard is worthless
 * without it.
 *
 * The robots are serialized in their **initial** state, straight from
 * `createFleet` with no evolution ticks, which is why every recorded `seq` is 0.
 * That keeps the recording a function of the seed alone: evolution would make
 * the payload depend on a tick count as well, and a fixture set is easier to
 * reason about when one number reproduces it.
 *
 * Malformed payloads are still not here and never will be: this simulator only
 * emits well-formed output, so adapters hand-authors those outside the recorded
 * path — see ADR 13 § Implications and that package's `src/vendors/<v>/__malformed__/`.
 */
export function buildRecordedFixtures(): readonly RecordedFixture[] {
  const fleet = createFleet(RECORDING_FLEET_SIZE, RECORDING_SEED);

  return firstRobotPerVendor(fleet).flatMap((robot) =>
    RECORDED_CASE_NAMES.map((name) => ({
      vendor: robot.identity.vendor,
      name,
      robotId: robot.identity.robotId,
      payload: buildPayload(caseRobot(robot, name), RECORDING_INSTANT_MS),
    })),
  );
}

/**
 * The robot serialized for one recorded case.
 *
 * `representative` is the fleet robot untouched. The two boundary cases keep its
 * identity and replace its state, because the fleet cannot reach either end:
 * `initialState` draws battery from `[0.35, 1)`, so no seed produces a flat or a
 * full robot. Hunting for a lucky seed would give boundary evidence nobody could
 * reproduce or reason about, and it would break the moment the generator moved.
 */
function caseRobot(robot: SimulatedRobot, name: RecordedCaseName): SimulatedRobot {
  if (name === "representative") {
    return robot;
  }
  return { identity: robot.identity, state: boundaryState(robot.identity, name) };
}

/**
 * The two extreme states the boundary fixtures pin.
 *
 * Both are states `evolveRobot` can actually produce, which is what keeps "these
 * bytes are what the producer emits" true. A robot that drains to nothing is
 * `charging` and docked, so its `dock_id` is a string rather than the `null`
 * every representative fixture carries, and its lidar stays faulted from before
 * it docked (`nextStatus`, `healthFor`, `lidarFaulted`). A robot that finishes
 * charging is `idle`, full and undocked. Inventing a state the simulator cannot
 * reach would be a fixture testing the adapter against a dialect nobody speaks.
 *
 * Between them they put battery, water level, heading and both coordinates at
 * each end of their range, and cover the `dock_id` present/absent split that no
 * representative payload exercises. Status `fault` and health `critical` are
 * still unrecorded; those belong to the status-mapping work in adapters § C5,
 * which needs one payload per source value rather than one per extreme.
 */
function boundaryState(
  identity: RobotIdentity,
  name: "boundary-empty" | "boundary-full",
): RobotState {
  const empty = name === "boundary-empty";

  return {
    battery: empty ? 0 : 1,
    x: empty ? -SITE_HALF_EXTENT_M : SITE_HALF_EXTENT_M,
    y: empty ? -SITE_HALF_EXTENT_M : SITE_HALF_EXTENT_M,
    // Heading is `[0, 360)`, so the top of the range is the largest value the
    // two-decimal rounding in each serializer can emit, not 360.
    heading: empty ? 0 : 359.99,
    status: empty ? "charging" : "idle",
    health: empty ? "degraded" : "nominal",
    docked: empty,
    dockId: empty ? dockIdFor(identity) : null,
    lidarRpm: empty ? 0 : 600,
    lidarFaulted: empty,
    waterLevel: empty ? 0 : 1,
    sequence: 0,
  };
}

/**
 * Serializes one fixture to the bytes written on disk.
 *
 * Two-space JSON with a trailing newline. Prettier reformats the file after the
 * recorder writes it — see the root `record:fixtures` script — because every
 * other file in the repository is Prettier-formatted and `pnpm lint` runs
 * `prettier --check .`. Emitting bytes Prettier would rewrite would make the CI
 * diff fail on formatting rather than on dialect drift, which is the one thing
 * the guard must not do.
 */
export function serializeFixture(fixture: RecordedFixture): string {
  return `${JSON.stringify(fixture.payload, null, 2)}\n`;
}
