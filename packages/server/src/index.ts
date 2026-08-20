/**
 * Public entry point for `@fleet/server`.
 *
 * The runtime composition root lives in `runServer.ts`; this library surface exports the
 * framework-independent pieces it assembles so consumers and tests do not depend on the
 * executable process entry point.
 */

export {
  ADR3_BASELINE_FRESHNESS_POLICY,
  ConfigValidationError,
  freshnessPolicySchema,
  parseFreshnessPolicy,
  type FreshnessPolicy,
} from "./config/freshnessPolicy.ts";

export {
  fleetManifestSchema,
  parseFleetManifest,
  type FleetManifest,
} from "./config/fleetManifest.ts";

export { loadServerConfiguration, type ServerConfiguration } from "./config/serverConfiguration.ts";

export {
  ENDPOINT_DEFAULTS,
  ENDPOINT_ENV_KEYS,
  loadRuntimeEndpoints,
  parseRuntimeEndpoints,
  type RuntimeEndpoints,
} from "./config/runtimeEndpoints.ts";

export { PendingDeltaSet } from "./fanout/pendingDeltas.ts";

export { FreshnessSweep, type FreshnessSweepOptions } from "./freshness/freshnessSweep.ts";

export { HealthMetrics, type HealthSnapshot } from "./health/healthMetrics.ts";

export {
  selectIngestVendor,
  type IngestRejectionReason,
  type VendorRejected,
  type VendorSelected,
  type VendorSelection,
} from "./ingest/selectVendor.ts";

export { fixedClock, manualClock, systemClock, type Clock } from "./runtime/clock.ts";

export { RingBuffer } from "./state/ringBuffer.ts";

export {
  CurrentStateStore,
  HISTORY_CAPACITY,
  type CurrentRobotState,
  type ManifestRobot,
  type UnobservedRobotState,
  type UpsertResult,
} from "./state/currentStateStore.ts";
