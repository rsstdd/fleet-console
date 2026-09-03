/**
 * Public API of `@fleet/contracts`.
 *
 * Everything a consumer needs is re-exported here, so `packages/adapters`,
 * `packages/server`, `packages/simulator` and `packages/web` import from
 * `@fleet/contracts` and never from an internal path. The `exports` map in
 * `package.json` exposes only this entry point, which is what makes the internal
 * file layout free to change (packages/contracts/AGENTS.md, Dependency boundary).
 *
 * Declarative and side-effect free: this module re-exports and does nothing else.
 */

export {
  MAX_EPOCH_MS,
  MAX_POSITION_METRES,
  SCHEMA_VERSION,
  batteryPercentSchema,
  connectivitySchema,
  displayNameSchema,
  epochMillisecondsSchema,
  flushSequenceSchema,
  freshnessStateSchema,
  healthSchema,
  healthSeveritySchema,
  identifierSchema,
  parseWith,
  positionSchema,
  robotStatusSchema,
  schemaVersionSchema,
  sequenceHealthSchema,
  serverSessionIdSchema,
  toContractIssues,
  vendorIdSchema,
  versionStringSchema,
} from "./shared/primitives.js";

export type {
  Connectivity,
  ContractIssue,
  EpochMilliseconds,
  FlushSequence,
  FreshnessState,
  Health,
  HealthSeverity,
  Identifier,
  ParseResult,
  Position,
  RobotStatus,
  SequenceHealth,
  ServerSessionId,
} from "./shared/primitives.js";

export {
  CAPABILITY_KINDS,
  CAPABILITY_NAMES,
  DIAGNOSTIC_CAPABILITY_NAMES,
  OPERATOR_CAPABILITY_NAMES,
  capabilitiesWireSchema,
  capabilityWireEntrySchema,
  dockCapabilitySchema,
  encodeCapabilities,
  isDiagnosticCapability,
  isOperatorCapability,
  lidarHealthCapabilitySchema,
  parseCapabilities,
  sequenceCapabilitySchema,
  waterLevelCapabilitySchema,
} from "./capabilities/capabilitySchemas.js";

export type {
  Capabilities,
  CapabilityKind,
  CapabilityName,
  CapabilityPayloadByName,
  CapabilityWireEntry,
  DiagnosticCapabilityName,
  DockCapability,
  LidarHealthCapability,
  OperatorCapabilityName,
  SequenceCapability,
  WaterLevelCapability,
} from "./capabilities/capabilitySchemas.js";

export {
  adapterEnvelopeSchema,
  canonicalCoreSchema,
  canonicalEnvelopeSchema,
  encodeCanonicalEnvelope,
  fleetSiteSchema,
  fleetSnapshotRobotSchema,
  fleetSnapshotSchema,
  parseAdapterEnvelope,
  parseCanonicalEnvelope,
  parseFleetSnapshot,
  parseRegisteredRobotState,
  parseRobotDiagnosticEnvelope,
  parseTelemetryBatch,
  reconcileDeltaWithSnapshot,
  registeredRobotStateSchema,
  robotDiagnosticEnvelopeSchema,
  telemetryBatchSchema,
  withFreshness,
} from "./envelope/envelopeSchema.js";

export type {
  AdapterEnvelope,
  CanonicalCore,
  CanonicalEnvelope,
  CanonicalEnvelopeWire,
  DeltaReconciliation,
  FleetSite,
  FleetSnapshot,
  FleetSnapshotRobot,
  ReconciliationEpoch,
  RegisteredRobotState,
  RobotDiagnosticEnvelope,
  TelemetryBatch,
} from "./envelope/envelopeSchema.js";

export {
  ADAPTER_ERROR_KINDS,
  ERROR_KINDS,
  adapterErrorKindSchema,
  contractIssueSchema,
  errorEnvelopeSchema,
  errorKindSchema,
  parseErrorEnvelope,
} from "./errors/errorEnvelopeSchema.js";

export type { AdapterErrorKind, ErrorEnvelope, ErrorKind } from "./errors/errorEnvelopeSchema.js";

export {
  DEFAULT_FRESHNESS_POLICY,
  deriveFreshness,
  freshnessPolicySchema,
  parseFreshnessPolicy,
} from "./freshness/deriveFreshness.js";

export type { DeriveFreshnessInput, FreshnessPolicy } from "./freshness/deriveFreshness.js";

export {
  adapterHealthSchema,
  healthResponseSchema,
  lateFreshnessTicksSchema,
  parseHealthResponse,
  unknownFieldScopeSchema,
  unknownFieldTallySchema,
} from "./health/healthResponseSchema.js";

export type {
  AdapterHealth,
  HealthResponse,
  UnknownFieldScope,
  UnknownFieldTally,
} from "./health/healthResponseSchema.js";

export {
  BATTERY_HISTORY_MAX_POINTS,
  BATTERY_HISTORY_SCHEMA_VERSION,
  BATTERY_HISTORY_WINDOW_MS,
  batteryHistoryPointSchema,
  parseRobotBatteryHistory,
  robotBatteryHistorySchema,
} from "./history/batteryHistorySchema.js";

export type { BatteryHistoryPoint, RobotBatteryHistory } from "./history/batteryHistorySchema.js";
