import { describe, expect, it } from "vitest";

import { manualMonotonicClock } from "../runtime/clock.ts";
import { createMetrics } from "./simulatorMetrics.ts";
import { createMemoryLogger, sanitizeEndpoint } from "./logger.ts";

const CONTEXT = {
  configuredRobots: 50,
  configuredHz: 1,
  activeRobots: 47,
  droppedRobots: 3,
};

describe("createMetrics", () => {
  it("starts at zero and repeats the run configuration in every snapshot", () => {
    const snapshot = createMetrics(CONTEXT, manualMonotonicClock(0)).snapshot();

    expect(snapshot).toMatchObject({ ...CONTEXT, readingsAttempted: 0, sendSucceeded: 0 });
    expect(snapshot.byVendor).toEqual({ A: 0, B: 0, C: 0 });
  });

  it("counts attempted readings per vendor without a per-robot dimension", () => {
    const metrics = createMetrics(CONTEXT, manualMonotonicClock(0));
    metrics.recordReadingAttempted("A");
    metrics.recordReadingAttempted("A");
    metrics.recordReadingAttempted("C");

    const snapshot = metrics.snapshot();
    expect(snapshot.readingsAttempted).toBe(3);
    expect(snapshot.byVendor).toEqual({ A: 2, B: 0, C: 1 });
  });

  it("keeps original requests and retries separately countable", () => {
    // Collapsing the two would let a retry storm read as throughput
    // (Principle 12); this is the assertion that forbids it.
    const metrics = createMetrics(CONTEXT, manualMonotonicClock(0));
    metrics.recordRequestSent();
    metrics.recordRequestSent();
    metrics.recordRetrySent();

    expect(metrics.snapshot()).toMatchObject({ requestsSent: 2, retriesSent: 1 });
  });

  it("keeps every failure class separate", () => {
    const metrics = createMetrics(CONTEXT, manualMonotonicClock(0));
    metrics.recordRejected();
    metrics.recordServerFailure();
    metrics.recordTimeout();
    metrics.recordNetworkFailure();
    metrics.recordCancelled();

    expect(metrics.snapshot()).toMatchObject({
      sendRejected: 1,
      serverFailed: 1,
      timedOut: 1,
      networkFailed: 1,
      cancelled: 1,
    });
  });

  it("tracks peak in-flight separately from current", () => {
    const metrics = createMetrics(CONTEXT, manualMonotonicClock(0));
    metrics.setInFlight(5);
    metrics.setInFlight(12);
    metrics.setInFlight(2);

    expect(metrics.snapshot()).toMatchObject({ inFlight: 2, peakInFlight: 12 });
  });

  it("derives achieved rate from the monotonic clock, not from the configured rate", () => {
    // The whole point of the number is to show when configured and achieved
    // disagree, so it must never be computed from configuration.
    const monotonic = manualMonotonicClock(0);
    const metrics = createMetrics(CONTEXT, monotonic);

    for (let i = 0; i < 30; i += 1) {
      metrics.recordReadingAttempted("A");
      metrics.recordRequestSent();
    }
    monotonic.advance(10_000);

    const snapshot = metrics.snapshot();
    expect(snapshot.uptimeMs).toBe(10_000);
    expect(snapshot.achievedReadingsPerSecond).toBe(3);
    expect(snapshot.configuredHz).toBe(1);
  });

  it("counts retries toward the achieved request rate but not the reading rate", () => {
    const monotonic = manualMonotonicClock(0);
    const metrics = createMetrics(CONTEXT, monotonic);

    metrics.recordReadingAttempted("A");
    metrics.recordRequestSent();
    metrics.recordRetrySent();
    monotonic.advance(1000);

    expect(metrics.snapshot()).toMatchObject({
      achievedReadingsPerSecond: 1,
      achievedRequestsPerSecond: 2,
    });
  });

  it("reports zero rates rather than dividing by zero at startup", () => {
    const metrics = createMetrics(CONTEXT, manualMonotonicClock(0));
    metrics.recordReadingAttempted("A");

    expect(metrics.snapshot().achievedReadingsPerSecond).toBe(0);
  });

  it("distinguishes shed and coalesced work, which have different causes", () => {
    // Skipped means the robot's previous send was still outstanding; coalesced
    // means the process itself woke late. Attributing one to the other would
    // point a measurement at the wrong layer.
    const metrics = createMetrics(CONTEXT, manualMonotonicClock(0));
    metrics.recordSkippedOverdue(2);
    metrics.recordCoalescedOverdue(5);

    expect(metrics.snapshot()).toMatchObject({ skippedOverdue: 2, coalescedOverdue: 5 });
  });

  it("returns an immutable vendor breakdown per snapshot", () => {
    const metrics = createMetrics(CONTEXT, manualMonotonicClock(0));
    const first = metrics.snapshot();
    metrics.recordReadingAttempted("B");

    expect(first.byVendor).toEqual({ A: 0, B: 0, C: 0 });
    expect(metrics.snapshot().byVendor).toEqual({ A: 0, B: 1, C: 0 });
  });
});

describe("createMemoryLogger", () => {
  it("records level, event and fields", () => {
    const logger = createMemoryLogger();
    logger.log("warn", "simulator.summary", { readingsAttempted: 3 });

    expect(logger.records).toEqual([
      { level: "warn", event: "simulator.summary", fields: { readingsAttempted: 3 } },
    ]);
  });
});

describe("sanitizeEndpoint", () => {
  it("strips credentials so a routine startup line cannot leak them", () => {
    expect(sanitizeEndpoint("http://user:hunter2@ingest.test:8080")).not.toContain("hunter2");
    expect(sanitizeEndpoint("http://user:hunter2@ingest.test:8080")).not.toContain("user");
  });

  it("passes a credential-free endpoint through", () => {
    expect(sanitizeEndpoint("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080/");
  });

  it("does not throw on an unparseable endpoint", () => {
    expect(sanitizeEndpoint("nonsense")).toBe("(unparseable endpoint)");
  });
});
