import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, type CanonicalEnvelope, type FleetSnapshot } from "@fleet/contracts";
import { createFleetStore } from "@/stores/fleetStore";

const SESSION = "3f1a5d2c-8b7e-4c9a-9f2d-6e5b4a3c2d1e";

const observed = (robotId: string, batteryPercent: number): CanonicalEnvelope => ({
  schemaVersion: SCHEMA_VERSION,
  robotId,
  siteId: "SITE-NORTH",
  vendorId: "A",
  model: "AX-200",
  adapterId: "vendor-a",
  adapterVersion: "1.0.0",
  reportedAt: 1000,
  receivedAt: 1000,
  freshness: "live",
  capabilities: {},
  core: {
    connectivity: "unknown",
    batteryPercent,
    position: null,
    status: "busy",
    health: { severity: "nominal" },
  },
});

const snapshot: FleetSnapshot = {
  schemaVersion: SCHEMA_VERSION,
  serverSessionId: SESSION,
  flushSequence: 1,
  capturedAt: 1000,
  sites: [{ siteId: "SITE-NORTH", label: "North site" }],
  robots: [
    observed("R-010", 50),
    observed("R-002", 90),
    {
      schemaVersion: SCHEMA_VERSION,
      robotId: "R-001",
      siteId: "SITE-NORTH",
      vendorId: "B",
      freshness: "unknown",
    },
  ],
};

const inline = (notify: () => void): void => {
  notify();
};

describe("fleet store", () => {
  it("orders robots numerically, not lexically", () => {
    const store = createFleetStore(inline);
    store.applySnapshot(snapshot);
    const state = store.getState();
    expect(state.kind === "ready" && state.data.robots.map((robot) => robot.id)).toEqual([
      "R-001",
      "R-002",
      "R-010",
    ]);
  });

  it("marks a roster robot that has never reported as unobserved", () => {
    const store = createFleetStore(inline);
    store.applySnapshot(snapshot);
    expect(store.getRobot("R-001")?.observed).toBe(false);
    expect(store.getRobot("R-001")?.freshness).toBe("unknown");
  });

  it("applies a delta over the snapshot without disturbing other rows", () => {
    const store = createFleetStore(inline);
    store.applySnapshot(snapshot);
    store.applyBatch({
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: SESSION,
      flushSequence: 2,
      sentAt: 2000,
      robots: [observed("R-002", 12)],
    });

    expect(store.getRobot("R-002")?.batteryPercent).toBe(12);
    expect(store.getRobot("R-010")?.batteryPercent).toBe(50);
  });

  it("keeps the last known fleet visible through a recoverable failure", () => {
    const store = createFleetStore(inline);
    store.applySnapshot(snapshot);
    store.recoverableFailure("disconnected");

    const state = store.getState();
    expect(state.kind).toBe("recoverable-error");
    expect(state.kind === "recoverable-error" && state.data?.robots).toHaveLength(3);
  });

  it("notifies subscribers once per applied frame", () => {
    const store = createFleetStore(inline);
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });
    store.applySnapshot(snapshot);
    expect(notifications).toBe(1);
  });
});
