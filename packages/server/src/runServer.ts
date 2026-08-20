import type { CanonicalEnvelope } from "@fleet/contracts";

import type { ServerConfiguration } from "./config/serverConfiguration.ts";
import type { RuntimeEndpoints } from "./config/runtimeEndpoints.ts";
import { PendingDeltaSet } from "./fanout/pendingDeltas.ts";
import { FreshnessSweep } from "./freshness/freshnessSweep.ts";
import { HealthMetrics } from "./health/healthMetrics.ts";
import { createHttpApp } from "./http/createApp.ts";
import { encodeFleetSnapshot } from "./http/fleetResponse.ts";
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
  /** Robots whose state changed since the last flush; nothing drains this yet (**H2**). */
  readonly deltas: PendingDeltaSet<CanonicalEnvelope>;
  /** Process-wide counters, including the late-tick count the sweep feeds. */
  readonly health: HealthMetrics;
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
 * `routes` counts what is mounted. Only `GET /api/fleet` is (**G1**); ingest and the other
 * reads are still 404 (`TODO.md` **D1**, **G2**–**G3**). A server answering 404 for a
 * reason is different from one answering 404 because it is broken, and only the log can
 * tell an operator which they have.
 *
 * The sweep starts here and is the reason this function returns the pieces it composed:
 * nothing drains the delta set and no route reads the counters yet, so a test is currently
 * the only consumer that can prove either one moved.
 */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const { endpoints, configuration, logger, clock } = options;

  // Seeded from the manifest, so a robot that has never reported reads UNKNOWN in the
  // fleet snapshot rather than being absent from it (ADR 3, ADR 14).
  const store = new CurrentStateStore(configuration.manifest.robots);
  const deltas = new PendingDeltaSet<CanonicalEnvelope>();
  const health = new HealthMetrics();

  // ADR 3 § Implications: under ingest saturation the sweep stops firing, the console
  // freezes robots at their last computed state instead of degrading them, and a sweep
  // that silently stops looks identical to a healthy fleet. The counter is the durable
  // record and the log line is what makes it audible before `GET /api/health` exists
  // (**G3**, blocked on ADR 30).
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
    app: createHttpApp({
      allowedOrigins: endpoints.allowedOrigins,
      readFleet: () =>
        encodeFleetSnapshot({
          robots: store.list(),
          capturedAt: clock.now(),
          // Zero until fan-out owns the counter (**H3a**); a cold snapshot discards nothing.
          flushSequence: 0,
        }),
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
    routes: 1,
  });

  // Started after the listener, so a sweep never runs against a server that failed to
  // bind and left nothing to stop it.
  sweep.start();

  return {
    port: listener.port,
    store,
    sweep,
    deltas,
    health,
    stop: async () => {
      // The interval first: a leaked one outlives the process's usefulness and makes a
      // test suite green while the process stays unkillable (**F6**).
      sweep.stop();
      await listener.close();
      logger.log("info", "server.stopped", { port: listener.port });
    },
  };
}
