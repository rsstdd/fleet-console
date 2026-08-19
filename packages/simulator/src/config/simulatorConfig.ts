/**
 * The validated simulator configuration and its defaults.
 *
 * Principle 13: endpoint, workload and fault scope are typed configuration
 * validated once at startup, not literals scattered through the generators.
 */

/** Documented normal-mode defaults; the demo in the root README runs on these. */
export const DEFAULTS = {
  /** Root README § demo: roughly 50 robots. */
  robots: 50,
  /** Per-robot emission rate in hertz (ADR 2 § Assumptions). */
  hz: 1,
  /** Fixed so an unseeded run is still reproducible; `--seed` overrides it. */
  seed: 1,
  /**
   * Server ingest origin; the vendor path segment is appended per request.
   *
   * Coupling: this is the same address `packages/server` binds by default —
   * `ENDPOINT_DEFAULTS` in its `src/config/runtimeEndpoints.ts`, host `127.0.0.1` and
   * port `8080`. The two are restated rather than shared because the simulator must not
   * depend on the server, and `src/config/simulatorConfig.test.ts` pins this value so a
   * change here shows up as a named assertion rather than as a demo that emits into a
   * closed port (ADR 21). `FLEET_INGEST_URL` or `--endpoint` overrides it.
   */
  endpoint: "http://127.0.0.1:8080",
  /** Per-request timeout. Above one second at 1 Hz a reading is already superseded. */
  timeoutMs: 2000,
  /** Ceiling on concurrent in-flight requests; the backpressure bound of TODO § 13. */
  maxInFlight: 64,
  /**
   * Retries default to none. A telemetry reading is superseded by the next one
   * within a second, so re-sending a failed reading delivers a value the server
   * is about to overwrite while adding load exactly when the server is already
   * struggling. `--retries` raises it when a test needs the retry path.
   */
  maxRetries: 0,
  /** Base backoff between retry attempts, before jitter. */
  retryBaseDelayMs: 100,
  /** Interval between periodic structured summaries. */
  summaryIntervalMs: 5000,
  /** How long shutdown waits for in-flight requests before abandoning them. */
  shutdownDeadlineMs: 2000,
} as const;

/** Highest per-robot rate accepted; beyond this the simulator, not the server, is what is measured. */
export const MAX_HZ = 50;

/** Fully validated configuration for one simulator run. */
export interface SimulatorConfig {
  readonly robots: number;
  readonly hz: number;
  readonly seed: number;
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly maxInFlight: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly summaryIntervalMs: number;
  readonly shutdownDeadlineMs: number;
  /** Robot identifiers that must emit nothing at all; see `src/faults`. */
  readonly droppedRobotIds: readonly string[];
  /** Print the fleet manifest to stdout and exit without starting timers or transport. */
  readonly printManifest: boolean;
}

/**
 * Builds the ingest URL for one vendor.
 *
 * Coupling: vendor identity travels in the route, ratified 19 August 2026 as
 * ADR 8 § Decision (register stub **D9**, server TODO **M7**, both now closed) —
 * the path segment is validated against the adapter registry by
 * `selectIngestVendor` in `packages/server/src/ingest` before any body decoding,
 * so adapter selection never depends on unvalidated payload contents. Changing
 * the route shape is a coordinated change to this function, that selector, and
 * their tests (Principle 14).
 */
export function ingestUrlFor(endpoint: string, vendor: string): string {
  return `${endpoint.replace(/\/+$/, "")}/api/telemetry/${vendor}`;
}
