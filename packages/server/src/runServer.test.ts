import { afterEach, describe, expect, it } from "vitest";

import {
  type CanonicalEnvelope,
  SCHEMA_VERSION,
  parseFleetSnapshot,
  parseTelemetryBatch,
} from "@fleet/contracts";

import { ADR3_BASELINE_FRESHNESS_POLICY } from "./config/freshnessPolicy.ts";
import type { RuntimeEndpoints } from "./config/runtimeEndpoints.ts";
import type { ServerConfiguration } from "./config/serverConfiguration.ts";
import { createJsonLogger } from "./observability/logger.ts";
import { manualClock } from "./runtime/clock.ts";
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
  // A literal instant, so `capturedAt` is an assertable value rather than "recently".
  const CAPTURED_AT = 1_755_000_000_000;
  const CLOCK = manualClock(CAPTURED_AT);

  /** One observed robot, so the sweep has something to age. */
  const OBSERVED: CanonicalEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    robotId: "rbt-1",
    siteId: "site-a",
    vendorId: "A",
    model: "sweeper-2000",
    adapterId: "vendor-a",
    adapterVersion: "1.0.0",
    reportedAt: CAPTURED_AT - 20,
    receivedAt: CAPTURED_AT,
    freshness: "live",
    core: {
      connectivity: "unknown",
      batteryPercent: 80,
      position: null,
      status: "idle",
      health: { severity: "nominal" },
    },
    capabilities: {},
  };

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
      clock: CLOCK,
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
      routes: 2,
    });
  });

  it("serves every manifest robot as UNKNOWN before any telemetry arrives", async () => {
    // ADR 3 created this population deliberately: a registered robot that has never
    // reported must render a fleet row, not be absent from the response.
    const running = await start();

    const response = await fetch(`http://127.0.0.1:${String(running.port)}/api/fleet`);

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      schemaVersion: "1",
      flushSequence: 0,
      capturedAt: CAPTURED_AT,
      robots: [
        {
          schemaVersion: "1",
          robotId: "rbt-1",
          siteId: "site-a",
          vendorId: "A",
          freshness: "unknown",
        },
        {
          schemaVersion: "1",
          robotId: "rbt-2",
          siteId: "site-a",
          vendorId: "B",
          freshness: "unknown",
        },
      ],
    });
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

  it("runs the sweep while the server is up and stops it with the server", async () => {
    // A leaked interval makes a test suite green and a process unkillable (**F6**).
    const running = await start();

    expect(running.sweep.isRunning).toBe(true);

    await running.stop();
    server = null;

    expect(running.sweep.isRunning).toBe(false);
  });

  it("routes a late tick into the health counter and says so in the log", async () => {
    // ADR 3 § Implications: a sweep that silently stops looks identical to a healthy
    // fleet, so the lateness has to reach something an operator can read.
    const running = await start();
    const policy = ADR3_BASELINE_FRESHNESS_POLICY;

    running.sweep.tick();
    const overrun = policy.lateTickToleranceMs + 50;
    CLOCK.advance(policy.sweepIntervalMs + overrun);
    running.sweep.tick();

    expect(running.health.snapshot().lateFreshnessTicks).toStrictEqual({
      count: 1,
      lastLatenessMs: overrun,
    });
    expect(JSON.parse(lines.at(-1) ?? "{}")).toStrictEqual({
      level: "warn",
      event: "freshness.tick_late",
      latenessMs: overrun,
      toleranceMs: policy.lateTickToleranceMs,
    });
  });

  it("sends a freshness-only transition to a connected console, telemetry untouched", async () => {
    // F4 through the whole chain: a robot that only aged is still a change worth sending,
    // and this is the hop that makes the ADR 3 guarantee observable by a client at all.
    const running = await start();
    const frames: string[] = [];
    running.deltas.add({
      send: (frame) => frames.push(frame),
      close: () => undefined,
    });
    running.store.upsert(OBSERVED, null, null);

    CLOCK.advance(ADR3_BASELINE_FRESHNESS_POLICY.staleThresholdMs + 1);
    running.sweep.tick();
    running.deltas.flush();

    const batch = parseTelemetryBatch(JSON.parse(frames[0] ?? "null"));
    expect(batch.ok).toBe(true);
    if (!batch.ok) return;
    expect(batch.value.robots).toHaveLength(1);
    expect(batch.value.robots[0]).toMatchObject({
      robotId: OBSERVED.robotId,
      freshness: "unreachable",
      reportedAt: OBSERVED.reportedAt,
    });
  });

  it("serves the same flush sequence on the snapshot that the frames carry", async () => {
    // ADR 18's whole point: two sources make the client's reconciliation meaningless
    // while both still look plausible.
    const running = await start();
    running.deltas.add({ send: () => undefined, close: () => undefined });
    running.store.upsert(OBSERVED, null, null);
    running.sweep.tick();
    CLOCK.advance(ADR3_BASELINE_FRESHNESS_POLICY.staleThresholdMs + 1);
    running.sweep.tick();
    running.deltas.flush();

    const snapshot: unknown = await (
      await fetch(`http://127.0.0.1:${String(running.port)}/api/fleet`)
    ).json();
    const parsed = parseFleetSnapshot(snapshot);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.flushSequence).toBe(1);
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
      clock: CLOCK,
    });
    expect(rebound.port).toBe(port);
    await rebound.stop();
  });
});
