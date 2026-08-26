import { parseArgs } from "node:util";
import { z } from "zod";
import { jsonLogger } from "../runtime.ts";
import { createIngestClient } from "./ingestClient.ts";
import { createRandomSource } from "./robot.ts";
import { renderFleetManifest, startSimulator, type SimulatorConfig } from "./run.ts";

const configSchema = z.strictObject({
  robots: z.coerce.number().int().min(1).max(5000).default(50),
  hz: z.coerce.number().min(0.1).max(50).default(2),
  seed: z.coerce.number().int().default(1),
  endpoint: z.url().default("http://127.0.0.1:8080"),
  drop: z.string().default(""),
  manifest: z.coerce.boolean().default(false),
});

export function parseSimulatorArgs(argv: readonly string[]): SimulatorConfig & {
  readonly manifest: boolean;
} {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      robots: { type: "string" },
      hz: { type: "string" },
      seed: { type: "string" },
      endpoint: { type: "string" },
      drop: { type: "string" },
      manifest: { type: "boolean" },
    },
    strict: true,
  });

  const parsed = configSchema.safeParse(
    Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
  );
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `--${issue.path.join(".")}: ${issue.message}`)
      .join("\n  ");
    throw new Error(`Invalid simulator options:\n  ${detail}`);
  }

  const { drop, manifest, ...rest } = parsed.data;
  return {
    ...rest,
    droppedRobotIds: drop === "" ? [] : drop.split(",").map((id) => id.trim()),
    summaryIntervalMs: 5000,
    manifest,
  };
}

export function runSimulatorCli(argv: readonly string[]): void {
  const { manifest, ...config } = parseSimulatorArgs(argv);
  if (manifest) {
    process.stdout.write(`${renderFleetManifest(config.robots, config.seed)}\n`);
    return;
  }

  const app = startSimulator(config, {
    logger: jsonLogger,
    ingest: createIngestClient({
      endpoint: config.endpoint,
      timeoutMs: 2000,
      maxInFlight: Math.max(16, config.robots),
      maxRetries: 2,
      retryBaseDelayMs: 50,
      fetch: globalThis.fetch.bind(globalThis),
      random: createRandomSource(config.seed),
    }),
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app.stop().then(() => process.exit(0));
    });
  }
}

if (process.argv[1]?.endsWith("simulator/main.ts") === true) {
  runSimulatorCli(process.argv.slice(2));
}
