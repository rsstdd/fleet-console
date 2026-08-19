/**
 * Deterministic fleet construction: the same count and seed always produce the
 * same robots, in the same order, with the same initial state (TODO § 10).
 */
import { createRandomSource, deriveSeed, randomInt, randomRange } from "../runtime/random.ts";
import {
  VENDOR_IDS,
  type RobotIdentity,
  type SimStatus,
  type SimulatedRobot,
  type VendorId,
} from "./simulatedRobot.ts";

/**
 * Sites robots are allocated across. Fixed rather than configurable: site
 * grouping is a console feature exercised by having more than one site, and a
 * tunable list would be one more thing for a demo to get wrong.
 */
export const SITE_IDS = ["SITE-NORTH", "SITE-SOUTH", "SITE-EAST"] as const;

/** Model names per vendor; cosmetic, but stable so fixtures do not churn. */
const MODELS: Record<VendorId, readonly string[]> = {
  A: ["AX-200", "AX-240"],
  B: ["BR-11", "BR-15"],
  C: ["CV-7", "CV-9"],
};

/** Largest fleet this simulator will build; above this a single Node process is the bottleneck. */
export const MAX_ROBOTS = 5000;

/** Raised when a requested fleet cannot be built; carries an operator-readable reason. */
export class FleetConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FleetConfigurationError";
  }
}

/**
 * Formats a robot identifier.
 *
 * Ids are one-based and zero-padded to three digits, so the default 50-robot fleet
 * runs `R-001` through `R-050`. Past 999 the id widens rather than truncating
 * (`R-1000`), which matters because `MAX_ROBOTS` is 5000.
 *
 * Coupling: the `R-###` shape is what the documented `--drop R-007,R-023,R-041`
 * example uses — root `README.md` § 3, this package's `README.md`, and the `--drop`
 * help text in `cli/parseArgs.ts` — and what `packages/server`'s fleet manifest is
 * expected to carry (server TODO § E1). Changing the format breaks both.
 *
 * Those three ids are chosen to exist in the default fleet, because `--drop`
 * validates its targets against the built fleet and rejects unknown ones
 * (`faults/faultPolicy.ts`). Do not cite `R-204`/`R-087`/`R-301` here: that is the
 * fixture roster used by the web fixtures, wireframes and component gallery, and
 * those ids are outside a 50-robot fleet, so a `--drop` example naming them would
 * fail at startup.
 */
export function robotIdFor(index: number): string {
  return `R-${String(index + 1).padStart(3, "0")}`;
}

/**
 * Allocates vendors round-robin so all three appear as soon as the count allows,
 * and the mix stays even to within one robot for any count. Round-robin rather
 * than random assignment because the vendor mix is evidence in a demo, not
 * flavour: at `--robots 3` you want exactly one of each, not a coin toss.
 */
function vendorFor(index: number): VendorId {
  const vendor = VENDOR_IDS[index % VENDOR_IDS.length];
  if (vendor === undefined) {
    throw new FleetConfigurationError("Vendor allocation produced no vendor.");
  }
  return vendor;
}

/** Allocates sites round-robin over a different modulus than vendors, so the two do not correlate. */
function siteFor(index: number): string {
  const site = SITE_IDS[Math.floor(index / VENDOR_IDS.length) % SITE_IDS.length];
  if (site === undefined) {
    throw new FleetConfigurationError("Site allocation produced no site.");
  }
  return site;
}

/** Picks a model from the vendor's list using that robot's own seeded stream. */
function modelFor(vendor: VendorId, robotId: string, seed: number): string {
  const candidates = MODELS[vendor];
  const random = createRandomSource(deriveSeed(seed, `model:${robotId}`));
  const model = candidates[randomInt(random, candidates.length)];
  if (model === undefined) {
    throw new FleetConfigurationError(`Vendor ${vendor} has no models configured.`);
  }
  return model;
}

/**
 * Builds one robot's starting state from its own derived stream, so a robot's
 * initial values depend on its identity and the run seed but not on how many
 * robots precede it. Adding a robot therefore does not perturb the others.
 */
function initialState(identity: RobotIdentity, seed: number): SimulatedRobot {
  const random = createRandomSource(deriveSeed(seed, `state:${identity.robotId}`));
  const battery = randomRange(random, 0.35, 1);
  const status: SimStatus = random.next() < 0.25 ? "idle" : "busy";

  return {
    identity,
    state: {
      battery,
      x: randomRange(random, -30, 30),
      y: randomRange(random, -30, 30),
      heading: randomRange(random, 0, 360),
      status,
      health: "nominal",
      docked: false,
      dockId: null,
      lidarRpm: 600,
      lidarFaulted: false,
      waterLevel: randomRange(random, 0.4, 1),
      sequence: 0,
    },
  };
}

/**
 * Creates exactly `count` unique robots with stable identity and initial state.
 *
 * Throws `FleetConfigurationError` for a count outside `[1, MAX_ROBOTS]` so an
 * impossible workload fails at startup rather than producing an empty run that
 * looks like a broken server.
 */
export function createFleet(count: number, seed: number): readonly SimulatedRobot[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_ROBOTS) {
    throw new FleetConfigurationError(
      `robots must be a whole number between 1 and ${String(MAX_ROBOTS)}; received ${String(count)}.`,
    );
  }

  const robots: SimulatedRobot[] = [];
  for (let index = 0; index < count; index += 1) {
    const robotId = robotIdFor(index);
    const vendor = vendorFor(index);
    robots.push(
      initialState(
        { robotId, siteId: siteFor(index), vendor, model: modelFor(vendor, robotId, seed) },
        seed,
      ),
    );
  }
  return robots;
}

/**
 * The roster the server needs in order to show a never-reported robot as UNKNOWN
 * rather than as absent (ADR 3, server TODO § E1). Printed by `--print-manifest`
 * so roster ownership is an explicit handoff rather than something the server
 * infers from whichever robot happens to report first.
 *
 * The field is `vendorId`, not `vendor`, because the server's
 * `fleetManifestSchema` is a strict object and its spelling is canonical
 * (ADR 14). This type mirrors that schema deliberately: the printed roster must
 * be valid server input, and `packages/simulator` must not import
 * `packages/server` to find that out. `manifestParity.test.ts` is what keeps
 * the mirror honest.
 */
export interface FleetManifestEntry {
  readonly robotId: string;
  readonly siteId: string;
  readonly vendorId: VendorId;
  readonly model: string;
}

/** Projects a built fleet to its manifest form, dropping all evolving state. */
export function toFleetManifest(robots: readonly SimulatedRobot[]): readonly FleetManifestEntry[] {
  return robots.map(({ identity }) => ({
    robotId: identity.robotId,
    siteId: identity.siteId,
    vendorId: identity.vendor,
    model: identity.model,
  }));
}
