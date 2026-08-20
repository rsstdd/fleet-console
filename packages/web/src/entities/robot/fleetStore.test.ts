import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";
import type { CanonicalEnvelope, FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { createFleetStore } from "./fleetStore";

/**
 * The store applies whole robots and derives nothing. What these cases guard is the two
 * ways that could quietly stop being true: a merge creeping in where a replace belongs,
 * and a subscriber woken per message rather than per frame.
 */
describe("createFleetStore", () => {
  /** Runs scheduled notifications immediately, so a test needs no frame. */
  const immediate = (notify: () => void): void => {
    notify();
  };

  function envelope(robotId: string, over: Partial<CanonicalEnvelope> = {}): CanonicalEnvelope {
    return {
      schemaVersion: SCHEMA_VERSION,
      robotId,
      siteId: "site-a",
      vendorId: "A",
      model: "sweeper",
      adapterId: "vendor-a",
      adapterVersion: "1.0.0",
      reportedAt: 1_755_600_000_000,
      receivedAt: 1_755_600_000_100,
      freshness: "live",
      core: {
        connectivity: "unknown",
        batteryPercent: 50,
        position: null,
        status: "idle",
        health: { severity: "nominal" },
      },
      capabilities: {},
      ...over,
    };
  }

  function snapshot(robots: FleetSnapshot["robots"]): FleetSnapshot {
    return { schemaVersion: SCHEMA_VERSION, flushSequence: 0, capturedAt: 0, robots };
  }

  function batch(robots: CanonicalEnvelope[]): TelemetryBatch {
    return { schemaVersion: SCHEMA_VERSION, flushSequence: 1, sentAt: 0, robots };
  }

  it("seeds both populations from a snapshot", () => {
    const store = createFleetStore(immediate);

    store.applySnapshot(
      snapshot([
        envelope("rbt-1"),
        {
          schemaVersion: SCHEMA_VERSION,
          robotId: "rbt-2",
          siteId: "site-a",
          vendorId: "B",
          freshness: "unknown",
        },
      ]),
    );

    expect(store.getRobots().map((robot) => robot.id)).toStrictEqual(["rbt-1", "rbt-2"]);
    // A registered robot has no health rather than a fabricated `nominal` (Principle 4).
    expect(store.getRobot("rbt-2")?.health).toBeNull();
  });

  it("replaces a robot whole rather than merging fields into it", () => {
    // ADR 18 keeps granularity at the robot level; a merge would make partial application
    // a possible state and this store a merge engine.
    const store = createFleetStore(immediate);
    store.applySnapshot(snapshot([envelope("rbt-1")]));

    store.applyBatch(
      batch([
        envelope("rbt-1", {
          freshness: "stale",
          core: { ...envelope("rbt-1").core, batteryPercent: 11 },
        }),
      ]),
    );

    // Every field comes from the new envelope, including the ones the frame did not
    // "change" — that is what makes a re-ordered or duplicated frame harmless.
    expect(store.getRobot("rbt-1")).toMatchObject({ freshness: "stale", batteryPercent: 11 });
  });

  it("drops a robot the snapshot no longer carries", () => {
    // A robot that left the manifest must not survive as a stale row.
    const store = createFleetStore(immediate);
    store.applySnapshot(snapshot([envelope("rbt-1"), envelope("rbt-2")]));

    store.applySnapshot(snapshot([envelope("rbt-2")]));

    expect(store.getRobots().map((robot) => robot.id)).toStrictEqual(["rbt-2"]);
  });

  it("returns the same array until something changes", () => {
    // useSyncExternalStore compares by identity, so a fresh array every call is an infinite
    // render loop rather than a performance note.
    const store = createFleetStore(immediate);
    store.applySnapshot(snapshot([envelope("rbt-1")]));

    const first = store.getRobots();
    expect(store.getRobots()).toBe(first);

    store.applyBatch(batch([envelope("rbt-1", { freshness: "stale" })]));
    expect(store.getRobots()).not.toBe(first);
  });

  it("wakes subscribers once per frame, not once per message", () => {
    // The bound is on how often subscribers are woken. Application itself stays
    // synchronous, so the store never lies about what it already knows.
    const pending: (() => void)[] = [];
    const store = createFleetStore((notify) => pending.push(notify));
    let woken = 0;
    store.subscribe(() => {
      woken += 1;
    });

    store.applyBatch(batch([envelope("rbt-1")]));
    store.applyBatch(batch([envelope("rbt-2")]));
    expect(woken).toBe(0);
    expect(store.getRobots()).toHaveLength(2);

    for (const notify of pending.splice(0)) notify();
    expect(woken).toBe(1);
  });

  it("ignores an empty frame rather than waking every subscriber for nothing", () => {
    const store = createFleetStore(immediate);
    let woken = 0;
    store.subscribe(() => {
      woken += 1;
    });

    store.applyBatch(batch([]));

    expect(woken).toBe(0);
  });

  it("stops notifying an unsubscribed listener", () => {
    const store = createFleetStore(immediate);
    let woken = 0;
    const unsubscribe = store.subscribe(() => {
      woken += 1;
    });

    unsubscribe();
    store.applyBatch(batch([envelope("rbt-1")]));

    expect(woken).toBe(0);
  });
});
