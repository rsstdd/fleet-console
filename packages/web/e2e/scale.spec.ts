import os from "node:os";
import process from "node:process";

import { expect, test } from "@playwright/test";
import {
  encodeCanonicalEnvelope,
  parseFleetSnapshot,
  parseTelemetryBatch,
  type CanonicalEnvelope,
  type CanonicalEnvelopeWire,
} from "@fleet/contracts";

import { startStack, type Stack } from "./stack.ts";

/**
 * The reported 500-robot client measurement (ADR 32; reopens ADR 18 and ADR 24's
 * deferred questions with a number).
 *
 * This is the *web client's* half of the scale claim — the server's ingest half was
 * measured separately (ADR 2's falsifier). The workload is the documented one: 500
 * robots at 5 Hz, modelled as ten WebSocket frames per second with 250 robots changing
 * in alternating frames.
 *
 * The seed data is never hand-authored: a real decoded snapshot is captured from the
 * running stack, expanded through the contracts-owned encoders, and re-validated with
 * the same strict decoder the console itself uses. Frames are served through
 * Playwright's WebSocket routing so cadence is controlled and measurable.
 *
 * **Only benchmark integrity is asserted** — 500 rows stay rendered, every frame is
 * received at the socket, and the final frame's content is genuinely rendered (the
 * application evidence). Timing and memory numbers are reported, not gated: a threshold
 * without a derivation is worse than none (ADR 22), and this report is the input such a
 * derivation would use.
 */

const ROBOT_COUNT = 500;
const WARMUP_FRAMES = 20;
const MEASURED_FRAMES = 100;
const FRAME_INTERVAL_MS = 100;
const HALF = ROBOT_COUNT / 2;

/** In-page instrumentation shape; see the init script below. */
interface ScaleProbe {
  received: number;
  paintLatencies: number[];
  rafIntervals: number[];
}

declare global {
  // A page global's ambient declaration needs `var`; nothing else may use it.
  var __scale: ScaleProbe;
}

function robotIdFor(index: number): string {
  return `R-${String(index + 1).padStart(3, "0")}`;
}

/** Percentile over a copy, linear interpolation; small arrays only. */
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sorted[low] ?? Number.NaN;
  const highValue = sorted[high] ?? Number.NaN;
  return lowValue + (highValue - lowValue) * (rank - low);
}

function summarize(values: readonly number[]): { p50: number; p95: number; max: number } {
  return {
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    max: values.length === 0 ? Number.NaN : Math.max(...values),
  };
}

test.describe("500-robot live-stream measurement", () => {
  test.describe.configure({ timeout: 300_000 });

  let stack: Stack;

  test.beforeAll(async () => {
    stack = await startStack({ server: 8395, vite: 5395 });
  });

  test.afterAll(async () => {
    await stack.dispose();
  });

  test("reports delta-to-paint behavior at 500 robots and 10 frames per second", async ({
    page,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== "chromium", "The reported measurement is Chromium-only by plan.");

    // 1. A real snapshot, decoded with the console's own decoder. Wait until every
    //    manifest robot has actually reported so the seed envelopes are observed ones.
    const observed = await test.step("capture a fully observed snapshot", async () => {
      const deadline = Date.now() + 30_000;
      for (;;) {
        const body: unknown = await (await fetch(`${stack.serverUrl}/api/fleet`)).json();
        const decoded = parseFleetSnapshot(body);
        if (!decoded.ok) throw new Error("real stack served an undecodable snapshot");
        const envelopes = decoded.value.robots.filter(
          (robot): robot is CanonicalEnvelope => "receivedAt" in robot,
        );
        if (envelopes.length === 50) return { snapshot: decoded.value, envelopes };
        if (Date.now() > deadline) {
          throw new Error(`only ${String(envelopes.length)} of 50 robots ever reported`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    });

    // The measurement needs no live backend; frames come from the test's own routing.
    await stack.stopSimulator();
    await stack.stopServer();

    // 2. Expand to 500 through the contracts-owned encoder, then prove the expansion
    //    still satisfies the strict schema before serving a byte of it.
    const session = observed.snapshot.serverSessionId;
    const seedWire: CanonicalEnvelopeWire[] = Array.from({ length: ROBOT_COUNT }, (_, index) => {
      const source = observed.envelopes[index % observed.envelopes.length];
      if (source === undefined) throw new Error("seed envelope missing");
      return encodeCanonicalEnvelope({
        ...source,
        robotId: robotIdFor(index),
        freshness: "live",
        core: { ...source.core, batteryPercent: 50 },
      });
    });
    const snapshotWire = {
      schemaVersion: observed.snapshot.schemaVersion,
      serverSessionId: session,
      flushSequence: 0,
      capturedAt: observed.snapshot.capturedAt,
      // The real snapshot's directory: every expanded robot keeps a real siteId,
      // so the strict referential check holds at 500 too (ADR 34).
      sites: observed.snapshot.sites,
      robots: seedWire,
    };
    expect(parseFleetSnapshot(snapshotWire).ok).toBe(true);

    /** One frame: half the fleet, alternating halves, battery encoding the frame index. */
    const frameFor = (frameIndex: number): string => {
      const offset = frameIndex % 2 === 0 ? 0 : HALF;
      const battery = frameIndex % 101;
      const robots = seedWire.slice(offset, offset + HALF).map((wire) => ({
        ...wire,
        core: { ...wire.core, batteryPercent: battery },
        reportedAt: observed.snapshot.capturedAt + frameIndex,
        receivedAt: observed.snapshot.capturedAt + frameIndex,
      }));
      return JSON.stringify({
        schemaVersion: snapshotWire.schemaVersion,
        serverSessionId: session,
        flushSequence: frameIndex,
        sentAt: observed.snapshot.capturedAt + frameIndex,
        robots,
      });
    };
    expect(parseTelemetryBatch(JSON.parse(frameFor(1))).ok).toBe(true);

    // 3. Routing: the snapshot from HTTP, the frames from the test's WebSocket end.
    await page.route("**/api/fleet", (route) => route.fulfill({ json: snapshotWire }));
    let resolveSocket: (socket: { send(message: string): void }) => void = () => undefined;
    const socketReady = new Promise<{ send(message: string): void }>((resolve) => {
      resolveSocket = resolve;
    });
    await page.routeWebSocket(
      (url) => url.pathname === "/ws",
      (ws) => {
        resolveSocket({
          send: (message) => {
            ws.send(message);
          },
        });
      },
    );

    // 4. In-page probe: frames received, receipt-to-next-animation-frame latency, and
    //    a continuous animation-frame interval sampler.
    await page.addInitScript(() => {
      const probe: ScaleProbe = { received: 0, paintLatencies: [], rafIntervals: [] };
      globalThis.__scale = probe;
      const NativeWebSocket = globalThis.WebSocket;
      // A subclass keeps the constructor contract intact for the app's own code.
      globalThis.WebSocket = class extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);
          // Receipt is counted synchronously: an animation frame is not
          // guaranteed to fire (an occluded or throttled page starves rAF),
          // and a count that depends on one times out the integrity poll
          // while the UI is provably correct. The rAF callback only samples
          // receipt-to-next-animation-frame latency.
          this.addEventListener("message", () => {
            probe.received += 1;
            const receivedAt = performance.now();
            requestAnimationFrame(() => {
              probe.paintLatencies.push(performance.now() - receivedAt);
            });
          });
        }
      };
      let last: number | null = null;
      const sample = (timestamp: number): void => {
        if (last !== null && probe.rafIntervals.length < 5_000) {
          probe.rafIntervals.push(timestamp - last);
        }
        last = timestamp;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const heapBefore = await readHeap(cdp);

    await page.goto(stack.consoleUrl);
    const links = page.getByRole("link", { name: /^R-\d{3}$/ });
    await expect(links).toHaveCount(ROBOT_COUNT, { timeout: 30_000 });
    const socket = await socketReady;

    // 5. Drive the workload: warmup, then the measured window.
    const totalFrames = WARMUP_FRAMES + MEASURED_FRAMES;
    let measuredStartedAt = 0;
    for (let frame = 1; frame <= totalFrames; frame += 1) {
      if (frame === WARMUP_FRAMES + 1) measuredStartedAt = performance.now();
      socket.send(frameFor(frame));
      await new Promise((resolve) => setTimeout(resolve, FRAME_INTERVAL_MS));
    }
    const measuredWallMs = performance.now() - measuredStartedAt;

    // 6. Integrity, which is the only thing asserted: every frame received at the
    //    socket, all rows still present, and the final frame's content genuinely
    //    rendered — that last assertion, not the count, is the application evidence.
    await expect
      .poll(() => page.evaluate(() => globalThis.__scale.received), { timeout: 10_000 })
      .toBe(totalFrames);
    await expect(links).toHaveCount(ROBOT_COUNT);
    const lastBattery = `${String(totalFrames % 101)}%`;
    const lastHalfFirstRobot = robotIdFor(totalFrames % 2 === 0 ? 0 : HALF);
    await expect(
      page.getByRole("row", { name: new RegExp(`^${lastHalfFirstRobot}\\b`) }),
    ).toContainText(lastBattery);

    const heapAfter = await readHeap(cdp);
    const probe = await page.evaluate(() => globalThis.__scale);
    const measuredLatencies = probe.paintLatencies.slice(WARMUP_FRAMES);

    // 7. The report. Machine-readable, environment included, gated by nothing.
    const report = {
      workload: {
        robots: ROBOT_COUNT,
        robotsPerFrame: HALF,
        framesPerSecond: 1000 / FRAME_INTERVAL_MS,
        warmupFrames: WARMUP_FRAMES,
        measuredFrames: MEASURED_FRAMES,
      },
      integrity: {
        renderedRows: ROBOT_COUNT,
        renderedActivationLinks: ROBOT_COUNT,
        framesSent: totalFrames,
        framesReceived: probe.received,
      },
      achievedFrameRateHz: (MEASURED_FRAMES / measuredWallMs) * 1000,
      deltaToNextPaintMs: summarize(measuredLatencies),
      animationFrameIntervalMs: summarize(probe.rafIntervals),
      jsHeapBytes: { before: heapBefore, after: heapAfter },
      environment: {
        browser: `${browserName} ${page.context().browser()?.version() ?? "unknown"}`,
        viewport: page.viewportSize(),
        cpuConcurrency: os.cpus().length,
        os: `${os.platform()} ${os.release()}`,
        node: process.version,
      },
    };

    await testInfo.attach("scale-report.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    // The concise summary the CI job prints.
    // eslint-disable-next-line no-console -- the benchmark's human-readable output
    console.log(
      [
        `500-robot measurement (${report.environment.browser}):`,
        `  frames received ${String(report.integrity.framesReceived)}/${String(totalFrames)}`,
        `  achieved rate ${report.achievedFrameRateHz.toFixed(2)} Hz`,
        `  delta→paint p50 ${report.deltaToNextPaintMs.p50.toFixed(1)} ms · p95 ${report.deltaToNextPaintMs.p95.toFixed(1)} ms · max ${report.deltaToNextPaintMs.max.toFixed(1)} ms`,
        `  rAF interval p50 ${report.animationFrameIntervalMs.p50.toFixed(1)} ms · p95 ${report.animationFrameIntervalMs.p95.toFixed(1)} ms`,
        `  JS heap ${String(heapBefore)} → ${String(heapAfter)} bytes`,
      ].join("\n"),
    );
  });
});

/** Reads Chromium's used JS heap through CDP; precise, unlike `performance.memory`. */
async function readHeap(cdp: {
  send(method: "Performance.getMetrics"): Promise<{ metrics: { name: string; value: number }[] }>;
}): Promise<number> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  return metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value ?? Number.NaN;
}
