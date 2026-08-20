import type { ServerConfiguration } from "./config/serverConfiguration.ts";
import type { RuntimeEndpoints } from "./config/runtimeEndpoints.ts";
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
 */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const { endpoints, configuration, logger, clock } = options;

  // Seeded from the manifest, so a robot that has never reported reads UNKNOWN in the
  // fleet snapshot rather than being absent from it (ADR 3, ADR 14).
  const store = new CurrentStateStore(configuration.manifest.robots);

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

  return {
    port: listener.port,
    store,
    stop: async () => {
      await listener.close();
      logger.log("info", "server.stopped", { port: listener.port });
    },
  };
}
