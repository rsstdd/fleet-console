import { WebSocket } from "ws";
import { afterEach, describe, expect, it } from "vitest";

import { createHttpApp } from "./createApp.ts";
import { encodeFleetSnapshot } from "./fleetResponse.ts";

/** No robot: these cases are about routing and policy, not about state. */
const readRobot = (): null => null;

/** A stub ingest port: these cases are about routing and policy, not the transition. */
const ingest = {
  apply: (): never => {
    throw new Error("ingest is not exercised by this suite");
  },
  noteUnsupportedVendor: (): void => undefined,
  noteMalformedBody: (): void => undefined,
};
import { startListener, type RunningListener } from "./listener.ts";

/**
 * The evidence `app.request()` cannot give: that a port is actually bound, that the
 * router reached it, and that one port serves both transports (ADR 8 § Constraints).
 *
 * Port `0` throughout, read back off the returned listener. `parseRuntimeEndpoints`
 * refuses `0` for a deployer, who would leave the console unable to address the server;
 * a test that reads the assigned port immediately has no such problem, and hard-coding a
 * port here would make the suite fail on a machine that happens to be using it.
 */
describe("startListener", () => {
  const readFleet = (): ReturnType<typeof encodeFleetSnapshot> =>
    encodeFleetSnapshot({ robots: [], capturedAt: 0, flushSequence: 0 });
  let listener: RunningListener | null = null;

  afterEach(async () => {
    await listener?.close();
    listener = null;
  });

  async function start(allowedOrigins: readonly string[] = []): Promise<RunningListener> {
    listener = await startListener({
      app: createHttpApp({ allowedOrigins, readFleet, readRobot, ingest }),
      host: "127.0.0.1",
      port: 0,
    });
    return listener;
  }

  it("serves the router over a real socket", async () => {
    const running = await start();

    const response = await fetch(`http://127.0.0.1:${String(running.port)}/api/nothing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { kind: "not_found" } });
  });

  it("carries the origin grant through the bound socket, not only through app.request", async () => {
    // The remaining half of L8: a policy can be correct and mounted on an app that the
    // listener never serves.
    const origin = "https://console.example.com";
    const running = await start([origin]);

    const granted = await fetch(`http://127.0.0.1:${String(running.port)}/api/nothing`, {
      headers: { origin },
    });
    const declined = await fetch(`http://127.0.0.1:${String(running.port)}/api/nothing`, {
      headers: { origin: "https://attacker.example.com" },
    });

    expect(granted.headers.get("access-control-allow-origin")).toBe(origin);
    expect(declined.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("upgrades /ws on the same port that serves HTTP", async () => {
    const running = await start();

    const client = new WebSocket(`ws://127.0.0.1:${String(running.port)}/ws`);
    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve);
      client.on("error", reject);
    });

    expect(running.streamClientCount).toBe(1);
    client.close();
  });

  it("refuses an upgrade on any other path rather than opening a stream nothing reads", async () => {
    const running = await start();

    const client = new WebSocket(`ws://127.0.0.1:${String(running.port)}/api/nothing`);
    const outcome = await new Promise<string>((resolve) => {
      client.on("open", () => {
        resolve("open");
      });
      client.on("error", () => {
        resolve("refused");
      });
    });

    expect(outcome).toBe("refused");
    expect(running.streamClientCount).toBe(0);
  });

  it("frees the port on close, with stream clients closed first", async () => {
    const running = await start();
    const { port } = running;
    const client = new WebSocket(`ws://127.0.0.1:${String(port)}/ws`);
    await new Promise<void>((resolve, reject) => {
      client.on("open", resolve);
      client.on("error", reject);
    });
    const clientClosed = new Promise<void>((resolve) => {
      client.on("close", () => {
        resolve();
      });
    });

    await running.close();
    listener = null;
    await clientClosed;

    // Rebinding the same port is the assertion that matters: `close()` resolving while a
    // socket is still held is exactly the shutdown bug that leaves `pnpm dev` unable to
    // restart.
    const rebound = await startListener({
      app: createHttpApp({ allowedOrigins: [], readFleet, readRobot, ingest }),
      host: "127.0.0.1",
      port,
    });
    expect(rebound.port).toBe(port);
    await rebound.close();
  });
});
