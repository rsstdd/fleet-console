import { type CanonicalEnvelope, SCHEMA_VERSION } from "@fleet/contracts";
import { describe, expect, it, vi } from "vitest";

import { PendingDeltaSet } from "../fanout/pendingDeltas.ts";
import { manualClock } from "../runtime/clock.ts";
import { CurrentStateStore, type ManifestRobot } from "../state/currentStateStore.ts";
import { FreshnessSweep } from "./freshnessSweep.ts";

const ROBOT: ManifestRobot = { robotId: "R-001", siteId: "site-a", vendorId: "A", model: "M1" };

function envelope(): CanonicalEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    ...ROBOT,
    adapterId: "adapter-a",
    adapterVersion: "1.0.0",
    reportedAt: 990,
    receivedAt: 1_000,
    core: {
      connectivity: "online",
      batteryPercent: 50,
      position: null,
      status: "idle",
      health: { severity: "nominal" },
    },
    capabilities: {},
    freshness: "live",
  };
}

describe("FreshnessSweep", () => {
  it("marks a freshness-only transition as a pending delta", () => {
    const clock = manualClock(1_000);
    const store = new CurrentStateStore([ROBOT], 3);
    store.upsert(envelope(), {}, null);
    const deltas = new PendingDeltaSet<CanonicalEnvelope>();
    const sweep = new FreshnessSweep({
      clock,
      store,
      deltas,
      policy: {
        liveThresholdMs: 2_000,
        staleThresholdMs: 10_000,
        sweepIntervalMs: 500,
        lateTickToleranceMs: 100,
      },
    });

    clock.advance(2_001);
    sweep.tick();

    expect(store.get(ROBOT.robotId)).toMatchObject({ freshness: "stale", reportedAt: 990 });
    expect(deltas.drain().get(ROBOT.robotId)).toMatchObject({ freshness: "stale" });
  });

  it("counts late ticks and stops its interval explicitly", () => {
    const clock = manualClock(1_000);
    const onLateTick = vi.fn();
    const sweep = new FreshnessSweep({
      clock,
      store: new CurrentStateStore([ROBOT], 3),
      deltas: new PendingDeltaSet<CanonicalEnvelope>(),
      policy: {
        liveThresholdMs: 2_000,
        staleThresholdMs: 10_000,
        sweepIntervalMs: 500,
        lateTickToleranceMs: 100,
      },
      onLateTick,
    });

    sweep.tick();
    clock.advance(601);
    sweep.tick();
    expect(onLateTick).toHaveBeenCalledWith(101);

    sweep.start();
    expect(sweep.isRunning).toBe(true);
    sweep.stop();
    expect(sweep.isRunning).toBe(false);
  });
});
