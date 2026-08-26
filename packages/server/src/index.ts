export { createAdapterRegistry, type AdapterRegistry } from "./adapters/registry.ts";

export {
  isSupportedVendor,
  SUPPORTED_VENDORS,
  type AdapterError,
  type AdapterResult,
  type SupportedVendor,
} from "./adapters/result.ts";

export {
  loadServerConfiguration,
  parseFleetManifest,
  parseFreshnessPolicy,
  readRuntimeEndpoints,
  type FleetManifest,
  type FreshnessPolicy,
  type RuntimeEndpoints,
  type ServerConfiguration,
} from "./config.ts";

export { DeltaFanOut, type FanOutClient } from "./fanout.ts";

export { FreshnessSweep } from "./freshness.ts";

export { createHealthCounters, ingestTelemetry } from "./ingest.ts";

export {
  manualClock,
  manualMonotonicClock,
  silentLogger,
  systemClock,
  type Clock,
  type Logger,
} from "./runtime.ts";

export { startServer, type RunningServer } from "./runServer.ts";

export { CurrentStateStore, type CurrentRobotState, type ManifestRobot } from "./store.ts";
