import {
  type CanonicalEnvelopeWire,
  encodeCanonicalEnvelope,
  type FleetSite,
  type FleetSnapshot,
  type HealthResponse,
  type RegisteredRobotState,
  SCHEMA_VERSION,
  type SequenceHealth,
  type UnknownFieldTally,
} from "@fleet/contracts";
import { SUPPORTED_VENDORS, type SupportedVendor } from "../adapters/result.ts";
import { type CurrentRobotState, isObserved } from "../store.ts";

export type FleetSnapshotWire = Omit<FleetSnapshot, "robots" | "sites"> & {
  readonly sites: readonly FleetSite[];
  readonly robots: readonly (CanonicalEnvelopeWire | RegisteredRobotState)[];
};

function toRegistered(
  state: Exclude<CurrentRobotState, CanonicalEnvelopeWire>,
): RegisteredRobotState {
  return {
    schemaVersion: state.schemaVersion,
    robotId: state.robotId,
    siteId: state.siteId,
    vendorId: state.vendorId,
    freshness: "unknown",
  };
}

export function encodeFleetSnapshot(options: {
  readonly sites: readonly FleetSite[];
  readonly robots: readonly CurrentRobotState[];
  readonly capturedAt: number;
  readonly serverSessionId: string;
  readonly flushSequence: number;
}): FleetSnapshotWire {
  return {
    schemaVersion: SCHEMA_VERSION,
    serverSessionId: options.serverSessionId,
    flushSequence: options.flushSequence,
    capturedAt: options.capturedAt,
    sites: options.sites,
    robots: options.robots.map((state) =>
      isObserved(state) ? encodeCanonicalEnvelope(state) : toRegistered(state),
    ),
  };
}

export type RobotDetailWire =
  | (CanonicalEnvelopeWire & {
      readonly sequenceHealth: SequenceHealth;
      readonly rawPayload: Readonly<Record<string, unknown>> | null;
    })
  | RegisteredRobotState;

export function encodeRobotDetail(input: {
  readonly state: CurrentRobotState;
  readonly rawPayload: Readonly<Record<string, unknown>> | null;
  readonly sequenceHealth: SequenceHealth | null;
}): RobotDetailWire {
  if (!isObserved(input.state)) {
    return toRegistered(input.state);
  }
  return {
    ...encodeCanonicalEnvelope(input.state),
    sequenceHealth: input.sequenceHealth ?? { evaluated: false },
    rawPayload: input.rawPayload,
  };
}

export interface HealthCounters {
  readonly malformedIngest: number;
  readonly unsupportedVendors: number;
  readonly adapterFailures: Readonly<Record<string, number>>;
  readonly lateFreshnessTicks: { readonly count: number; readonly lastLatenessMs: number | null };
}

export function encodeHealthResponse(input: {
  readonly counters: HealthCounters;
  readonly unknownFields: Readonly<Record<SupportedVendor, UnknownFieldTally>>;
  readonly sequenceByVendor: Readonly<Record<string, SequenceHealth>>;
  readonly capturedAt: number;
}): HealthResponse {
  const byAdapter: HealthResponse["byAdapter"] = {};
  for (const vendor of SUPPORTED_VENDORS) {
    byAdapter[vendor] = {
      failures: input.counters.adapterFailures[vendor] ?? 0,
      unknownFields: input.unknownFields[vendor],
      sequence: input.sequenceByVendor[vendor] ?? { evaluated: false },
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: input.capturedAt,
    malformedIngest: input.counters.malformedIngest,
    unsupportedVendors: input.counters.unsupportedVendors,
    byAdapter,
    lateFreshnessTicks: input.counters.lateFreshnessTicks,
  };
}
