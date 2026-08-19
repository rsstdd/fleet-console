/**
 * Vendor C wire dialect: broadly A-shaped — nested payload, fractional battery,
 * metres, ISO-8601 timestamp, real sequence — but carrying tank level where A
 * carries lidar health, and carrying one field no adapter documents.
 *
 * Two absences are deliberate and must not be "tidied up":
 *
 * - There is no lidar block at all. Not `null`, not `{}`, not a disabled
 *   placeholder — the key is absent, so the adapter declares no `lidarHealth`
 *   capability and the console renders no lidar panel (ADR 1, TODO § 8).
 * - `telemetry.firmware_channel` is the intentional undocumented field. It is
 *   nested rather than top-level so the adapter's unknown-field walk has to
 *   produce the dotted path `telemetry.firmware_channel` and cannot pass by
 *   comparing top-level keys only (adapters TODO B4).
 *
 * Coupling: producer side of `packages/adapters/src/vendors/c/schema.ts`
 * (adapters TODO B3/C4). Its adapter declares `dock`, `waterLevel` and
 * `sequence`, declares no `lidarHealth`, and notes the undocumented field to the
 * per-adapter ledger in `packages/adapters/src/core/unknownFields.ts`.
 *
 * The fixture half of that is mechanical: this function is recorded into
 * `packages/adapters/src/vendors/c/__fixtures__/representative.json` by
 * `src/recording/`, and CI re-records and diffs. Edit this file without running
 * `pnpm record:fixtures` and the build fails (ADR 13).
 */
import type { SimulatedRobot } from "../fleet/simulatedRobot.ts";

/**
 * The undocumented field's value. Stable rather than random: the counter under
 * test counts occurrences of an unrecognized key, and a value that changed every
 * reading would make a fixture unreproducible for no gain.
 */
const UNDOCUMENTED_FIRMWARE_CHANNEL = "stable";

/** One vendor C telemetry reading as it appears on the wire. */
export interface VendorCPayload {
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
    readonly water: { readonly level_pct: number };
    /** Undocumented by design; see the module comment. */
    readonly firmware_channel: string;
  };
}

/** Rounds to `places` decimals so a payload is stable and readable rather than carrying float noise. */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** Serializes a simulated robot into vendor C's dialect at the given wall-clock instant. */
export function buildVendorCPayload(robot: SimulatedRobot, nowMs: number): VendorCPayload {
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
      firmware_channel: UNDOCUMENTED_FIRMWARE_CHANNEL,
    },
  };
}
