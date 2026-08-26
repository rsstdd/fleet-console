import type {
  CanonicalEnvelope,
  RegisteredRobotState,
  RobotDiagnosticEnvelope,
} from "@fleet/contracts";
import type { Robot, RobotDetail } from "@/types/robot";

/** Maps decoded contract envelopes onto the console's own read model. */

const toIso = (epochMs: number): string => new Date(epochMs).toISOString();

export function toRobot(envelope: CanonicalEnvelope): Robot {
  return {
    id: envelope.robotId,
    vendor: envelope.vendorId,
    siteId: envelope.siteId,
    observed: true,
    model: envelope.model,
    connectivity: envelope.core.connectivity,
    position: envelope.core.position,
    capabilities: envelope.capabilities,
    status: envelope.core.status,
    health: envelope.core.health,
    freshness: envelope.freshness,
    batteryPercent: envelope.core.batteryPercent,
    lastSeenAt: toIso(envelope.reportedAt),
  };
}

/** On the roster, never heard from: known to exist, nothing observed. */
export function toRegisteredRobot(state: RegisteredRobotState): Robot {
  return {
    id: state.robotId,
    vendor: state.vendorId,
    siteId: state.siteId,
    observed: false,
    model: null,
    connectivity: null,
    position: null,
    capabilities: {},
    status: "unknown",
    health: null,
    freshness: state.freshness,
    batteryPercent: null,
    lastSeenAt: null,
  };
}

export function toRobotDetail(envelope: RobotDiagnosticEnvelope): RobotDetail {
  return {
    ...toRobot(envelope),
    diagnostics: {
      adapterId: envelope.adapterId,
      adapterVersion: envelope.adapterVersion,
      sequence: envelope.capabilities.sequence?.value ?? null,
      sequenceHealth: envelope.sequenceHealth,
      vendorReportedAt: toIso(envelope.reportedAt),
      receivedAt: toIso(envelope.receivedAt),
      clockDeltaMs: envelope.receivedAt - envelope.reportedAt,
      schemaVersion: envelope.schemaVersion,
    },
    rawPayload: envelope.rawPayload,
  };
}

export function toRegisteredRobotDetail(state: RegisteredRobotState): RobotDetail {
  return { ...toRegisteredRobot(state), diagnostics: null, rawPayload: null };
}
