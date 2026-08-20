import type {
  CanonicalEnvelope,
  RegisteredRobotState,
  RobotDiagnosticEnvelope,
} from "@fleet/contracts";

import type { Robot, RobotDetail } from "./model";

/**
 * The one place the canonical envelope becomes the console's read model.
 *
 * Two shapes, deliberately not one: the wire carries epoch milliseconds and a
 * capability record, the console renders ISO strings and a fleet row. Mapping
 * in a single tested module means no component ever reaches into an envelope,
 * and a contract change breaks one file rather than every surface (Principle 1,
 * ADR 4).
 *
 * Nothing here derives freshness. `freshness` is copied from the field the
 * server's sweep set (ADR 3); if this file ever computes it, the console has a
 * second authority that can disagree with the first.
 *
 * Decoding happens before this module, not in it: the transport calls
 * `parseCanonicalEnvelope` / `parseRobotDiagnosticEnvelope` from
 * `@fleet/contracts` and passes the decoded value here (Principle 2).
 */

/**
 * Counters the technician view shows that no telemetry envelope carries.
 *
 * Genuinely per-adapter and genuinely fleet-wide: the unknown-field ledger counts
 * per adapter and has no per-robot precision to offer (ADR 15), so this arrives
 * from the health response rather than off the robot.
 *
 * **`sequenceGaps` used to live here and no longer does** (ADR 25). Sequence
 * continuity is a per-robot fact — each robot has its own counter — so it moved
 * onto `robotDiagnosticEnvelopeSchema`, where `sequenceHealth` states it in the
 * one representation the server and the wire also use. Injecting it here forced
 * this package to invent `number | null`, a second spelling of a distinction the
 * server already typed. Separating the two counters by their true scope is the
 * whole of that decision; do not add a per-robot field back to this interface.
 */
export interface AdapterHealthCounters {
  /** Null when the health response could not be read; never zero as a stand-in. */
  readonly unknownFieldCount: number | null;
}

/** Epoch milliseconds to the ISO string the console formats and displays. */
function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * Maps one canonical envelope onto a fleet row.
 *
 * `vendorId` is copied verbatim. The contract makes it an open identifier so a
 * fourth vendor is an adapter change and never a contracts change (ADR 1), and
 * narrowing it here would put that coupling back.
 */
export function toRobot(envelope: CanonicalEnvelope): Robot {
  return {
    id: envelope.robotId,
    vendor: envelope.vendorId,
    siteId: envelope.siteId,
    status: envelope.core.status,
    health: envelope.core.health,
    freshness: envelope.freshness,
    batteryPercent: envelope.core.batteryPercent,
    // `reportedAt` is what "last seen" means to an operator. The sweep reads
    // `receivedAt` instead, server-side, and this value is not an input to any
    // client derivation (ADR 3).
    lastSeenAt: toIso(envelope.reportedAt),
  };
}

/**
 * Maps a registered robot that has never reported onto a fleet row.
 *
 * Every telemetry-derived field is absent rather than defaulted, `health`
 * included: a robot nobody has heard from is not in nominal health, it is a
 * robot whose health is unknown, and the canonical severity vocabulary has no
 * word for that. Null says so; `nominal` would be a fabricated reassurance
 * (Principle 4). Freshness is the contract's fixed `unknown` (ADR 3).
 */
export function toRegisteredRobot(state: RegisteredRobotState): Robot {
  return {
    id: state.robotId,
    vendor: state.vendorId,
    siteId: state.siteId,
    status: "unknown",
    health: null,
    freshness: state.freshness,
    batteryPercent: null,
    lastSeenAt: null,
  };
}

/**
 * Maps the single-robot diagnostic response onto the detail read model.
 *
 * The sequence number comes from the declared `sequence` capability rather than
 * a core field, because Vendor B sends none (ADR 1); its absence is the
 * declaration's absence, not a zero.
 */
export function toRobotDetail(
  envelope: RobotDiagnosticEnvelope,
  counters: AdapterHealthCounters,
): RobotDetail {
  return {
    ...toRobot(envelope),
    model: envelope.model,
    connectivity: envelope.core.connectivity,
    position: envelope.core.position,
    capabilities: envelope.capabilities,
    diagnostics: {
      adapterId: envelope.adapterId,
      adapterVersion: envelope.adapterVersion,
      sequence: envelope.capabilities.sequence?.value ?? null,
      sequenceHealth: envelope.sequenceHealth,
      vendorReportedAt: toIso(envelope.reportedAt),
      receivedAt: toIso(envelope.receivedAt),
      // The contract puts no ordering invariant on the two clocks, so this is
      // signed: a skewed vendor clock is exactly what the technician readout
      // exists to surface.
      clockDeltaMs: envelope.receivedAt - envelope.reportedAt,
      schemaVersion: envelope.schemaVersion,
      unknownFieldCount: counters.unknownFieldCount,
    },
    rawPayload: envelope.rawPayload,
  };
}

/**
 * Maps a registered-but-never-seen robot onto the detail read model.
 *
 * Everything telemetry would supply is absent rather than zeroed: no model, no
 * connectivity, no position, no declared capabilities, no diagnostics, no
 * retained payload. That is what "panels show registration data only" means
 * (robot detail spec §10) — the page states the absence instead of drawing a
 * row of em dashes that would imply the robot reported and said nothing.
 */
export function toRegisteredRobotDetail(state: RegisteredRobotState): RobotDetail {
  return {
    ...toRegisteredRobot(state),
    model: null,
    connectivity: null,
    position: null,
    capabilities: {},
    diagnostics: null,
    rawPayload: null,
  };
}
