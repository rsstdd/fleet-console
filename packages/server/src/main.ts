import path from "node:path";
import process from "node:process";

import { ConfigValidationError } from "./config/freshnessPolicy.ts";
import { loadRuntimeEndpoints } from "./config/runtimeEndpoints.ts";
import { loadServerConfiguration } from "./config/serverConfiguration.ts";
import { createJsonLogger } from "./observability/logger.ts";
import { startServer } from "./runServer.ts";
import { systemClock } from "./runtime/clock.ts";

/**
 * The process: read configuration, start the server, stop it on a signal.
 *
 * Everything with a decision in it lives in `runServer.ts`. What is left here is the part
 * that cannot be unit-tested without becoming a different thing — reading the real
 * environment, resolving real paths, and installing real signal handlers — kept as thin as
 * that division allows.
 *
 * Run through `tsx` (ADR 9). `node src/main.ts` does not work: `@fleet/contracts` exports
 * source whose internal imports carry `.js` extensions that nothing emits.
 */

/**
 * Deployment configuration, resolved from this file rather than the working directory.
 *
 * Root `pnpm dev` is `pnpm -r --parallel dev`, which runs each package's script with that
 * package as the working directory, so a relative `config/` would resolve inside
 * `packages/server` and the one-command start would fail on a missing file (ADR 14 puts
 * these at the repository root).
 */
const CONFIG_DIR = path.resolve(import.meta.dirname, "..", "..", "..", "config");

async function main(): Promise<void> {
  const logger = createJsonLogger();

  const endpoints = loadRuntimeEndpoints();
  const configuration = await loadServerConfiguration(
    path.join(CONFIG_DIR, "freshness.json"),
    path.join(CONFIG_DIR, "fleet-manifest.json"),
  );

  const server = await startServer({ endpoints, configuration, logger, clock: systemClock });

  let stopping = false;
  const stop = (signal: string): void => {
    // A second Ctrl-C during a shutdown must not start a second one: `close()` on an
    // already-closing server rejects, and the operator would see a crash where they asked
    // for an exit.
    if (stopping) return;
    stopping = true;
    logger.log("info", "server.stopping", { signal });
    void server.stop().catch((error: unknown) => {
      logger.log("error", "server.stop_failed", { message: describe(error) });
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", () => {
    stop("SIGINT");
  });
  process.once("SIGTERM", () => {
    stop("SIGTERM");
  });
}

/** Renders an unknown thrown value as a message, without assuming it is an `Error`. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

try {
  await main();
} catch (error: unknown) {
  // `ConfigValidationError` is never caught and continued past (**C6**, ADR 21): a server
  // that starts on defaults nobody deployed is the failure the strict schemas exist to
  // prevent. It is separated from an unexpected failure only so the operator is told which
  // file and field to fix, on stderr, where a startup failure belongs.
  if (error instanceof ConfigValidationError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`server failed to start: ${describe(error)}\n`);
  }
  process.exitCode = 1;
}
