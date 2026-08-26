import { fileURLToPath } from "node:url";
import { loadServerConfiguration, readRuntimeEndpoints } from "./config.ts";
import { jsonLogger, systemClock } from "./runtime.ts";
import { startServer } from "./runServer.ts";

const fromRepoRoot = (relative: string): string =>
  fileURLToPath(new URL(`../../../${relative}`, import.meta.url));

const server = await startServer({
  endpoints: readRuntimeEndpoints(),
  configuration: await loadServerConfiguration(
    process.env.FLEET_FRESHNESS_CONFIG ?? fromRepoRoot("config/freshness.json"),
    process.env.FLEET_MANIFEST_CONFIG ?? fromRepoRoot("config/fleet-manifest.json"),
  ),
  logger: jsonLogger,
  clock: systemClock,
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.stop().then(() => process.exit(0));
  });
}
