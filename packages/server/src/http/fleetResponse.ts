import {
  type CanonicalEnvelopeWire,
  type FleetSite,
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
export type FleetSnapshotWire = Omit<FleetSnapshot, "robots" | "sites"> & {
  readonly sites: readonly FleetSite[];
  readonly robots: readonly (CanonicalEnvelopeWire | RegisteredRobotState)[];
};

/** What a snapshot needs beyond the robots themselves. */
export interface FleetSnapshotOptions {
  /**
   * The site directory, straight from the validated manifest (ADR 34). The
   * snapshot is the only response that carries it; envelopes keep carrying
   * bare `siteId` values, so labels exist in exactly one place.
   */
  readonly sites: readonly FleetSite[];
  readonly robots: readonly CurrentRobotState[];
  /** Read from the injected `Clock` by the caller; this module never reads one. */
  readonly capturedAt: number;
  /**
   * This runtime's identity, minted once in `runServer.ts` (ADR 31).
   *
   * Must be the same value `DeltaFanOut` stamps on every frame — the client
   * compares the two, and a snapshot and stream that disagree read as a
   * deployment-integrity failure on the console.
   */
  readonly serverSessionId: string;
  /**
   * The flush this snapshot reflects.
   *
   * Zero from a server that has never flushed. A client discards buffered
   * same-session deltas at or below it, so zero discards nothing, which is the
   * correct behaviour for a cold snapshot.
   */
  readonly flushSequence: number;
}

/** Builds the snapshot body for the current fleet. */
export function encodeFleetSnapshot(options: FleetSnapshotOptions): FleetSnapshotWire {
  return {
    schemaVersion: SCHEMA_VERSION,
    serverSessionId: options.serverSessionId,
    flushSequence: options.flushSequence,
    capturedAt: options.capturedAt,
    sites: options.sites,
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
