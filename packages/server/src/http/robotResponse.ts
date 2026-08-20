import {
  type CanonicalEnvelopeWire,
  type RegisteredRobotState,
  type RobotDiagnosticEnvelope,
  type SequenceHealth,
  encodeCanonicalEnvelope,
} from "@fleet/contracts";

import type { CurrentRobotState } from "../state/currentStateStore.ts";

/**
 * The `GET /api/robots/:id` body: one robot, with the evidence a technician needs.
 *
 * This is the **only** place a raw vendor payload is served (ADR 1). It is excluded from
 * the fleet read model, from history and from every delta, and the types are what enforce
 * that rather than a rule each response has to remember.
 *
 * Two populations, as on the fleet snapshot: a robot that has reported, and one the
 * manifest registered that has never been heard from. The robot-detail page requires both
 * — `docs/01_page-specs/03_ROBOT_DETAIL.md` § states that a known-but-unseen robot renders
 * "registration data only" rather than an error — so a 404 for the second would contradict
 * the page that consumes this.
 */

/** One robot as it is serialized here: observed with diagnostics, or merely registered. */
export type RobotDetailWire =
  | (CanonicalEnvelopeWire &
      Pick<RobotDiagnosticEnvelope, "sequenceHealth"> & {
        readonly rawPayload: Readonly<Record<string, unknown>> | null;
      })
  | RegisteredRobotState;

/** What one robot's response needs from the store. */
export interface RobotDetailInput {
  readonly state: CurrentRobotState;
  /** Retained verbatim and already copied out of the store (ADR 26). */
  readonly rawPayload: Readonly<Record<string, unknown>> | null;
  /** This robot's continuity; null only for a robot that has never reported. */
  readonly sequenceHealth: SequenceHealth | null;
}

/**
 * Builds one robot's detail body.
 *
 * The unobserved branch projects `model` off for the same reason the fleet snapshot does:
 * `registeredRobotStateSchema` is strict, and the manifest's model is server state that
 * this contract does not carry.
 */
export function encodeRobotDetail(input: RobotDetailInput): RobotDetailWire {
  const { state } = input;
  if (!("receivedAt" in state)) {
    return {
      schemaVersion: state.schemaVersion,
      robotId: state.robotId,
      siteId: state.siteId,
      vendorId: state.vendorId,
      freshness: state.freshness,
    };
  }
  return {
    ...encodeCanonicalEnvelope(state),
    // Non-null by construction here: an observed robot has been through `upsert`, which is
    // the only writer of both. The fallback states the dialect carries no counter, which
    // is the safe reading — never zero gaps, which would be a claim nobody measured.
    sequenceHealth: input.sequenceHealth ?? { evaluated: false },
    rawPayload: input.rawPayload,
  };
}
