/**
 * Vendor A wire dialect: nested payload, battery as a `0..1` fraction, position
 * in metres, ISO-8601 timestamp, string status vocabulary, and a real source
 * sequence.
 *
 * Coupling: this is the producer side of the schema planned as
 * `packages/adapters/src/vendors/a/schema.ts` (adapters TODO B1/C2). The adapter
 * declares `dock`, `lidarHealth` and `sequence` from the fields below. Changing
 * a field name or unit here requires changing that schema, its fixtures and its
 * exact-output contract test in the same commit (Principle 14, ADR 1).
 *
 * The fixture half of that is mechanical: this function is recorded into
 * `packages/adapters/src/vendors/a/__fixtures__/representative.json` by
 * `src/recording/`, and CI re-records and diffs. Edit this file without running
 * `pnpm record:fixtures` and the build fails (ADR 13).
 *
 * Deliberately not shared with vendor C despite the shapes being close: the
 * near-miss between A and C is what makes an accidental shared abstraction
 * dangerous, so each dialect owns its own serializer (AGENTS.md § Vendor dialects).
 */
import type { SimulatedRobot } from "../fleet/simulatedRobot.ts";

/** One vendor A telemetry reading as it appears on the wire. */
export interface VendorAPayload {
  readonly robot_id: string;
  readonly site: string;
  readonly model: string;
  readonly seq: number;
  readonly timestamp: string;
  readonly telemetry: {
    readonly battery: { readonly level: number };
    readonly pose: { readonly x_m: number; readonly y_m: number; readonly heading_deg: number };
    readonly state: "idle" | "busy" | "charging" | "fault";
    readonly health: { readonly level: "nominal" | "degraded" | "critical" };
    readonly dock: { readonly docked: boolean; readonly dock_id: string | null };
    readonly lidar: { readonly rpm: number; readonly fault: boolean };
  };
}

/** Rounds to `places` decimals so a payload is stable and readable rather than carrying float noise. */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Serializes a simulated robot into vendor A's dialect at the given wall-clock instant. */
export function buildVendorAPayload(robot: SimulatedRobot, nowMs: number): VendorAPayload {
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
