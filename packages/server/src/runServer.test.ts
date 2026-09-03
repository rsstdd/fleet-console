import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";

import {
  type CanonicalEnvelope,
  SCHEMA_VERSION,
  parseFleetSnapshot,
  parseRobotBatteryHistory,
  parseTelemetryBatch,
  reconcileDeltaWithSnapshot,
} from "@fleet/contracts";
import { loadVendorFixture } from "@fleet/adapters/testing";

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
      sites: [{ siteId: "site-a", label: "Site A" }],
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

  function vendorAWithSequence(sequence: number): unknown {
    const payload = structuredClone(loadVendorFixture("A").payload);
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("Recorded vendor A fixture is no longer an object.");
    }
    return { ...payload, seq: sequence };
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
      serverSessionId: running.serverSessionId,
      allowedOrigins: 0,
      robots: 2,
      freshness: ADR3_BASELINE_FRESHNESS_POLICY,
      routes: 5,
    });
  });

  it("passes the process logger through the live ingest path", async () => {
    server = await startServer({
      endpoints: { host: "127.0.0.1", port: 0, allowedOrigins: [] },
      configuration: {
        freshness: ADR3_BASELINE_FRESHNESS_POLICY,
        manifest: {
          sites: [{ siteId: "SITE-NORTH", label: "North site" }],
          robots: [{ robotId: "R-001", siteId: "SITE-NORTH", vendorId: "A", model: "AX-240" }],
        },
      },
      logger,
      clock: CLOCK,
    });
    const endpoint = `http://127.0.0.1:${String(server.port)}/api/telemetry/A`;

    for (const sequence of [9, 7]) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(vendorAWithSequence(sequence)),
      });
      expect(response.status).toBe(204);
    }

    expect(JSON.parse(lines.at(-1) ?? "{}")).toMatchObject({
      level: "warn",
      event: "telemetry.sequence_regression",
      robotId: "R-001",
      acceptedSequence: 9,
      receivedSequence: 7,
      receivedAt: CLOCK.now(),
    });
  });

  it("serves battery history from the live store through the injected clock", async () => {
    const running = await start();
    running.store.upsert(OBSERVED, null, 1);
    const base = `http://127.0.0.1:${String(running.port)}`;

    const observedResponse = await fetch(`${base}/api/robots/rbt-1/history`);
    expect(observedResponse.status).toBe(200);
    expect(observedResponse.headers.get("cache-control")).toBe("no-store");
    const observed = parseRobotBatteryHistory(await observedResponse.json());
    expect(observed.ok).toBe(true);
    if (observed.ok) {
      expect(observed.value.capturedAt).toBe(CLOCK.now());
      expect(observed.value.points).toEqual([
        { receivedAt: OBSERVED.receivedAt, batteryPercent: 80 },
      ]);
    }

    // Registered but unheard: the fleet page lists rbt-2, so this is an empty
    // 200 and not a 404 (ADR 33).
    const unheardResponse = await fetch(`${base}/api/robots/rbt-2/history`);
    expect(unheardResponse.status).toBe(200);
    const unheard = parseRobotBatteryHistory(await unheardResponse.json());
    expect(unheard.ok).toBe(true);
    if (unheard.ok) {
      expect(unheard.value.sourceSampleCount).toBe(0);
      expect(unheard.value.points).toEqual([]);
    }

    const unknownResponse = await fetch(`${base}/api/robots/rbt-999/history`);
    expect(unknownResponse.status).toBe(404);
  });

  it("serves every manifest robot as UNKNOWN before any telemetry arrives", async () => {
    // ADR 3 created this population deliberately: a registered robot that has never
    // reported must render a fleet row, not be absent from the response.
    const running = await start();

    const response = await fetch(`http://127.0.0.1:${String(running.port)}/api/fleet`);

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      schemaVersion: "3",
      serverSessionId: running.serverSessionId,
      flushSequence: 0,
      capturedAt: CAPTURED_AT,
      sites: [{ siteId: "site-a", label: "Site A" }],
      robots: [
        {
          schemaVersion: "3",
          robotId: "rbt-1",
          siteId: "site-a",
          vendorId: "A",
          freshness: "unknown",
        },
        {
          schemaVersion: "3",
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

  it("stamps the same server session on the snapshot and every frame", async () => {
    // ADR 31: the client compares the two, so a runtime with two identities would read
    // as a deployment-integrity failure on a console that is talking to one process.
    const running = await start();
    const frames: string[] = [];
    running.deltas.add({ send: (frame) => frames.push(frame), close: () => undefined });
    running.store.upsert(OBSERVED, null, null);
    running.sweep.tick();
    running.deltas.flush();

    const snapshot = parseFleetSnapshot(
      await (await fetch(`http://127.0.0.1:${String(running.port)}/api/fleet`)).json(),
    );
    const batch = parseTelemetryBatch(JSON.parse(frames[0] ?? "null"));
    expect(snapshot.ok && batch.ok).toBe(true);
    if (!snapshot.ok || !batch.ok) return;
    expect(snapshot.value.serverSessionId).toBe(running.serverSessionId);
    expect(batch.value.serverSessionId).toBe(running.serverSessionId);
  });

  it("mints a new session on restart while the flush sequence restarts at zero", async () => {
    // The restart half of ADR 31: the sequence returning to zero is safe precisely
    // because the session no longer matches, which is what a reconnecting client uses
    // to discard its stale epoch instead of discarding every new delta.
    const first = await start();
    const firstSession = first.serverSessionId;
    await first.stop();
    server = null;

    const second = await start();
    const snapshot = parseFleetSnapshot(
      await (await fetch(`http://127.0.0.1:${String(second.port)}/api/fleet`)).json(),
    );
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.value.serverSessionId).toBe(second.serverSessionId);
    expect(snapshot.value.serverSessionId).not.toBe(firstSession);
    expect(snapshot.value.flushSequence).toBe(0);
  });

  it("survives a restart as the console's reconciliation sees it, over real sockets", async () => {
    // The whole ADR 31 defect, at the process boundary: a client whose snapshot came
    // from the first runtime must be able to tell — from wire bytes alone — that the
    // restarted runtime's frames belong to a new epoch, and that its own new snapshot
    // accepts them. The browser side of the same rule is covered in
    // `packages/web/src/shared/lib/fleetTransport.test.ts`.
    const first = await start();
    const before = parseFleetSnapshot(
      await (await fetch(`http://127.0.0.1:${String(first.port)}/api/fleet`)).json(),
    );
    expect(before.ok).toBe(true);
    if (!before.ok) return;

    const { port } = first;
    await first.stop();
    server = null;
    const second = await start({ port });

    // A real stream client on the restarted process, receiving a real flushed frame.
    const client = new WebSocket(`ws://127.0.0.1:${String(port)}/ws`);
    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve);
      client.on("error", reject);
    });
    const framePromise = new Promise<string>((resolve) => {
      client.on("message", (data) => {
        if (Buffer.isBuffer(data)) resolve(data.toString("utf8"));
        else if (Array.isArray(data)) resolve(Buffer.concat(data).toString("utf8"));
        else resolve(Buffer.from(data).toString("utf8"));
      });
    });
    second.store.upsert(OBSERVED, null, null);
    second.deltas.flush();
    const frame = parseTelemetryBatch(JSON.parse(await framePromise));
    client.close();
    expect(frame.ok).toBe(true);
    if (!frame.ok) return;

    const after = parseFleetSnapshot(
      await (await fetch(`http://127.0.0.1:${String(port)}/api/fleet`)).json(),
    );
    expect(after.ok).toBe(true);
    if (!after.ok) return;

    // The old snapshot's sequence (0) does not cover the new frame's (1) — the numbers
    // alone would apply it into a stale epoch. The session is what refuses it.
    expect(reconcileDeltaWithSnapshot(before.value, frame.value)).toBe("session-mismatch");
    expect(reconcileDeltaWithSnapshot(after.value, frame.value)).toBe("covered");
    expect(frame.value.serverSessionId).toBe(second.serverSessionId);
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
