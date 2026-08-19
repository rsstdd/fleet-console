import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderFleetManifest, startSimulator, type SimulatorApp } from "./app.ts";
import { DEFAULTS, type SimulatorConfig } from "./config/simulatorConfig.ts";
import { UnknownRobotError } from "./faults/faultPolicy.ts";
import { createMemoryLogger } from "./observability/logger.ts";
import { manualClock, manualMonotonicClock } from "./runtime/clock.ts";
import { readRobotId } from "./vendors/readRobotId.ts";
import type { IngestClient, SendOutcome } from "./transport/ingestClient.ts";

/** A transport that records every send instead of performing one. */
function recordingIngest(outcome: SendOutcome = { kind: "success", attempts: 1 }): IngestClient & {
  readonly sends: { vendor: string; payload: unknown }[];
} {
  const sends: { vendor: string; payload: unknown }[] = [];
  return {
    sends,
    send(vendor, payload): Promise<SendOutcome> {
      sends.push({ vendor, payload });
      return Promise.resolve(outcome);
    },
    inFlight: () => 0,
    abortAll: () => undefined,
  };
}

function configFor(overrides: Partial<SimulatorConfig> = {}): SimulatorConfig {
  return {
    robots: 3,
    hz: 1,
    seed: 1,
    endpoint: "http://ingest.test",
    timeoutMs: DEFAULTS.timeoutMs,
    maxInFlight: DEFAULTS.maxInFlight,
    maxRetries: 0,
    retryBaseDelayMs: DEFAULTS.retryBaseDelayMs,
    summaryIntervalMs: 5000,
    shutdownDeadlineMs: 50,
    droppedRobotIds: [],
    printManifest: false,
    ...overrides,
  };
}

/** Advances both the injected monotonic clock and the fake timers together. */
function advance(monotonic: { advance: (ms: number) => void }, ms: number, stepMs = 10): void {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    monotonic.advance(stepMs);
    vi.advanceTimersByTime(stepMs);
  }
}

describe("startSimulator", () => {
  let app: SimulatorApp | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await app?.stop();
    app = undefined;
    vi.useRealTimers();
  });

  it("runs generation, vendor serialization, transport and metrics end to end", async () => {
    const ingest = recordingIngest();
    const monotonic = manualMonotonicClock(0);

    app = startSimulator(configFor(), {
      ingest,
      clock: manualClock(Date.parse("2026-08-19T12:00:00.000Z")),
      monotonic,
      logger: createMemoryLogger(),
    });

    advance(monotonic, 3000);
    await vi.runOnlyPendingTimersAsync();

    expect(ingest.sends.length).toBeGreaterThanOrEqual(3);
    expect(app.metrics.snapshot().readingsAttempted).toBe(ingest.sends.length);
    expect(app.metrics.snapshot().sendSucceeded).toBe(ingest.sends.length);
  });

  it("sends each robot's payload in its own vendor's dialect", async () => {
    const ingest = recordingIngest();
    const monotonic = manualMonotonicClock(0);

    app = startSimulator(configFor({ robots: 3 }), {
      ingest,
      clock: manualClock(Date.parse("2026-08-19T12:00:00.000Z")),
      monotonic,
      logger: createMemoryLogger(),
    });

    advance(monotonic, 1500);
    await vi.runOnlyPendingTimersAsync();

    const byVendor = new Map(ingest.sends.map(({ vendor, payload }) => [vendor, payload]));
    expect([...byVendor.keys()].sort()).toEqual(["A", "B", "C"]);
    expect(byVendor.get("A")).toHaveProperty("telemetry.lidar");
    expect(byVendor.get("B")).toHaveProperty("batt_pct");
    expect(byVendor.get("B")).not.toHaveProperty("seq");
    expect(byVendor.get("C")).toHaveProperty("telemetry.water");
    expect(byVendor.get("C")).not.toHaveProperty("telemetry.lidar");
  });

  it("never constructs a canonical envelope: no payload carries canonical field names", async () => {
    // The adapter boundary is the point of this package. A payload arriving with
    // `batteryPercent` or `receivedAt` would mean normalization leaked in here
    // (ADR 1, AGENTS.md § Package responsibilities).
    const ingest = recordingIngest();
    const monotonic = manualMonotonicClock(0);

    app = startSimulator(configFor({ robots: 6 }), {
      ingest,
      clock: manualClock(0),
      monotonic,
      logger: createMemoryLogger(),
    });

    advance(monotonic, 2000);
    await vi.runOnlyPendingTimersAsync();

    const serialized = JSON.stringify(ingest.sends);
    for (const canonical of [
      "batteryPercent",
      "receivedAt",
      "reportedAt",
      "capabilities",
      "freshness",
      "lidarHealth",
      "waterLevel",
      "robotId",
    ]) {
      expect(serialized, `canonical field ${canonical} must not appear`).not.toContain(canonical);
    }
  });

  it("sends no request at all for a dropped robot while the others continue", async () => {
    // ADR 3: silence is absence, not a synthetic "unreachable" value. This is
    // the simulator half of the freshness demonstration.
    const ingest = recordingIngest();
    const monotonic = manualMonotonicClock(0);

    app = startSimulator(configFor({ robots: 6, droppedRobotIds: ["R-002", "R-005"] }), {
      ingest,
      clock: manualClock(0),
      monotonic,
      logger: createMemoryLogger(),
    });

    advance(monotonic, 3000);
    await vi.runOnlyPendingTimersAsync();

    const senders = new Set(ingest.sends.map(({ payload }) => readRobotId(payload)));

    expect(senders.has("R-002")).toBe(false);
    expect(senders.has("R-005")).toBe(false);
    expect([...senders].sort()).toEqual(["R-001", "R-003", "R-004", "R-006"]);
  });

  it("keeps a dropped robot's state frozen, so a restart resumes rather than jumps", async () => {
    const monotonic = manualMonotonicClock(0);
    app = startSimulator(configFor({ robots: 3, droppedRobotIds: ["R-002"] }), {
      ingest: recordingIngest(),
      clock: manualClock(0),
      monotonic,
      logger: createMemoryLogger(),
    });

    advance(monotonic, 5000);
    await vi.runOnlyPendingTimersAsync();

    const dropped = app.robots.find((robot) => robot.identity.robotId === "R-002");
    expect(dropped?.state.sequence).toBe(0);
    const active = app.robots.find((robot) => robot.identity.robotId === "R-001");
    expect(active?.state.sequence).toBeGreaterThan(0);
  });

  it("counts dropped robots in the metrics rather than hiding them", () => {
    const monotonic = manualMonotonicClock(0);
    app = startSimulator(configFor({ robots: 6, droppedRobotIds: ["R-002", "R-005"] }), {
      ingest: recordingIngest(),
      clock: manualClock(0),
      monotonic,
      logger: createMemoryLogger(),
    });

    expect(app.metrics.snapshot()).toMatchObject({
      configuredRobots: 6,
      activeRobots: 4,
      droppedRobots: 2,
    });
  });

  it("fails at startup on an unknown drop target without starting any timer", () => {
    const setInterval = vi.spyOn(globalThis, "setInterval");

    expect(() =>
      startSimulator(configFor({ robots: 3, droppedRobotIds: ["R-999"] }), {
        ingest: recordingIngest(),
        clock: manualClock(0),
        monotonic: manualMonotonicClock(0),
        logger: createMemoryLogger(),
      }),
    ).toThrow(UnknownRobotError);

    expect(setInterval).not.toHaveBeenCalled();
    setInterval.mockRestore();
  });

  it("classifies every transport outcome into its own counter", async () => {
    for (const [outcome, counter] of [
      [{ kind: "rejected", status: 400, attempts: 1 }, "sendRejected"],
      [{ kind: "server-failure", status: 503, attempts: 1 }, "serverFailed"],
      [{ kind: "timeout", attempts: 1 }, "timedOut"],
      [{ kind: "network-failure", attempts: 1 }, "networkFailed"],
    ] as const) {
      const monotonic = manualMonotonicClock(0);
      const running = startSimulator(configFor({ robots: 1 }), {
        ingest: recordingIngest(outcome),
        clock: manualClock(0),
        monotonic,
        logger: createMemoryLogger(),
      });

      advance(monotonic, 1500);
      await vi.runOnlyPendingTimersAsync();

      expect(running.metrics.snapshot()[counter], counter).toBeGreaterThan(0);
      await running.stop();
    }
  });

  it("logs startup and a periodic summary, never one line per reading", async () => {
    // At 500 robots and 5 Hz a per-reading log is 2,500 lines a second and the
    // formatting alone becomes the bottleneck (AGENTS.md § Performance).
    const logger = createMemoryLogger();
    const monotonic = manualMonotonicClock(0);

    app = startSimulator(configFor({ robots: 20, summaryIntervalMs: 1000 }), {
      ingest: recordingIngest(),
      clock: manualClock(0),
      monotonic,
      logger,
    });

    advance(monotonic, 3000);
    await vi.runOnlyPendingTimersAsync();

    expect(logger.records[0]?.event).toBe("simulator.started");
    const summaries = logger.records.filter((r) => r.event === "simulator.summary");
    expect(summaries.length).toBeGreaterThanOrEqual(2);
    expect(summaries.length).toBeLessThan(app.metrics.snapshot().readingsAttempted);
  });

  it("sanitizes the endpoint in the startup line", () => {
    const logger = createMemoryLogger();
    app = startSimulator(configFor({ endpoint: "http://user:hunter2@ingest.test" }), {
      ingest: recordingIngest(),
      clock: manualClock(0),
      monotonic: manualMonotonicClock(0),
      logger,
    });

    expect(JSON.stringify(logger.records[0])).not.toContain("hunter2");
  });

  it("stops scheduling on stop and emits a final summary", async () => {
    const ingest = recordingIngest();
    const logger = createMemoryLogger();
    const monotonic = manualMonotonicClock(0);

    const running = startSimulator(configFor({ robots: 5 }), {
      ingest,
      clock: manualClock(0),
      monotonic,
      logger,
    });

    advance(monotonic, 2000);
    await vi.runOnlyPendingTimersAsync();
    const sentBeforeStop = ingest.sends.length;

    await running.stop();
    advance(monotonic, 5000);
    await vi.runOnlyPendingTimersAsync();

    expect(ingest.sends.length).toBe(sentBeforeStop);
    expect(logger.records.at(-1)?.event).toBe("simulator.stopped");
  });

  it("makes stop idempotent, so a repeated signal drains once", async () => {
    const logger = createMemoryLogger();
    const running = startSimulator(configFor({ robots: 2 }), {
      ingest: recordingIngest(),
      clock: manualClock(0),
      monotonic: manualMonotonicClock(0),
      logger,
    });

    await running.stop();
    await running.stop();

    expect(logger.records.filter((r) => r.event === "simulator.stopped")).toHaveLength(1);
  });

  it("produces an identical run for the same seed", async () => {
    const run = async (): Promise<unknown> => {
      const ingest = recordingIngest();
      const monotonic = manualMonotonicClock(0);
      const running = startSimulator(configFor({ robots: 6, seed: 42 }), {
        ingest,
        clock: manualClock(Date.parse("2026-08-19T12:00:00.000Z")),
        monotonic,
        logger: createMemoryLogger(),
      });

      advance(monotonic, 4000);
      await vi.runOnlyPendingTimersAsync();
      await running.stop();
      return ingest.sends;
    };

    expect(await run()).toEqual(await run());
  });
});

describe("renderFleetManifest", () => {
  it("prints the roster the server seeds never-reported robots from", () => {
    const parsed: unknown = JSON.parse(renderFleetManifest(configFor({ robots: 3, seed: 1 })));

    // No `seed` wrapper and `vendorId` throughout: the printed document is
    // exactly what the server's strict schema accepts, and the seed goes to
    // stderr at the call site (ADR 14).
    expect(parsed).toEqual({
      robots: [
        { robotId: "R-001", siteId: "SITE-NORTH", vendorId: "A", model: expect.any(String) },
        { robotId: "R-002", siteId: "SITE-NORTH", vendorId: "B", model: expect.any(String) },
        { robotId: "R-003", siteId: "SITE-NORTH", vendorId: "C", model: expect.any(String) },
      ],
    });
  });

  it("starts no timer and opens no transport", () => {
    const setInterval = vi.spyOn(globalThis, "setInterval");
    renderFleetManifest(configFor({ robots: 50 }));

    expect(setInterval).not.toHaveBeenCalled();
    setInterval.mockRestore();
  });
});

describe("in-flight reporting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never reports a peak above what the transport actually held", async () => {
    // The gauge must come from the transport, not from a prediction: a shed
    // request never increments in-flight, so `inFlight + 1` would report a peak
    // one above the configured ceiling and make the bound look broken.
    let held = 0;
    let peakHeld = 0;
    const ceiling = 3;
    const ingest = {
      send: (): Promise<SendOutcome> => {
        if (held >= ceiling) {
          return Promise.resolve({ kind: "shed" });
        }
        held += 1;
        peakHeld = Math.max(peakHeld, held);
        return new Promise((resolve) => {
          setTimeout(() => {
            held -= 1;
            resolve({ kind: "success", attempts: 1 });
          }, 50);
        });
      },
      inFlight: () => held,
      abortAll: () => undefined,
    };

    const monotonic = manualMonotonicClock(0);
    const running = startSimulator(configFor({ robots: 20, hz: 10 }), {
      ingest,
      clock: manualClock(0),
      monotonic,
      logger: createMemoryLogger(),
    });

    advance(monotonic, 2000);
    await vi.runOnlyPendingTimersAsync();

    expect(running.metrics.snapshot().peakInFlight).toBeLessThanOrEqual(ceiling);
    expect(running.metrics.snapshot().peakInFlight).toBe(peakHeld);
    await running.stop();
  });
});
