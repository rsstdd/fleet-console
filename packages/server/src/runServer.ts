import type { ServerConfiguration } from "./config/serverConfiguration.ts";
import type { RuntimeEndpoints } from "./config/runtimeEndpoints.ts";
import { createFlushSequence, DeltaFanOut } from "./fanout/deltaFanOut.ts";
import { FreshnessSweep } from "./freshness/freshnessSweep.ts";
import { HealthMetrics } from "./health/healthMetrics.ts";
import { ingestTelemetry } from "./ingest/ingestTelemetry.ts";
import { createAdapterRegistry } from "@fleet/adapters";

import { createHttpApp } from "./http/createApp.ts";
import { encodeFleetSnapshot } from "./http/fleetResponse.ts";
import { encodeHealthResponse } from "./http/healthResponse.ts";
import { encodeRobotDetail } from "./http/robotResponse.ts";
import { startListener } from "./http/listener.ts";
import type { Logger } from "./observability/logger.ts";
import type { Clock } from "./runtime/clock.ts";
import { CurrentStateStore } from "./state/currentStateStore.ts";

/**
 * The composition step: validated configuration in, a running server out.
 *
 * Separate from `main.ts` so that everything with a decision in it is testable and the
 * process entry point is not. This function never reads a file, an environment variable or
 * a clock; `main.ts` does that and hands the results over, which is what lets a test run
 * two servers at two configurations without touching the environment either of them would
 * have read.
 */

/** Everything the server needs, already decoded. */
export interface StartServerOptions {
  readonly endpoints: RuntimeEndpoints;
  readonly configuration: ServerConfiguration;
  readonly logger: Logger;
  /** The one clock; every timestamp this server puts on the wire comes through it. */
  readonly clock: Clock;
}

/** A running server and the only supported way to stop it. */
export interface RunningServer {
  /** The bound port, which is what a caller that asked for `0` needs back. */
  readonly port: number;
  /** Seeded fleet state, exposed so a test can observe what the routes serve. */
  readonly store: CurrentStateStore;
  /** The running sweep, exposed so a test can drive a tick without waiting on an interval. */
  readonly sweep: FreshnessSweep;
  /** Delta fan-out: one coalescing set per connected console. */
  readonly deltas: DeltaFanOut;
  /** Process-wide counters, including the late-tick count the sweep feeds. */
  readonly health: HealthMetrics;
  /** The dispatch registry, exposed for its unknown-field tally until **G3** serves it. */
  readonly registry: ReturnType<typeof createAdapterRegistry>;
  stop(): Promise<void>;
}

/**
 * Starts the listener and announces what it is actually running.
 *
 * The startup record names the freshness policy and the roster size rather than only the
 * address. ADR 3's policy is deliberately not defaulted — a server running rules nobody
 * deployed is the failure Principle 13 names — and a line proving *which* policy is live is
 * how that claim survives contact with a deployment.
 *
 * `routes` counts what is mounted: `POST /api/telemetry/:vendor`, `GET /api/fleet`,
 * `GET /api/robots/:id` and `GET /api/health`. Only the history read for the sparkline is
 * outstanding (`TODO.md` **G4**), and its shape is undecided. A server
 * answering 404 for a reason is different from one answering 404 because it is broken,
 * and only the log can tell an operator which they have.
 *
 * The sweep and fan-out start here; returning the composed pieces keeps their lifecycle and
 * counters independently testable while the mounted routes and sockets consume them live.
 */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const { endpoints, configuration, logger, clock } = options;

  // Seeded from the manifest, so a robot that has never reported reads UNKNOWN in the
  // fleet snapshot rather than being absent from it (ADR 3, ADR 14).
  const store = new CurrentStateStore(configuration.manifest.robots);
  // One counter, read by both the snapshot and every frame (**H3a**, ADR 18). A second
  // source makes the client's reconciliation meaningless while both still look plausible.
  const sequence = createFlushSequence();
  const deltas = new DeltaFanOut({ clock, sequence });
  const health = new HealthMetrics();

  // One registry, built once. It owns the process-wide unknown-field ledger, so a second
  // instance would split a tally that is defined as fleet-wide (ADR 15, **D8**).
  const registry = createAdapterRegistry();
  const ingestDependencies = {
    registry,
    store,
    deltas,
    health,
    clock,
    policy: configuration.freshness,
  };

  // ADR 3 § Implications: under ingest saturation the sweep stops firing, the console
  // freezes robots at their last computed state instead of degrading them, and a sweep
  // that silently stops looks identical to a healthy fleet. The health response is the
  // durable counter and the log line makes it audible without polling.
  const sweep = new FreshnessSweep({
    clock,
    store,
    deltas,
    policy: configuration.freshness,
    onLateTick: (latenessMs) => {
      health.noteLateFreshnessTick(latenessMs);
      logger.log("warn", "freshness.tick_late", {
        latenessMs,
        toleranceMs: configuration.freshness.lateTickToleranceMs,
      });
    },
  });

  const listener = await startListener({
    streams: {
      open: (client) => {
        deltas.add(client);
      },
      close: (client) => {
        deltas.remove(client);
      },
    },
    app: createHttpApp({
      allowedOrigins: endpoints.allowedOrigins,
      readFleet: () =>
        encodeFleetSnapshot({
          robots: store.list(),
          capturedAt: clock.now(),
          // Zero until fan-out owns the counter (**H3a**); a cold snapshot discards nothing.
          // The flush this snapshot reflects. A client discards buffered deltas at or
          // below it, so reading the live counter is what makes that comparison true.
          flushSequence: sequence.current(),
        }),
      readRobot: (robotId) => {
        const state = store.get(robotId);
        if (state === undefined) return null;
        return encodeRobotDetail({
          state,
          // `diagnostic()` is what makes the outbound copy real; reading `rawPayload`
          // around it would hand a caller a reference into retained evidence (ADR 26).
          rawPayload: store.diagnostic(robotId)?.rawPayload ?? null,
          sequenceHealth: store.sequenceHealth(robotId),
        });
      },
      readHealth: () =>
        encodeHealthResponse({
          metrics: health.snapshot(),
          unknownFields: registry.unknownFields(),
          sequenceByVendor: store.sequenceByVendor(),
          capturedAt: clock.now(),
        }),
      ingest: {
        apply: (vendor, raw) => ingestTelemetry(ingestDependencies, vendor, raw),
        noteUnsupportedVendor: () => {
          health.noteUnsupportedVendor();
        },
        noteMalformedBody: () => {
          health.noteMalformedIngest();
        },
      },
    }),
    host: endpoints.host,
    port: endpoints.port,
  });

  logger.log("info", "server.listening", {
    host: endpoints.host,
    port: listener.port,
    // A count, not the list: an origin is deployment configuration and belongs in the
    // startup record, but repeating it on every line is how it ends up in a demo capture.
    allowedOrigins: endpoints.allowedOrigins.length,
    robots: configuration.manifest.robots.length,
    freshness: configuration.freshness,
    routes: 4,
  });

  // Started after the listener, so a sweep never runs against a server that failed to
  // bind and left nothing to stop it.
  sweep.start();
  deltas.start();

  return {
    port: listener.port,
    store,
    sweep,
    deltas,
    health,
    registry,
    stop: async () => {
      // The interval first: a leaked one outlives the process's usefulness and makes a
      // test suite green while the process stays unkillable (**F6**).
      sweep.stop();
      // Fan-out before the listener: `stop()` closes every console, which ADR 8 §
      // Implications requires to happen before the HTTP server goes away.
      deltas.stop();
      await listener.close();
      logger.log("info", "server.stopped", { port: listener.port });
    },
  };
}
