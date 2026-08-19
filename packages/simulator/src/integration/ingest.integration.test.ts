import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { startSimulator, type SimulatorApp } from "../app.ts";
import { DEFAULTS, type SimulatorConfig } from "../config/simulatorConfig.ts";
import { createIngestClient } from "../transport/ingestClient.ts";
import { createMemoryLogger } from "../observability/logger.ts";
import { createRandomSource } from "../runtime/random.ts";
import { systemClock, systemMonotonicClock } from "../runtime/clock.ts";
import { readRobotId } from "../vendors/readRobotId.ts";

/**
 * The one test in this package that uses a real socket and real timers. It
 * verifies the request path a fake transport cannot: that the URL, method,
 * headers and JSON body survive an actual HTTP round trip (TODO § 17).
 *
 * Server integration proper — adapter dispatch, current state, the freshness
 * sweep — belongs with `packages/server` once its ingest endpoint exists. This
 * receiver only records; it decodes nothing, because deciding what a valid
 * payload is would make the simulator its own judge.
 */

/** One recorded request, captured before any assertion runs. */
interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly contentType: string | undefined;
  readonly body: unknown;
}

/** Starts a throwaway receiver on an ephemeral port, replying with the given status. */
async function startReceiver(status = 202): Promise<{
  readonly origin: string;
  readonly requests: RecordedRequest[];
  readonly close: () => Promise<void>;
  readonly server: Server;
}> {
  const requests: RecordedRequest[] = [];

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      // The receiver records; it does not judge. Deciding what a valid payload
      // is would make the simulator its own contract test.
      const body: unknown = raw === "" ? undefined : JSON.parse(raw);
      requests.push({
        url: request.url ?? "",
        method: request.method ?? "",
        contentType: request.headers["content-type"],
        body,
      });
      response.writeHead(status).end();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Receiver did not bind to a TCP port.");
  }

  return {
    server,
    requests,
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}

/** Polls until `predicate` holds or the budget runs out; no fixed sleep. */
async function waitFor(predicate: () => boolean, budgetMs = 4000): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for the expected requests.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function configFor(origin: string, overrides: Partial<SimulatorConfig> = {}): SimulatorConfig {
  return {
    robots: 3,
    // 20 Hz keeps the test brief without making the assertion about rate.
    hz: 20,
    seed: 1,
    endpoint: origin,
    timeoutMs: DEFAULTS.timeoutMs,
    maxInFlight: 16,
    maxRetries: 0,
    retryBaseDelayMs: DEFAULTS.retryBaseDelayMs,
    summaryIntervalMs: 60_000,
    shutdownDeadlineMs: 1000,
    droppedRobotIds: [],
    printManifest: false,
    ...overrides,
  };
}

/** Boots the simulator against a live socket, with only the transport real. */
function run(config: SimulatorConfig): SimulatorApp {
  return startSimulator(config, {
    clock: systemClock,
    monotonic: systemMonotonicClock,
    logger: createMemoryLogger(),
    ingest: createIngestClient({
      endpoint: config.endpoint,
      timeoutMs: config.timeoutMs,
      maxInFlight: config.maxInFlight,
      maxRetries: config.maxRetries,
      retryBaseDelayMs: config.retryBaseDelayMs,
      fetch: globalThis.fetch.bind(globalThis),
      random: createRandomSource(1),
    }),
  });
}

describe("HTTP ingest against a live receiver", () => {
  let app: SimulatorApp | undefined;
  let close: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await app?.stop();
    await close?.();
    app = undefined;
    close = undefined;
  });

  it("posts one JSON reading per request to the vendor's route", async () => {
    const receiver = await startReceiver();
    close = receiver.close;
    app = run(configFor(receiver.origin));

    await waitFor(() => receiver.requests.length >= 6);
    await app.stop();

    for (const request of receiver.requests) {
      expect(request.method).toBe("POST");
      expect(request.contentType).toBe("application/json");
      expect(request.url).toMatch(/^\/api\/telemetry\/[ABC]$/);
      // One reading per request, per ADR 2 — never an array or a batch envelope.
      expect(Array.isArray(request.body)).toBe(false);
      expect(typeof request.body).toBe("object");
    }
  });

  it("delivers each vendor's dialect intact across the wire", async () => {
    const receiver = await startReceiver();
    close = receiver.close;
    app = run(configFor(receiver.origin));

    await waitFor(() => new Set(receiver.requests.map((r) => r.url)).size === 3);
    await app.stop();

    const byRoute = new Map(receiver.requests.map((r) => [r.url, r.body]));

    expect(byRoute.get("/api/telemetry/A")).toMatchObject({
      telemetry: { lidar: expect.any(Object), battery: { level: expect.any(Number) } },
    });
    expect(byRoute.get("/api/telemetry/B")).toMatchObject({ batt_pct: expect.any(Number) });
    expect(byRoute.get("/api/telemetry/B")).not.toHaveProperty("seq");
    expect(byRoute.get("/api/telemetry/C")).toMatchObject({
      telemetry: { water: { level_pct: expect.any(Number) }, firmware_channel: "stable" },
    });
    expect(byRoute.get("/api/telemetry/C")).not.toHaveProperty("telemetry.lidar");
  });

  it("sends nothing for a dropped robot while the connection and other robots stay healthy", async () => {
    // The simulator half of ADR 3's freshness demonstration. The process must
    // remain healthy: a drop that killed the run would prove nothing.
    const receiver = await startReceiver();
    close = receiver.close;
    app = run(configFor(receiver.origin, { robots: 4, droppedRobotIds: ["R-002"] }));

    await waitFor(() => receiver.requests.length >= 20);
    await app.stop();

    const senders = new Set(receiver.requests.map((request) => readRobotId(request.body)));

    expect(senders.has("R-002")).toBe(false);
    expect([...senders].sort()).toEqual(["R-001", "R-003", "R-004"]);
    expect(app.metrics.snapshot().networkFailed).toBe(0);
    expect(app.metrics.snapshot().sendSucceeded).toBeGreaterThan(0);
  });

  it("counts a server rejection without retrying it", async () => {
    const receiver = await startReceiver(400);
    close = receiver.close;
    app = run(configFor(receiver.origin, { robots: 2, maxRetries: 3 }));

    await waitFor(() => app!.metrics.snapshot().sendRejected >= 4);
    await app.stop();

    const snapshot = app.metrics.snapshot();
    expect(snapshot.sendRejected).toBeGreaterThan(0);
    expect(snapshot.retriesSent).toBe(0);
    expect(snapshot.sendSucceeded).toBe(0);
  });

  it("shuts down within its deadline and stops the socket traffic", async () => {
    const receiver = await startReceiver();
    close = receiver.close;
    app = run(configFor(receiver.origin, { robots: 5 }));

    await waitFor(() => receiver.requests.length >= 10);

    const startedAt = Date.now();
    await app.stop();
    const shutdownMs = Date.now() - startedAt;
    const sentAtStop = receiver.requests.length;

    expect(shutdownMs).toBeLessThan(2000);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(receiver.requests.length).toBe(sentAtStop);
    expect(app.metrics.snapshot().inFlight).toBe(0);
  });
});

describe("the executable stays alive and emits", () => {
  let closeReceiver: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeReceiver?.();
    closeReceiver = undefined;
  });

  /**
   * Spawns the real CLI as a child process.
   *
   * This is the only test that runs `src/index.ts` the way an operator does, and
   * it exists because of a specific regression: the scheduler's interval was
   * `unref()`d, so Node found no handle holding the event loop, and the process
   * logged a healthy startup and exited before sending a single reading. Every
   * fake-timer test in this package passed straight through that. The behaviour
   * under test is "the process is still running and requests arrived", which
   * only a real process can demonstrate.
   */
  it("keeps running and delivers readings until it is signalled", async () => {
    const receiver = await startReceiver();
    closeReceiver = receiver.close;

    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL("../index.ts", import.meta.url)),
        "--robots",
        "4",
        "--hz",
        "10",
        "--endpoint",
        receiver.origin,
        "--summary",
        "60000",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let exitedEarly = false;
    child.once("exit", () => {
      exitedEarly = true;
    });

    try {
      await waitFor(() => receiver.requests.length >= 20, 8000);
      expect(exitedEarly, "the process exited before sending readings").toBe(false);
      expect(new Set(receiver.requests.map((r) => readRobotId(r.body))).size).toBe(4);
    } finally {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) =>
        child.once("exit", () => {
          resolve();
        }),
      );
    }
  }, 15_000);
});
