/**
 * Vendor B wire dialect: flat payload, battery as an integer percentage,
 * position in centimetres, epoch-millisecond timestamp, numeric status codes,
 * and — the point of vendor B — no sequence field at all.
 *
 * Coupling: producer side of `packages/adapters/src/vendors/b/schema.ts`
 * (adapters TODO B2/C3). Its adapter declares `dock` from `dock_state` and
 * synthesizes weaker ordering from `ts`, which cannot separate a duplicate from
 * two events in the same millisecond.
 *
 * The fixture half of that is mechanical: this function is recorded into
 * `packages/adapters/src/vendors/b/__fixtures__/representative.json` by
 * `src/recording/`, and CI re-records and diffs. Edit this file without running
 * `pnpm record:fixtures` and the build fails (ADR 13).
 *
 * Two absences here are deliberate and must not be "helpfully" filled in.
 *
 * **No sequence.** Adding a sequence, a nonce or any other simulator-only
 * uniqueness would hide the exact same-millisecond ambiguity vendor B exists to
 * demonstrate (ADR 1 § Implications).
 *
 * **No lidar source data**, so vendor B declares `dock` and nothing else. Page
 * spec 03 § 3 calls the capability panel grid "the section that differs by
 * vendor", and § 6 excludes `sequence` from that grid because it is transport
 * metadata. If vendor B carried lidar health it would render a Capabilities
 * section identical to vendor A's, and the section that exists to differ by
 * vendor would show two profiles across three vendors instead of three. Leaving
 * it out gives every capability its own declaration pattern — `dock` universal,
 * `lidarHealth` vendor A only, `waterLevel` vendor C only, `sequence` A and C —
 * which is more than one fixture per vendor can otherwise prove (ADR 1
 * § Constraints). Recorded in ADR 1 § Observed consequences, 19 August 2026.
 */
import type { SimHealth, SimStatus, SimulatedRobot } from "../fleet/simulatedRobot.ts";

/**
 * Vendor B's numeric status codes.
 *
 * Coupling: the adapter's inverse of this table is adapters TODO C5, which
 * requires each mapping to be recorded in the adapter's doc comment. Both sides
 * must be changed together.
 */
const STATUS_CODE: Record<SimStatus, number> = {
  idle: 0,
  busy: 1,
  charging: 2,
  fault: 3,
};

/** Vendor B's numeric health codes, mapped by the adapter into canonical severity. */
const HEALTH_CODE: Record<SimHealth, number> = {
  nominal: 0,
  degraded: 1,
  critical: 2,
};

/** One vendor B telemetry reading as it appears on the wire. */
export interface VendorBPayload {
  readonly id: string;
  readonly site: string;
  readonly model: string;
  /** Epoch milliseconds, not an ISO string. */
  readonly ts: number;
  /** Integer percentage in `[0, 100]`, not a fraction. */
  readonly batt_pct: number;
  /** Centimetres, not metres. */
  readonly x_cm: number;
  readonly y_cm: number;
  /** Centidegrees, keeping the whole payload integer-valued. */
  readonly heading_cdeg: number;
  readonly status_code: number;
  readonly health_code: number;
  readonly dock_state: number;
}

/** Serializes a simulated robot into vendor B's dialect at the given wall-clock instant. */
export function buildVendorBPayload(robot: SimulatedRobot, nowMs: number): VendorBPayload {
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
