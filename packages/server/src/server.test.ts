import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type CanonicalEnvelope } from "@fleet/contracts";
import { createAdapterRegistry } from "./adapters/registry.ts";
import type { FreshnessPolicy } from "./config.ts";
import { DeltaFanOut, type FanOutClient } from "./fanout.ts";
import { FreshnessSweep } from "./freshness.ts";
import { createHealthCounters, ingestTelemetry } from "./ingest.ts";
import { manualClock, silentLogger } from "./runtime.ts";
import { CurrentStateStore } from "./store.ts";

const SESSION = "3f1a5d2c-8b7e-4c9a-9f2d-6e5b4a3c2d1e";
const POLICY: FreshnessPolicy = {
  liveThresholdMs: 2000,
  staleThresholdMs: 10_000,
  sweepIntervalMs: 500,
  lateTickToleranceMs: 100,
};
const MANIFEST = [
  { robotId: "R-001", siteId: "SITE-NORTH", vendorId: "A", model: "AX-200" },
  { robotId: "R-002", siteId: "SITE-NORTH", vendorId: "B", model: "BR-11" },
];

function envelope(overrides: Partial<CanonicalEnvelope> = {}): CanonicalEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    robotId: "R-001",
    siteId: "SITE-NORTH",
    vendorId: "A",
    model: "AX-200",
    adapterId: "vendor-a",
    adapterVersion: "1.0.0",
    reportedAt: 1000,
    receivedAt: 1000,
    freshness: "live",
    capabilities: { sequence: { value: 1 } },
    core: {
      connectivity: "unknown",
      batteryPercent: 80,
      position: { frame: "SITE-NORTH", x: 0, y: 0 },
      status: "busy",
      health: { severity: "nominal" },
    },
    ...overrides,
  };
}

describe("CurrentStateStore", () => {
  it("lists every manifest robot as unknown before any telemetry arrives", () => {
    const store = new CurrentStateStore(MANIFEST);
    expect(store.list()).toHaveLength(2);
    expect(store.list().every((robot) => robot.freshness === "unknown")).toBe(true);
    expect(store.observed()).toHaveLength(0);
  });

  it("refuses telemetry for a robot that is not on the roster", () => {
    const store = new CurrentStateStore(MANIFEST);
    expect(() => store.upsert(envelope({ robotId: "R-999" }), null, 1)).toThrow();
  });

  it("refuses telemetry whose identity contradicts the manifest", () => {
    const store = new CurrentStateStore(MANIFEST);
    expect(() => store.upsert(envelope({ vendorId: "C" }), null, 1)).toThrow();
  });

  it("counts a repeated sequence as a duplicate and does not overwrite state", () => {
    const store = new CurrentStateStore(MANIFEST);
    store.upsert(envelope({ core: { ...envelope().core, batteryPercent: 80 } }), null, 1);
    const result = store.upsert(
      envelope({ core: { ...envelope().core, batteryPercent: 10 } }),
      null,
      1,
    );

    expect(result.kind).toBe("duplicate");
    const health = store.sequenceHealth("R-001");
    expect(health?.evaluated === true && health.duplicates).toBe(1);
    const current = store.get("R-001");
    expect(current !== undefined && "core" in current && current.core.batteryPercent).toBe(80);
  });

  it("counts a skipped sequence as a gap", () => {
    const store = new CurrentStateStore(MANIFEST);
    store.upsert(envelope(), null, 1);
    store.upsert(envelope(), null, 4);
    const health = store.sequenceHealth("R-001");
    expect(health?.evaluated === true && health.gaps).toBe(2);
  });

  it("reports continuity as unevaluated for a vendor that sends no sequence", () => {
    const store = new CurrentStateStore(MANIFEST);
    store.upsert(envelope({ robotId: "R-002", vendorId: "B", capabilities: {} }), null, null);
    expect(store.sequenceHealth("R-002")).toEqual({ evaluated: false });
  });
});

describe("FreshnessSweep", () => {
  it("degrades a silent robot without any further telemetry arriving", () => {
    const clock = manualClock(1000);
    const store = new CurrentStateStore(MANIFEST);
    const marked: string[] = [];
    store.upsert(envelope({ receivedAt: 1000 }), null, 1);

    const sweep = new FreshnessSweep({
      clock,
      store,
      policy: POLICY,
      deltas: { mark: (robotId) => marked.push(robotId) },
    });

    clock.advance(3000);
    sweep.tick();
    expect(store.get("R-001")?.freshness).toBe("stale");

    clock.advance(9000);
    sweep.tick();
    expect(store.get("R-001")?.freshness).toBe("unreachable");
    expect(marked).toEqual(["R-001", "R-001"]);
  });

  it("emits no delta when freshness has not changed", () => {
    const clock = manualClock(1000);
    const store = new CurrentStateStore(MANIFEST);
    const marked: string[] = [];
    store.upsert(envelope({ receivedAt: 1000 }), null, 1);

    const sweep = new FreshnessSweep({
      clock,
      store,
      policy: POLICY,
      deltas: { mark: (robotId) => marked.push(robotId) },
    });
    sweep.tick();
    sweep.tick();
    expect(marked).toEqual([]);
  });
});

describe("DeltaFanOut", () => {
  function client(): FanOutClient & { frames: string[] } {
    const frames: string[] = [];
    return { frames, send: (frame) => frames.push(frame), close: () => undefined };
  }

  it("coalesces repeated changes to one robot into the latest state", () => {
    const fanOut = new DeltaFanOut({ clock: manualClock(5000), serverSessionId: SESSION });
    const subscriber = client();
    fanOut.add(subscriber);

    fanOut.mark("R-001", envelope({ core: { ...envelope().core, batteryPercent: 80 } }));
    fanOut.mark("R-001", envelope({ core: { ...envelope().core, batteryPercent: 60 } }));
    fanOut.flush();

    expect(subscriber.frames).toHaveLength(1);
    const frame = JSON.parse(subscriber.frames[0] ?? "{}") as {
      robots: { core: { batteryPercent: number } }[];
      flushSequence: number;
    };
    expect(frame.robots).toHaveLength(1);
    expect(frame.robots[0]?.core.batteryPercent).toBe(60);
    expect(frame.flushSequence).toBe(1);
  });

  it("sends nothing when no robot changed", () => {
    const fanOut = new DeltaFanOut({ clock: manualClock(5000), serverSessionId: SESSION });
    const subscriber = client();
    fanOut.add(subscriber);
    fanOut.flush();
    expect(subscriber.frames).toHaveLength(0);
    expect(fanOut.flushSequence).toBe(0);
  });
});

describe("ingestTelemetry", () => {
  function harness() {
    const clock = manualClock(5000);
    const store = new CurrentStateStore(MANIFEST);
    const marked: string[] = [];
    const health = createHealthCounters();
    return {
      clock,
      store,
      marked,
      health,
      dependencies: {
        registry: createAdapterRegistry(),
        store,
        deltas: { mark: (robotId: string) => marked.push(robotId) },
        health,
        logger: silentLogger,
        clock,
        policy: POLICY,
      },
    };
  }

  const payload = {
    robot_id: "R-001",
    site: "SITE-NORTH",
    model: "AX-200",
    seq: 1,
    timestamp: "2026-08-26T10:00:00.000Z",
    telemetry: {
      battery: { level: 0.5 },
      pose: { x_m: 0, y_m: 0, heading_deg: 0 },
      state: "idle",
      health: { level: "nominal" },
      dock: { docked: false, dock_id: null },
      lidar: { rpm: 600, fault: false },
    },
  };

  it("stamps freshness on arrival and marks the robot for fan-out", () => {
    const { dependencies, store, marked } = harness();
    const outcome = ingestTelemetry(dependencies, "A", payload);

    expect(outcome.ok).toBe(true);
    expect(store.get("R-001")?.freshness).toBe("live");
    expect(marked).toEqual(["R-001"]);
  });

  it("retains the raw payload verbatim for the technician view", () => {
    const { dependencies, store } = harness();
    ingestTelemetry(dependencies, "A", payload);
    expect(store.rawPayload("R-001")).toEqual(payload);
  });

  it("rejects a malformed payload and counts it against the adapter", () => {
    const { dependencies, health, marked } = harness();
    const outcome = ingestTelemetry(dependencies, "A", { ...payload, robot_id: 7 });

    expect(outcome.ok).toBe(false);
    expect(marked).toEqual([]);
    expect(health.snapshot().malformedIngest).toBe(1);
    expect(health.snapshot().adapterFailures.A).toBe(1);
  });
});
