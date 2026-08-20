import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";
import type { FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { createColdStart } from "./coldStart";

/**
 * The ordering the server's TODO **H3b** says nothing else will catch: fetching before
 * opening loses every delta emitted in the gap, and the symptom is a row that quietly
 * stops updating rather than an error.
 */
describe("createColdStart", () => {
  function batch(flushSequence: number): TelemetryBatch {
    return { schemaVersion: SCHEMA_VERSION, flushSequence, sentAt: 0, robots: [] };
  }

  function snapshot(flushSequence: number): FleetSnapshot {
    return { schemaVersion: SCHEMA_VERSION, flushSequence, capturedAt: 0, robots: [] };
  }

  it("keeps a frame that arrived while the snapshot was in flight", () => {
    // The whole point. Flush 4 happened after the snapshot was captured at 3, so it is
    // not in the snapshot and is the console's only copy of that change.
    const coldStart = createColdStart();
    expect(coldStart.receive(batch(4))).toBe("buffered");

    const settled = coldStart.settle(snapshot(3));

    expect(settled.replay.map((frame) => frame.flushSequence)).toStrictEqual([4]);
    expect(settled.discarded).toBe(0);
  });

  it("discards a frame the snapshot already reflects", () => {
    // At-or-below is redundant: the snapshot reflects every flush up to its own sequence,
    // so replaying flush 3 would re-apply state the snapshot already carries.
    const coldStart = createColdStart();
    coldStart.receive(batch(2));
    coldStart.receive(batch(3));

    const settled = coldStart.settle(snapshot(3));

    expect(settled.replay).toHaveLength(0);
    expect(settled.discarded).toBe(2);
  });

  it("replays surviving frames oldest first", () => {
    // Each frame is a keyed replace, so applying 6 before 5 would leave the older state
    // winning for any robot present in both.
    const coldStart = createColdStart();
    coldStart.receive(batch(5));
    coldStart.receive(batch(6));

    expect(coldStart.settle(snapshot(4)).replay.map((f) => f.flushSequence)).toStrictEqual([5, 6]);
  });

  it("passes frames straight through once settled", () => {
    // Buffering after the snapshot lands would grow a second buffer nothing drains.
    const coldStart = createColdStart();
    coldStart.settle(snapshot(1));

    expect(coldStart.receive(batch(2))).toBe("live");
    expect(coldStart.isSettled).toBe(true);
  });

  it("keeps everything when the server has never flushed", () => {
    // A cold server reports sequence 0, and zero must discard nothing.
    const coldStart = createColdStart();
    coldStart.receive(batch(1));

    expect(coldStart.settle(snapshot(0)).replay).toHaveLength(1);
  });

  it("refuses a second snapshot rather than silently replaying applied frames", () => {
    const coldStart = createColdStart();
    coldStart.settle(snapshot(1));

    expect(() => coldStart.settle(snapshot(2))).toThrow(/already settled/);
  });
});
