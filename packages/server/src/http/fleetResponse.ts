import {
  type CanonicalEnvelopeWire,
  type FleetSnapshot,
  type RegisteredRobotState,
  SCHEMA_VERSION,
  encodeCanonicalEnvelope,
} from "@fleet/contracts";

import type { CurrentRobotState } from "../state/currentStateStore.ts";

/**
 * The `GET /api/fleet` body: server state translated into the contract-owned snapshot.
 *
 * A translation, not a serialization. `CurrentRobotState` is a **superset** of what the
 * contract permits on the wire in two ways, and both would pass `JSON.stringify` while
 * failing the console's own `parseFleetSnapshot`:
 *
 * - an observed robot holds capabilities as the runtime record, and the wire form is the
 *   array `encodeCanonicalEnvelope` produces;
 * - an unobserved robot carries `model`, which the server seeds from the manifest and
 *   `registeredRobotStateSchema` — a strict object — does not accept.
 *
 * The second is the one worth naming: `model` is real server state that no fleet row uses
 * (`docs/01_page-specs/02_FLEET.md` § 6), so it is dropped here by an explicit field list
 * rather than by a rest-spread, which would silently start carrying the next field someone
 * adds to the manifest.
 */

/** The snapshot as it is serialized: robots in their wire forms. */
export type FleetSnapshotWire = Omit<FleetSnapshot, "robots"> & {
  readonly robots: readonly (CanonicalEnvelopeWire | RegisteredRobotState)[];
};

/** What a snapshot needs beyond the robots themselves. */
export interface FleetSnapshotOptions {
  readonly robots: readonly CurrentRobotState[];
  /** Read from the injected `Clock` by the caller; this module never reads one. */
  readonly capturedAt: number;
  /**
   * The flush this snapshot reflects.
   *
   * Zero from a server that has never flushed, which is every server today — the counter
   * arrives with fan-out (**H3a**). A client discards buffered deltas at or below it, so
   * zero discards nothing, which is the correct behaviour for a cold snapshot.
   */
  readonly flushSequence: number;
}

/** Builds the snapshot body for the current fleet. */
export function encodeFleetSnapshot(options: FleetSnapshotOptions): FleetSnapshotWire {
  return {
    schemaVersion: SCHEMA_VERSION,
    flushSequence: options.flushSequence,
    capturedAt: options.capturedAt,
    robots: options.robots.map(toWireRobot),
  };
}

/** Narrows one robot to the wire form its population requires. */
function toWireRobot(state: CurrentRobotState): CanonicalEnvelopeWire | RegisteredRobotState {
  // `receivedAt` is present only once telemetry has been observed, which is the same
  // discriminator `CurrentStateStore` uses internally.
  if ("receivedAt" in state) {
    return encodeCanonicalEnvelope(state);
  }
  return {
    schemaVersion: state.schemaVersion,
    robotId: state.robotId,
    siteId: state.siteId,
    vendorId: state.vendorId,
    freshness: state.freshness,
  };
}
