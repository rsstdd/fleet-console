export const VENDOR_IDS = ["A", "B", "C"] as const;
export type VendorId = (typeof VENDOR_IDS)[number];
export type SimStatus = "idle" | "busy" | "charging" | "fault";
export type SimHealth = "nominal" | "degraded" | "critical";

export const SITES = [
  { siteId: "SITE-NORTH", label: "North site" },
  { siteId: "SITE-SOUTH", label: "South site" },
  { siteId: "SITE-EAST", label: "East site" },
] as const;

const MODELS: Record<VendorId, readonly [string, ...string[]]> = {
  A: ["AX-200", "AX-240"],
  B: ["BR-11", "BR-15"],
  C: ["CV-7", "CV-9"],
};

export const MAX_ROBOTS = 5000;
export const SITE_HALF_EXTENT_M = 40;

export interface RobotIdentity {
  readonly robotId: string;
  readonly siteId: string;
  readonly vendor: VendorId;
  readonly model: string;
}

export interface RobotState {
  readonly battery: number;
  readonly x: number;
  readonly y: number;
  readonly heading: number;
  readonly status: SimStatus;
  readonly health: SimHealth;
  readonly docked: boolean;
  readonly dockId: string | null;
  readonly lidarRpm: number;
  readonly lidarFaulted: boolean;
  readonly waterLevel: number;
  readonly sequence: number;
}

export interface SimulatedRobot {
  readonly identity: RobotIdentity;
  readonly state: RobotState;
}

export interface RandomSource {
  next(): number;
}

export function createRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function deriveSeed(parentSeed: number, label: string): number {
  let hash = 0x811c9dc5 ^ (parentSeed >>> 0);
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function range(random: RandomSource, min: number, max: number): number {
  return min + random.next() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function reflect(value: number, extent: number): number {
  if (value > extent) {
    return extent - (value - extent);
  }
  return value < -extent ? -extent - (value + extent) : value;
}

export function robotIdFor(index: number): string {
  return `R-${String(index + 1).padStart(3, "0")}`;
}

export function dockIdFor(identity: RobotIdentity): string {
  return `${identity.siteId}-DOCK-${identity.robotId.slice(-2)}`;
}

export function createFleet(count: number, seed: number): readonly SimulatedRobot[] {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_ROBOTS) {
    throw new RangeError(
      `robots must be a whole number between 1 and ${String(MAX_ROBOTS)}; received ${String(count)}.`,
    );
  }
  return Array.from({ length: count }, (_unused, index) => {
    const robotId = robotIdFor(index);
    const vendor = VENDOR_IDS[index % VENDOR_IDS.length] ?? "A";
    const site = SITES[Math.floor(index / VENDOR_IDS.length) % SITES.length] ?? SITES[0];
    const models = MODELS[vendor];
    const modelRandom = createRandomSource(deriveSeed(seed, `model:${robotId}`));
    const model = models[Math.floor(modelRandom.next() * models.length)] ?? models[0];

    const random = createRandomSource(deriveSeed(seed, `state:${robotId}`));
    return {
      identity: { robotId, siteId: site.siteId, vendor, model },
      state: {
        battery: range(random, 0.35, 1),
        x: range(random, -30, 30),
        y: range(random, -30, 30),
        heading: range(random, 0, 360),
        status: random.next() < 0.25 ? "idle" : "busy",
        health: "nominal",
        docked: false,
        dockId: null,
        lidarRpm: 600,
        lidarFaulted: false,
        waterLevel: range(random, 0.4, 1),
        sequence: 0,
      },
    };
  });
}

const BUSY_DRAIN_PER_SECOND = 0.0009;
const IDLE_DRAIN_PER_SECOND = 0.0002;
const CHARGE_GAIN_PER_SECOND = 0.0055;
const BATTERY_SEEK_DOCK = 0.2;
const BATTERY_RESUME_WORK = 0.95;
const SPEED_M_PER_SECOND = 0.45;
const LIDAR_NOMINAL_RPM = 600;

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

function healthFor(status: SimStatus, battery: number, lidarFaulted: boolean): SimHealth {
  if (status === "fault") {
    return "critical";
  }
  return lidarFaulted || battery < 0.1 ? "degraded" : "nominal";
}

export function evolveRobot(
  robot: SimulatedRobot,
  elapsedMs: number,
  random: RandomSource,
): SimulatedRobot {
  const seconds = elapsedMs / 1000;
  const previous = robot.state;
  const drain = previous.status === "busy" ? BUSY_DRAIN_PER_SECOND : IDLE_DRAIN_PER_SECOND;
  const batteryDelta =
    previous.status === "charging" ? CHARGE_GAIN_PER_SECOND * seconds : -drain * seconds;
  const battery = clamp(previous.battery + batteryDelta, 0, 1);
  const status = nextStatus(previous, battery, random);
  const docked = status === "charging";
  const moving = status === "busy";
  const heading = moving
    ? (previous.heading + range(random, -12, 12) + 360) % 360
    : previous.heading;
  const distance = moving ? SPEED_M_PER_SECOND * seconds : 0;
  const radians = (heading * Math.PI) / 180;
  const lidarFaulted = status === "fault" ? true : previous.lidarFaulted && random.next() > 0.3;

  return {
    identity: robot.identity,
    state: {
      battery,
      x: reflect(previous.x + Math.cos(radians) * distance, SITE_HALF_EXTENT_M),
      y: reflect(previous.y + Math.sin(radians) * distance, SITE_HALF_EXTENT_M),
      heading,
      status,
      health: healthFor(status, battery, lidarFaulted),
      docked,
      dockId: docked ? dockIdFor(robot.identity) : null,
      lidarRpm: lidarFaulted ? 0 : LIDAR_NOMINAL_RPM,
      lidarFaulted,
      waterLevel: clamp(
        moving ? previous.waterLevel - 0.0006 * seconds : previous.waterLevel,
        0,
        1,
      ),
      sequence: previous.sequence + 1,
    },
  };
}
