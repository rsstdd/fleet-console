import { afterEach, describe, expect, it } from "vitest";

import { ADR3_BASELINE_FRESHNESS_POLICY } from "./config/freshnessPolicy.ts";
import type { RuntimeEndpoints } from "./config/runtimeEndpoints.ts";
import type { ServerConfiguration } from "./config/serverConfiguration.ts";
import { createJsonLogger } from "./observability/logger.ts";
import { startServer, type RunningServer } from "./runServer.ts";

/**
 * The composition step, driven at two configurations in one run — which is the property
 * `startServer` taking decoded values rather than reading them buys.
 *
 * `port: 0` is written into a `RuntimeEndpoints` literal here. `parseRuntimeEndpoints`
 * would refuse it, and should: a deployer who asks for any free port leaves the console
 * unable to address the server. A test that reads the bound port back does not.
 */
describe("startServer", () => {
  const CONFIGURATION: ServerConfiguration = {
    freshness: ADR3_BASELINE_FRESHNESS_POLICY,
    manifest: {
      robots: [
        { robotId: "rbt-1", siteId: "site-a", vendorId: "A", model: "m" },
        { robotId: "rbt-2", siteId: "site-a", vendorId: "B", model: "m" },
      ],
    },
  };

  let server: RunningServer | null = null;
  const lines: string[] = [];
  const logger = createJsonLogger((line) => lines.push(line));

  afterEach(async () => {
    await server?.stop();
    server = null;
    lines.length = 0;
  });

  async function start(endpoints: Partial<RuntimeEndpoints> = {}): Promise<RunningServer> {
    server = await startServer({
      endpoints: { host: "127.0.0.1", port: 0, allowedOrigins: [], ...endpoints },
      configuration: CONFIGURATION,
      logger,
    });
    return server;
  }

  it("announces the policy it is actually running, not only the address", async () => {
    // ADR 3's policy is deliberately never defaulted, so which policy is live has to be
    // observable — otherwise a server running rules nobody deployed looks identical.
    const running = await start();

    expect(JSON.parse(lines[0] ?? "{}")).toStrictEqual({
      level: "info",
      event: "server.listening",
      host: "127.0.0.1",
      port: running.port,
      allowedOrigins: 0,
      robots: 2,
      freshness: ADR3_BASELINE_FRESHNESS_POLICY,
      routes: 0,
    });
  });

  it("serves the router at the port it announced", async () => {
    const running = await start();

    const response = await fetch(`http://127.0.0.1:${String(running.port)}/api/fleet`);

    expect(response.status).toBe(404);
  });

  it("carries the configured origins into the mounted policy", async () => {
    // The last join in the chain ADR 21 describes: environment to decoded value to app.
    const origin = "https://console.example.com";
    const running = await start({ allowedOrigins: [origin] });

    const response = await fetch(`http://127.0.0.1:${String(running.port)}/api/fleet`, {
      headers: { origin },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  });

  it("reports the stop and frees the port", async () => {
    const running = await start();
    const { port } = running;

    await running.stop();
    server = null;

    expect(JSON.parse(lines[1] ?? "{}")).toStrictEqual({
      level: "info",
      event: "server.stopped",
      port,
    });
    const rebound = await startServer({
      endpoints: { host: "127.0.0.1", port, allowedOrigins: [] },
      configuration: CONFIGURATION,
      logger,
    });
    expect(rebound.port).toBe(port);
    await rebound.stop();
  });
});
