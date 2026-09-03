/**
 * The executable boundary.
 *
 * The only module that touches `process.argv`, `process.env`, signals, exit
 * codes, the real clock, and the real `fetch`. Importing this file starts
 * nothing: `main` runs only when the module is the process entry point, so tests
 * and tooling can import it safely (TODO § 3, § 16).
 */
import { pathToFileURL } from "node:url";

import { renderFleetManifest, startSimulator } from "./app.ts";
import { parseArgs } from "./cli/parseArgs.ts";
import { createIngestClient } from "./transport/ingestClient.ts";
import { createJsonLogger } from "./observability/logger.ts";
import { createRandomSource, deriveSeed } from "./runtime/random.ts";
import { systemClock, systemMonotonicClock } from "./runtime/clock.ts";

/** Parses arguments, starts the simulator, and wires termination signals to a single drain. */
export async function main(
  argv: readonly string[],
  env: Readonly<Partial<Record<string, string>>>,
): Promise<number> {
  const parsed = parseArgs(argv, env);

  if (parsed.kind === "help") {
    process.stdout.write(parsed.text);
    return 0;
  }
  if (parsed.kind === "error") {
    // Actionable message only. A stack trace here would bury the one line that
    // tells the operator which flag was wrong (TODO § 11).
    process.stderr.write(`${parsed.message}\n`);
    return 2;
  }

  const { config } = parsed;

  if (config.printManifest) {
    // stdout carries the document, stderr carries the provenance. `> file`
    // therefore produces a file the server accepts, while the operator still
    // sees which seed produced it (ADR 14).
    process.stdout.write(`${renderFleetManifest(config)}\n`);
    process.stderr.write(
      `fleet manifest: ${String(config.robots)} robots, seed ${String(config.seed)}\n`,
    );
    return 0;
  }

  const logger = createJsonLogger();

  let app;
  try {
    app = startSimulator(config, {
      clock: systemClock,
      monotonic: systemMonotonicClock,
      logger,
      ingest: createIngestClient({
        endpoint: config.endpoint,
        timeoutMs: config.timeoutMs,
        maxInFlight: config.maxInFlight,
        maxRetries: config.maxRetries,
        retryBaseDelayMs: config.retryBaseDelayMs,
        fetch: globalThis.fetch.bind(globalThis),
        random: createRandomSource(deriveSeed(config.seed, "retry-jitter")),
      }),
    });
  } catch (error) {
    // Startup validation failed — an unknown --drop id, or an impossible fleet.
    // Nothing was started, so there is nothing to unwind.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  await new Promise<void>((resolve) => {
    const shutdown = (signal: NodeJS.Signals): void => {
      logger.log("info", "simulator.signal", { signal });
      void app.stop().then(resolve);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });

  return 0;
}

/** True when Node was told to run this module, rather than something importing it. */
function isProcessEntryPoint(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isProcessEntryPoint()) {
  process.exitCode = await main(process.argv.slice(2), process.env);
}
