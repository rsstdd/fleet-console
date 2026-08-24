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

/** The documented workload's fleet size — the number ADR 24's deferred question is about. */
const ROBOT_COUNT = 500;

/**
 * Frames driven before measurement starts, so the report describes a steady state.
 *
 * React's initial 500-row mount, the browser's first layout and JIT warm-up all land in
 * this window and none of them recur; leaving them in would make the p95 a first-render
 * number wearing a steady-state label, which is the specific way a benchmark lies.
 */
const WARMUP_FRAMES = 20;

/**
 * Frames the report is computed over: a hundred at 100 ms is ten seconds of steady state.
 *
 * Enough samples that a p95 is a percentile rather than a coin toss, short enough that
 * the whole scenario — stack start, 50 robots reporting, teardown — still fits the
 * suite timeout below.
 */
const MEASURED_FRAMES = 100;

/** 10 Hz: the wire cadence ADR 2 caps the server's flush at, so this is the real ceiling. */
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

function formatRobotId(index: number): string {
  return `R-${String(index + 1).padStart(3, "0")}`;
}

/** Percentile over a copy, linear interpolation; small arrays only. */
function calculatePercentile(values: readonly number[], percentileRank: number): number {
  const sorted = [...values].sort((leftValue, rightValue) => leftValue - rightValue);
  if (sorted.length === 0) return Number.NaN;
  const rank = (percentileRank / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  const lowValue = sorted[low] ?? Number.NaN;
  const highValue = sorted[high] ?? Number.NaN;
  return lowValue + (highValue - lowValue) * (rank - low);
}

function summarize(values: readonly number[]): { p50: number; p95: number; max: number } {
  return {
    p50: calculatePercentile(values, 50),
    p95: calculatePercentile(values, 95),
    max: values.length === 0 ? Number.NaN : Math.max(...values),
  };
}

test.describe("500-robot live-stream measurement", () => {
  // Five minutes for one test, because its fixed costs dwarf the measurement: a stack
  // start, up to 30 s waiting for all 50 real robots to report, the 500-row first
  // render, then twelve seconds of driven frames. The suite-wide 120 s cannot cover
  // that, and a benchmark that times out reports nothing at all rather than reporting
  // a worse number.
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

    // 1. A real snapshot, decoded with the console's own decoder. Every manifest robot
    //    must have reported before the seed is taken: a registered-only entry carries no
    //    core fields to expand, so expanding one would seed 500 robots that can never
    //    render a battery value the assertions below look for.
    const observed = await test.step("capture a fully observed snapshot", async () => {
      // The same budget `stack.ts` gives a process to become ready. Past it the manifest
      // is not filling slowly, it is not filling, and the throw names how far it got.
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
        // The simulator's own emit cadence is faster than this, so a tighter loop only
        // adds HTTP round trips to the server it is waiting on.
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
        robotId: formatRobotId(index),
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
    const buildFrame = (frameIndex: number): string => {
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
    expect(parseTelemetryBatch(JSON.parse(buildFrame(1))).ok).toBe(true);

    // 3. Both routes must be registered before `goto`: the console opens its socket and
    //    fetches its snapshot during first render, so a route installed afterwards would
    //    miss the join entirely and the test would measure an empty table.
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

    // 4. An init script, not an evaluate: the probe subclasses `WebSocket`, so it has to
    //    be installed before the app's first line runs. Installed afterwards it would
    //    wrap nothing — the console's socket would already be the native one, and every
    //    counter below would read zero against a UI that was provably updating.
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

    // 5. Warmup first, then the measured window — see WARMUP_FRAMES for why the two are
    //    separated, and why the wall clock starts only at the boundary between them.
    const totalFrames = WARMUP_FRAMES + MEASURED_FRAMES;
    let measuredStartedAt = 0;
    for (let frame = 1; frame <= totalFrames; frame += 1) {
      if (frame === WARMUP_FRAMES + 1) measuredStartedAt = performance.now();
      socket.send(buildFrame(frame));
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
    const lastHalfFirstRobot = formatRobotId(totalFrames % 2 === 0 ? 0 : HALF);
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
