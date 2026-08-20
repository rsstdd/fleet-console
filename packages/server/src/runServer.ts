import type { ServerConfiguration } from "./config/serverConfiguration.ts";
import type { RuntimeEndpoints } from "./config/runtimeEndpoints.ts";
import { createHttpApp } from "./http/createApp.ts";
import { startListener } from "./http/listener.ts";
import type { Logger } from "./observability/logger.ts";

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
}

/** A running server and the only supported way to stop it. */
export interface RunningServer {
  /** The bound port, which is what a caller that asked for `0` needs back. */
  readonly port: number;
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
 * No route is mounted yet, so every request is the router's 404 (`TODO.md` **D1**,
 * **G1**–**G3**). That is why the record says `routes: 0`: a server answering 404 for a
 * reason is different from one answering 404 because it is broken, and only the log can
 * tell an operator which they have.
 */
export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const { endpoints, configuration, logger } = options;

  const listener = await startListener({
    app: createHttpApp({ allowedOrigins: endpoints.allowedOrigins }),
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
    routes: 0,
  });

  return {
    port: listener.port,
    stop: async () => {
      await listener.close();
      logger.log("info", "server.stopped", { port: listener.port });
    },
  };
}
