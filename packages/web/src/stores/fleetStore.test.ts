import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";
import type { CanonicalEnvelope, FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { createFleetStore, type FleetData } from "./fleetStore";

/**
 * The store applies whole robots, owns the resource-state machine, and derives
 * nothing. These cases guard the ways that could quietly stop being true: a
 * merge creeping in where a replace belongs, a subscriber woken per message
 * rather than per frame, an error state that blanks retained rows, and
 * provenance invented rather than copied off the wire.
 */
describe("createFleetStore", () => {
  /** Runs scheduled notifications immediately, so a test needs no frame. */
  const scheduleImmediately = (notify: () => void): void => {
    notify();
  };

  const handleNoRetry = (): void => {};

  function buildEnvelope(
    robotId: string,
    over: Partial<CanonicalEnvelope> = {},
  ): CanonicalEnvelope {
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

  function buildSnapshot(
    robots: FleetSnapshot["robots"],
    over: Partial<FleetSnapshot> = {},
  ): FleetSnapshot {
    return {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence: 0,
      capturedAt: 1_755_600_000_000,
      sites: [{ siteId: "site-a", label: "Site A" }],
      robots,
      ...over,
    };
  }

  function buildBatch(robots: CanonicalEnvelope[], sentAt = 1_755_600_000_500): TelemetryBatch {
    return {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence: 1,
      sentAt,
      robots,
    };
  }

  /** Narrows to the data-bearing states, failing loudly on the rest. */
  function getFleetData(store: ReturnType<typeof createFleetStore>): FleetData {
    const state = store.getState();
    if (!("data" in state) || state.data === null) {
      throw new Error(`expected data-bearing state, got ${state.kind}`);
    }
    return state.data;
  }

  it("starts loading: nothing is known until a snapshot is applied", () => {
    expect(createFleetStore(scheduleImmediately).getState()).toStrictEqual({ kind: "loading" });
  });

  it("seeds both populations from a snapshot and becomes ready", () => {
    const store = createFleetStore(scheduleImmediately);

    store.applySnapshot(
      buildSnapshot([
        buildEnvelope("rbt-1"),
        {
          schemaVersion: SCHEMA_VERSION,
          robotId: "rbt-2",
          siteId: "site-a",
          vendorId: "B",
          freshness: "unknown",
        },
      ]),
    );

    expect(store.getState().kind).toBe("ready");
    expect(getFleetData(store).robots.map((robot) => robot.id)).toStrictEqual(["rbt-1", "rbt-2"]);
    // A registered robot has no health rather than a fabricated `nominal` (Principle 4).
    expect(store.getRobot("rbt-2")?.health).toBeNull();
  });

  it("carries the snapshot's site directory and capture instant, never inventing either", () => {
    // Provenance is decoded, not derived: the plate renders what the server
    // stamped (Principle 4, ADR 34).
    const store = createFleetStore(scheduleImmediately);

    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")], { capturedAt: 1_755_601_234_000 }));

    const data = getFleetData(store);
    expect(data.sites).toStrictEqual([{ siteId: "site-a", label: "Site A" }]);
    expect(data.capturedAt).toBe(1_755_601_234_000);
    expect(data.latestFrameAt).toBeNull();
  });

  it("tracks the latest applied frame's sentAt as stream provenance", () => {
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));

    store.applyBatch(buildBatch([buildEnvelope("rbt-1")], 1_755_600_000_900));

    expect(getFleetData(store).latestFrameAt).toBe(1_755_600_000_900);
  });

  it("resets stream provenance on a new snapshot, which is a new epoch", () => {
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));
    store.applyBatch(buildBatch([buildEnvelope("rbt-1")]));

    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));

    expect(getFleetData(store).latestFrameAt).toBeNull();
  });

  it("shows loading, not refreshing, when an attempt starts with nothing retained", () => {
    const store = createFleetStore(scheduleImmediately);

    store.snapshotStart();

    expect(store.getState()).toStrictEqual({ kind: "loading" });
  });

  it("shows refreshing over retained rows when an attempt starts after a snapshot", () => {
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));

    store.snapshotStart();

    const state = store.getState();
    expect(state.kind).toBe("refreshing");
    expect(getFleetData(store).robots).toHaveLength(1);
  });

  it("retains rows through a recoverable failure and exposes the given retry", () => {
    // Last-known rows beat no rows; only the recoverable state offers retry
    // (Principle 4, Principle 5).
    let retried = 0;
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));

    store.recoverableFailure({ cause: "handshake-exhausted" }, () => {
      retried += 1;
    });

    const state = store.getState();
    if (state.kind !== "recoverable-error") throw new Error(`unexpected ${state.kind}`);
    expect(state.data?.robots).toHaveLength(1);
    expect(state.failure.cause).toBe("handshake-exhausted");
    state.retry();
    expect(retried).toBe(1);
  });

  it("reports a first-load recoverable failure with nothing retained", () => {
    const store = createFleetStore(scheduleImmediately);
    store.snapshotStart();

    store.recoverableFailure({ cause: "handshake-exhausted" }, handleNoRetry);

    const state = store.getState();
    if (state.kind !== "recoverable-error") throw new Error(`unexpected ${state.kind}`);
    expect(state.data).toBeNull();
  });

  it("retains rows through a terminal contract failure and carries the issues", () => {
    // Terminal by decision: retrying returns the same bytes, so no retry is
    // exposed, and the issues carry path and code only (ADR 20).
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));

    store.terminalFailure([
      { path: "robots.0.siteId", code: "custom", message: "robot references undefined site" },
    ]);

    const state = store.getState();
    if (state.kind !== "terminal-error") throw new Error(`unexpected ${state.kind}`);
    expect(state.data?.robots).toHaveLength(1);
    expect(state.issues).toStrictEqual([
      { path: "robots.0.siteId", code: "custom", message: "robot references undefined site" },
    ]);
    expect("retry" in state).toBe(false);
  });

  it("recovers from a failure state when a later snapshot settles", () => {
    const store = createFleetStore(scheduleImmediately);
    store.recoverableFailure({ cause: "handshake-exhausted" }, handleNoRetry);

    store.snapshotStart();
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));

    expect(store.getState().kind).toBe("ready");
  });

  it("replaces a robot whole rather than merging fields into it", () => {
    // ADR 18 keeps granularity at the robot level; a merge would make partial application
    // a possible state and this store a merge engine.
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));

    store.applyBatch(
      buildBatch([
        buildEnvelope("rbt-1", {
          freshness: "stale",
          core: { ...buildEnvelope("rbt-1").core, batteryPercent: 11 },
        }),
      ]),
    );

    // Every field comes from the new envelope, including the ones the frame did not
    // "change" — that is what makes a re-ordered or duplicated frame harmless.
    expect(store.getRobot("rbt-1")).toMatchObject({ freshness: "stale", batteryPercent: 11 });
  });

  it("keeps an unrelated robot's identity across a frame, for per-id subscribers", () => {
    // `useFleetRobot` bails out on identity; a frame naming rbt-2 must not
    // produce a new rbt-1 object or robot detail re-renders for every delta.
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1"), buildEnvelope("rbt-2")]));
    const before = store.getRobot("rbt-1");

    store.applyBatch(buildBatch([buildEnvelope("rbt-2", { freshness: "stale" })]));

    expect(store.getRobot("rbt-1")).toBe(before);
  });

  it("drops a robot the snapshot no longer carries", () => {
    // A robot that left the manifest must not survive as a stale row.
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1"), buildEnvelope("rbt-2")]));

    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-2")]));

    expect(getFleetData(store).robots.map((robot) => robot.id)).toStrictEqual(["rbt-2"]);
  });

  it("lists a snapshot's robots in id order, whatever order they arrived in", () => {
    const store = createFleetStore(scheduleImmediately);

    store.applySnapshot(
      buildSnapshot([buildEnvelope("rbt-3"), buildEnvelope("rbt-1"), buildEnvelope("rbt-2")]),
    );

    expect(getFleetData(store).robots.map((robot) => robot.id)).toStrictEqual([
      "rbt-1",
      "rbt-2",
      "rbt-3",
    ]);
  });

  it("places a robot that joins on a frame in id order rather than at the end", () => {
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1"), buildEnvelope("rbt-3")]));

    store.applyBatch(buildBatch([buildEnvelope("rbt-2")]));

    expect(getFleetData(store).robots.map((robot) => robot.id)).toStrictEqual([
      "rbt-1",
      "rbt-2",
      "rbt-3",
    ]);
  });

  it("leaves order and untouched rows alone when a frame only replaces robots", () => {
    // Ordering is restored on membership change, not per frame: the hot path at scale
    // is a keyed replace, and it must not rebuild rows it did not name.
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(
      buildSnapshot([buildEnvelope("rbt-1"), buildEnvelope("rbt-2"), buildEnvelope("rbt-3")]),
    );
    const untouched = store.getRobot("rbt-3");

    store.applyBatch(buildBatch([buildEnvelope("rbt-2", { freshness: "stale" })]));

    expect(getFleetData(store).robots.map((robot) => robot.id)).toStrictEqual([
      "rbt-1",
      "rbt-2",
      "rbt-3",
    ]);
    expect(store.getRobot("rbt-3")).toBe(untouched);
  });

  it("returns the same state object until something changes", () => {
    // useSyncExternalStore compares by identity, so a fresh object every call is an
    // infinite render loop rather than a performance note.
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));

    const first = store.getState();
    expect(store.getState()).toBe(first);

    store.applyBatch(buildBatch([buildEnvelope("rbt-1", { freshness: "stale" })]));
    expect(store.getState()).not.toBe(first);
  });

  it("wakes subscribers once per frame, not once per message", () => {
    // The bound is on how often subscribers are woken. Application itself stays
    // synchronous, so the store never lies about what it already knows.
    const pending: (() => void)[] = [];
    const store = createFleetStore((notify) => pending.push(notify));
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1"), buildEnvelope("rbt-2")]));
    for (const notify of pending.splice(0)) notify();
    let woken = 0;
    store.subscribe(() => {
      woken += 1;
    });

    store.applyBatch(buildBatch([buildEnvelope("rbt-1", { freshness: "stale" })]));
    store.applyBatch(buildBatch([buildEnvelope("rbt-2", { freshness: "stale" })]));
    expect(woken).toBe(0);
    expect(store.getRobot("rbt-1")?.freshness).toBe("stale");
    expect(store.getRobot("rbt-2")?.freshness).toBe("stale");

    for (const notify of pending.splice(0)) notify();
    expect(woken).toBe(1);
  });

  it("ignores a frame that arrives before the snapshot it would belong to", () => {
    // The transport always snapshots before it streams. A frame reaching the store
    // first has no fleet to join, and applying it would leave `getRobot` answering
    // for a robot no resource state lists.
    const store = createFleetStore(scheduleImmediately);
    let woken = 0;
    store.subscribe(() => {
      woken += 1;
    });

    store.applyBatch(buildBatch([buildEnvelope("rbt-1")]));

    expect(store.getState()).toStrictEqual({ kind: "loading" });
    expect(store.getRobot("rbt-1")).toBeUndefined();
    expect(woken).toBe(0);
  });

  it("wakes subscribers once for a run of attempts that all mean refreshing", () => {
    // Reconnect backoff starts an attempt per retry (ADR 31); repeating a phase the
    // store is already in would re-render the fleet to show what is already there.
    const store = createFleetStore(scheduleImmediately);
    store.applySnapshot(buildSnapshot([buildEnvelope("rbt-1")]));
    let woken = 0;
    store.subscribe(() => {
      woken += 1;
    });

    store.snapshotStart();
    store.snapshotStart();
    store.snapshotStart();

    expect(store.getState().kind).toBe("refreshing");
    expect(woken).toBe(1);
  });

  it("stays silent when an attempt starts and the store is already loading", () => {
    const store = createFleetStore(scheduleImmediately);
    let woken = 0;
    store.subscribe(() => {
      woken += 1;
    });

    store.snapshotStart();

    expect(store.getState()).toStrictEqual({ kind: "loading" });
    expect(woken).toBe(0);
  });

  it("ignores an empty frame rather than waking every subscriber for nothing", () => {
    const store = createFleetStore(scheduleImmediately);
    let woken = 0;
    store.subscribe(() => {
      woken += 1;
    });

    store.applyBatch(buildBatch([]));

    expect(woken).toBe(0);
  });

  it("stops notifying an unsubscribed listener", () => {
    const store = createFleetStore(scheduleImmediately);
    let woken = 0;
    const unsubscribe = store.subscribe(() => {
      woken += 1;
    });

    unsubscribe();
    store.applyBatch(buildBatch([buildEnvelope("rbt-1")]));

    expect(woken).toBe(0);
  });
});
