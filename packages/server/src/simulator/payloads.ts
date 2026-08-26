import type { SimHealth, SimStatus, SimulatedRobot, VendorId } from "./robot.ts";

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function vendorA(robot: SimulatedRobot, nowMs: number): unknown {
  const { identity, state } = robot;
  return {
    robot_id: identity.robotId,
    site: identity.siteId,
    model: identity.model,
    seq: state.sequence,
    timestamp: new Date(nowMs).toISOString(),
    telemetry: {
      battery: { level: round(state.battery, 4) },
      pose: {
        x_m: round(state.x, 3),
        y_m: round(state.y, 3),
        heading_deg: round(state.heading, 2),
      },
      state: state.status,
      health: { level: state.health },
      dock: { docked: state.docked, dock_id: state.dockId },
      lidar: { rpm: state.lidarRpm, fault: state.lidarFaulted },
    },
  };
}

const STATUS_CODE: Record<SimStatus, number> = { idle: 0, busy: 1, charging: 2, fault: 3 };
const HEALTH_CODE: Record<SimHealth, number> = { nominal: 0, degraded: 1, critical: 2 };

function vendorB(robot: SimulatedRobot, nowMs: number): unknown {
  const { identity, state } = robot;
  return {
    id: identity.robotId,
    site: identity.siteId,
    model: identity.model,
    ts: nowMs,
    batt_pct: Math.round(state.battery * 100),
    x_cm: Math.round(state.x * 100),
    y_cm: Math.round(state.y * 100),
    heading_cdeg: Math.round(state.heading * 100),
    status_code: STATUS_CODE[state.status],
    health_code: HEALTH_CODE[state.health],
    dock_state: state.docked ? 1 : 0,
  };
}

/** `firmware_channel` is deliberate: an accepted field with no canonical counterpart. */
function vendorC(robot: SimulatedRobot, nowMs: number): unknown {
  const { identity, state } = robot;
  return {
    robot_id: identity.robotId,
    site: identity.siteId,
    model: identity.model,
    seq: state.sequence,
    timestamp: new Date(nowMs).toISOString(),
    telemetry: {
      battery: { level: round(state.battery, 4) },
      pose: {
        x_m: round(state.x, 3),
        y_m: round(state.y, 3),
        heading_deg: round(state.heading, 2),
      },
      state: state.status,
      health: { level: state.health },
      dock: { docked: state.docked, dock_id: state.dockId },
      water: { level_pct: Math.round(state.waterLevel * 100) },
      firmware_channel: "stable",
    },
  };
}

const BUILDERS: Record<VendorId, (robot: SimulatedRobot, nowMs: number) => unknown> = {
  A: vendorA,
  B: vendorB,
  C: vendorC,
};

export function buildPayload(robot: SimulatedRobot, nowMs: number): unknown {
  return BUILDERS[robot.identity.vendor](robot, nowMs);
}
