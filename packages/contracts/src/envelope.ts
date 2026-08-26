import { z } from "zod";
import {
  capabilitiesWireSchema,
  type CapabilityWireEntry,
  encodeCapabilities,
} from "./capabilities.js";
import {
  batteryPercentSchema,
  connectivitySchema,
  displayNameSchema,
  epochMillisecondsSchema,
  flushSequenceSchema,
  type FreshnessState,
  freshnessStateSchema,
  healthSchema,
  identifierSchema,
  type ParseResult,
  parseWith,
  positionSchema,
  robotStatusSchema,
  schemaVersionSchema,
  sequenceHealthSchema,
  serverSessionIdSchema,
  vendorIdSchema,
  versionStringSchema,
} from "./primitives.js";

export const canonicalCoreSchema = z.strictObject({
  connectivity: connectivitySchema,
  batteryPercent: batteryPercentSchema.nullable(),
  position: positionSchema.nullable(),
  status: robotStatusSchema,
  health: healthSchema,
});
export type CanonicalCore = z.infer<typeof canonicalCoreSchema>;

/** Freshness is server-authored and never supplied by adapters. */
const preFreshnessShape = {
  schemaVersion: schemaVersionSchema,
  robotId: identifierSchema,
  siteId: identifierSchema,
  vendorId: vendorIdSchema,
  model: displayNameSchema,
  adapterId: identifierSchema,
  adapterVersion: versionStringSchema,
  reportedAt: epochMillisecondsSchema,
  receivedAt: epochMillisecondsSchema,
  core: canonicalCoreSchema,
} as const;

const envelopeBaseShape = { ...preFreshnessShape, freshness: freshnessStateSchema } as const;

export const adapterEnvelopeSchema = z.strictObject({
  ...preFreshnessShape,
  capabilities: capabilitiesWireSchema,
});
export type AdapterEnvelope = z.infer<typeof adapterEnvelopeSchema>;

export const canonicalEnvelopeSchema = z.strictObject({
  ...envelopeBaseShape,
  capabilities: capabilitiesWireSchema,
});
export type CanonicalEnvelope = z.infer<typeof canonicalEnvelopeSchema>;

export type CanonicalEnvelopeWire = Omit<CanonicalEnvelope, "capabilities"> & {
  readonly capabilities: readonly CapabilityWireEntry[];
};

export function encodeCanonicalEnvelope(envelope: CanonicalEnvelope): CanonicalEnvelopeWire {
  return { ...envelope, capabilities: encodeCapabilities(envelope.capabilities) };
}

export function withFreshness(
  envelope: AdapterEnvelope | CanonicalEnvelope,
  freshness: FreshnessState,
): CanonicalEnvelope {
  if ("freshness" in envelope && envelope.freshness === freshness) {
    return envelope;
  }
  return { ...envelope, freshness };
}

/** A robot on the roster that has never reported: known to exist, nothing observed. */
export const registeredRobotStateSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  robotId: identifierSchema,
  siteId: identifierSchema,
  vendorId: vendorIdSchema,
  freshness: z.literal("unknown"),
});
export type RegisteredRobotState = z.infer<typeof registeredRobotStateSchema>;

export const robotDiagnosticEnvelopeSchema = z.strictObject({
  ...envelopeBaseShape,
  capabilities: capabilitiesWireSchema,
  sequenceHealth: sequenceHealthSchema,
  rawPayload: z.record(z.string(), z.unknown()).nullable(),
});
export type RobotDiagnosticEnvelope = z.infer<typeof robotDiagnosticEnvelopeSchema>;

export const telemetryBatchSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  serverSessionId: serverSessionIdSchema,
  flushSequence: flushSequenceSchema,
  sentAt: epochMillisecondsSchema,
  robots: z.array(canonicalEnvelopeSchema),
});
export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>;

export const fleetSiteSchema = z.strictObject({
  siteId: identifierSchema,
  label: displayNameSchema,
});
export type FleetSite = z.infer<typeof fleetSiteSchema>;

export const fleetSnapshotRobotSchema = z.union([
  canonicalEnvelopeSchema,
  registeredRobotStateSchema,
]);
export type FleetSnapshotRobot = z.infer<typeof fleetSnapshotRobotSchema>;

export const fleetSnapshotSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    serverSessionId: serverSessionIdSchema,
    flushSequence: flushSequenceSchema,
    capturedAt: epochMillisecondsSchema,
    sites: z.array(fleetSiteSchema),
    robots: z.array(fleetSnapshotRobotSchema),
  })
  .superRefine((snapshot, ctx) => {
    const siteIds = new Set<string>();
    snapshot.sites.forEach((site, index) => {
      if (siteIds.has(site.siteId)) {
        ctx.addIssue({
          code: "custom",
          path: ["sites", index, "siteId"],
          message: `duplicate site id: ${site.siteId}`,
          input: site.siteId,
        });
      }
      siteIds.add(site.siteId);
    });
    snapshot.robots.forEach((robot, index) => {
      if (!siteIds.has(robot.siteId)) {
        ctx.addIssue({
          code: "custom",
          path: ["robots", index, "siteId"],
          message: `robot references undefined site: ${robot.siteId}`,
          input: robot.siteId,
        });
      }
    });
  });
export type FleetSnapshot = z.infer<typeof fleetSnapshotSchema>;

export type DeltaReconciliation = "covered" | "apply" | "session-mismatch";

export interface ReconciliationEpoch {
  readonly serverSessionId: string;
  readonly flushSequence: number;
}

/** A sequence comparison is meaningful only within one server session. */
export function reconcileDeltaWithSnapshot(
  snapshot: ReconciliationEpoch,
  delta: ReconciliationEpoch,
): DeltaReconciliation {
  if (delta.serverSessionId !== snapshot.serverSessionId) {
    return "session-mismatch";
  }
  return delta.flushSequence <= snapshot.flushSequence ? "covered" : "apply";
}

export function parseCanonicalEnvelope(input: unknown): ParseResult<CanonicalEnvelope> {
  return parseWith(canonicalEnvelopeSchema, input);
}
export function parseAdapterEnvelope(input: unknown): ParseResult<AdapterEnvelope> {
  return parseWith(adapterEnvelopeSchema, input);
}
export function parseRegisteredRobotState(input: unknown): ParseResult<RegisteredRobotState> {
  return parseWith(registeredRobotStateSchema, input);
}
export function parseRobotDiagnosticEnvelope(input: unknown): ParseResult<RobotDiagnosticEnvelope> {
  return parseWith(robotDiagnosticEnvelopeSchema, input);
}
export function parseTelemetryBatch(input: unknown): ParseResult<TelemetryBatch> {
  return parseWith(telemetryBatchSchema, input);
}
export function parseFleetSnapshot(input: unknown): ParseResult<FleetSnapshot> {
  return parseWith(fleetSnapshotSchema, input);
}
