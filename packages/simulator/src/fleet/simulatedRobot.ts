/**
 * The simulator's internal robot state and its evolution.
 *
 * This is deliberately NOT the canonical envelope. Vendor payloads are produced
 * from this state going outward; deriving them from a normalized envelope would
 * make the raw dialects a reverse mapping of normalized data and quietly hollow
 * out the adapter boundary the fixtures exist to prove (TODO § 4, ADR 1).
 *
 * Units here are the simulation's own frame — battery as a fraction, position in
 * metres, heading in degrees. Each vendor serializer converts into its dialect's
 * units, which is where the deliberate disagreements live (`src/vendors`).
 */
import { randomRange, type RandomSource } from "../runtime/random.ts";

/** The vendor dialects this simulator produces. */
export const VENDOR_IDS = ["A", "B", "C"] as const;

/**
 * A vendor dialect identifier.
 *
 * Coupling: the same three literals are declared as `SupportedVendor` /
 * `SUPPORTED_VENDORS` in `packages/adapters/src/core/vendor.ts`. They are
 * restated here rather than imported because a production import from adapters
 * would invert the dependency this package exists to exercise — the simulator
 * must be able to emit a payload the adapters reject.
 *
 * `vendorId.test.ts` in this directory is what keeps the two copies honest, and
 * it fails in both directions: a vendor here that no adapter supports, and a
 * supported vendor nothing produces. That test is the only file in this package
 * permitted to import `@fleet/adapters`, which is a dev dependency banned in
 * production code and probed by `src/__enforcement__/` (ADR 16, closing D7).
 *
 * A fourth vendor is therefore a two-file change made together. Adding it here
 * alone fails the parity test; it would also fail `packages/server` at startup,
 * because `fleetManifestSchema` enumerates `SUPPORTED_VENDORS`.
 */
export type VendorId = (typeof VENDOR_IDS)[number];

/**
 * Simulation-source status vocabulary. Each vendor serializes these differently
 * — A and C as strings, B as numeric codes — which is the point.
 */
export type SimStatus = "idle" | "busy" | "charging" | "fault";

/** Simulation-source health severity, serialized per dialect alongside status. */
export type SimHealth = "nominal" | "degraded" | "critical";

/** Identity and configuration of one simulated robot; fixed for the run. */
export interface RobotIdentity {
  readonly robotId: string;
  readonly siteId: string;
  readonly vendor: VendorId;
  readonly model: string;
}

/** The mutable observed values of one simulated robot at a point in simulated time. */
export interface RobotState {
  /** Battery as a fraction in `[0, 1]`; each dialect converts to its own unit. */
  readonly battery: number;
  /** Position in metres in the simulation frame. */
  readonly x: number;
  readonly y: number;
  /** Heading in degrees in `[0, 360)`. */
  readonly heading: number;
  readonly status: SimStatus;
  readonly health: SimHealth;
  /** True when the robot is on its dock; source data for the `dock` capability. */
  readonly docked: boolean;
  /** Dock identifier when docked; source data for the `dock` capability. */
  readonly dockId: string | null;
  /** Lidar spin rate; source data for the `lidarHealth` capability (vendors A and B). */
  readonly lidarRpm: number;
  /** Lidar fault flag; source data for the `lidarHealth` capability (vendors A and B). */
  readonly lidarFaulted: boolean;
  /** Tank level as a fraction in `[0, 1]`; source data for `waterLevel` (vendor C). */
  readonly waterLevel: number;
  /**
   * Per-robot source sequence. Incremented on every generated reading, but only
   * vendors A and C put it on the wire — vendor B has no sequence field at all
   * and its adapter synthesizes weaker ordering from timestamps (ADR 1).
   */
  readonly sequence: number;
}

/** One simulated robot: fixed identity plus the state that evolves. */
export interface SimulatedRobot {
  readonly identity: RobotIdentity;
  readonly state: RobotState;
}

/** Battery drain per second while executing a task, as a fraction of full charge. */
const BUSY_DRAIN_PER_SECOND = 0.0009;
/** Battery drain per second while idle. */
const IDLE_DRAIN_PER_SECOND = 0.0002;
/** Battery gain per second while docked and charging. */
const CHARGE_GAIN_PER_SECOND = 0.0055;
/** Below this fraction a working robot heads for its dock. */
const BATTERY_SEEK_DOCK = 0.2;
/** Above this fraction a charging robot returns to work. */
const BATTERY_RESUME_WORK = 0.95;
/** Metres per second a busy robot travels. */
const SPEED_M_PER_SECOND = 0.45;
/** Half-width of the square site the robot moves within, in metres. */
const SITE_HALF_EXTENT_M = 40;
/** Nominal lidar spin rate in revolutions per minute. */
const LIDAR_NOMINAL_RPM = 600;

/** Clamps a value into `[min, max]`; every generated number passes through here. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  return value > max ? max : value;
}

/**
 * Reflects a coordinate back inside the site bounds rather than wrapping, so a
 * robot never teleports from one edge to the other between two readings. TODO
 * § 4 requires the boundary rule to be explicit; this is it.
 */
function reflect(value: number, extent: number): number {
  if (value > extent) {
    return extent - (value - extent);
  }
  if (value < -extent) {
    return -extent - (value + extent);
  }
  return value;
}

/**
 * Advances one robot by `elapsedMs` of simulated time.
 *
 * Pure: same input state, elapsed time and random source produce the same output
 * state. The sequence always advances, and battery and position are bounded on
 * every path, so no reading can carry an impossible value (TODO § 4).
 */
export function evolveRobot(
  robot: SimulatedRobot,
  elapsedMs: number,
  random: RandomSource,
): SimulatedRobot {
  const seconds = elapsedMs / 1000;
  const previous = robot.state;

  const charging = previous.status === "charging";
  const drain = previous.status === "busy" ? BUSY_DRAIN_PER_SECOND : IDLE_DRAIN_PER_SECOND;
  const batteryDelta = charging ? CHARGE_GAIN_PER_SECOND * seconds : -drain * seconds;
  const battery = clamp(previous.battery + batteryDelta, 0, 1);

  const status = nextStatus(previous, battery, random);
  const docked = status === "charging";

  const moving = status === "busy";
  const heading = moving
    ? (previous.heading + randomRange(random, -12, 12) + 360) % 360
    : previous.heading;
  const distance = moving ? SPEED_M_PER_SECOND * seconds : 0;
  const radians = (heading * Math.PI) / 180;
  const x = reflect(previous.x + Math.cos(radians) * distance, SITE_HALF_EXTENT_M);
  const y = reflect(previous.y + Math.sin(radians) * distance, SITE_HALF_EXTENT_M);

  const lidarFaulted = status === "fault" ? true : previous.lidarFaulted && random.next() > 0.3;
  const waterLevel = clamp(
    moving ? previous.waterLevel - 0.0006 * seconds : previous.waterLevel,
    0,
    1,
  );

  return {
    identity: robot.identity,
    state: {
      battery,
      x,
      y,
      heading,
      status,
      health: healthFor(status, battery, lidarFaulted),
      docked,
      dockId: docked ? dockIdFor(robot.identity) : null,
      lidarRpm: lidarFaulted ? 0 : LIDAR_NOMINAL_RPM,
      lidarFaulted,
      waterLevel,
      sequence: previous.sequence + 1,
    },
  };
}

/**
 * The status transition rule. Battery drives the dock/undock cycle; faults are
 * rare, self-clearing, and never produced for a robot that is charging, so a
 * demo run shows all four states without hand-holding.
 */
function nextStatus(previous: RobotState, battery: number, random: RandomSource): SimStatus {
  if (previous.status === "fault") {
    return random.next() < 0.08 ? "idle" : "fault";
  }
  if (previous.status === "charging") {
    return battery >= BATTERY_RESUME_WORK ? "idle" : "charging";
  }
  if (battery <= BATTERY_SEEK_DOCK) {
    return "charging";
  }
  if (random.next() < 0.004) {
    return "fault";
  }
  if (previous.status === "idle") {
    return random.next() < 0.15 ? "busy" : "idle";
  }
  return random.next() < 0.05 ? "idle" : "busy";
}

/**
 * Health severity derived from the same simulated causes an operator would see:
 * a fault is critical, a stopped lidar or a nearly flat battery is degraded.
 * This is source data — the adapter decides the canonical severity (ADR 1).
 */
function healthFor(status: SimStatus, battery: number, lidarFaulted: boolean): SimHealth {
  if (status === "fault") {
    return "critical";
  }
  if (lidarFaulted || battery < 0.1) {
    return "degraded";
  }
  return "nominal";
}

/** The dock a robot returns to; stable per robot so `dock` payloads do not churn. */
function dockIdFor(identity: RobotIdentity): string {
  return `${identity.siteId}-DOCK-${identity.robotId.slice(-2)}`;
}
