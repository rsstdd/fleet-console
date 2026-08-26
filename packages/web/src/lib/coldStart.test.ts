import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";
import type { FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { COLD_START_BUFFER_LIMIT, createColdStart } from "./coldStart";

/**
 * The ordering the server's TODO **H3b** says nothing else will catch: fetching before
 * opening loses every delta emitted in the gap, and the symptom is a row that quietly
 * stops updating rather than an error.
 */
describe("createColdStart", () => {
  const SESSION = "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b";
  const OTHER_SESSION = "01d3b5f7-9a2c-4e6d-8b0f-1a3c5e7d9b2f";

  function buildBatch(flushSequence: number, serverSessionId: string = SESSION): TelemetryBatch {
    return { schemaVersion: SCHEMA_VERSION, serverSessionId, flushSequence, sentAt: 0, robots: [] };
  }

  function buildSnapshot(flushSequence: number): FleetSnapshot {
    return {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: SESSION,
      flushSequence,
      capturedAt: 0,
      sites: [],
      robots: [],
    };
  }

  it("reports an overflow rather than growing while a snapshot never lands", () => {
    const coldStart = createColdStart();
    for (let sequence = 1; sequence <= COLD_START_BUFFER_LIMIT; sequence += 1) {
      expect(coldStart.receive(buildBatch(sequence))).toBe("buffered");
    }

    expect(coldStart.receive(buildBatch(COLD_START_BUFFER_LIMIT + 1))).toBe("overflowed");
  });

  it("keeps an overflowed frame out of the replay rather than replaying a gap", () => {
    // A buffer that dropped a frame can no longer claim its replay is complete, and a
    // partial replay is the silent row-freeze this module exists to prevent. The caller
    // abandons the attempt on the receipt above; this pins what the buffer itself did.
    const coldStart = createColdStart();
    for (let sequence = 1; sequence <= COLD_START_BUFFER_LIMIT + 1; sequence += 1) {
      coldStart.receive(buildBatch(sequence));
    }

    expect(coldStart.settle(buildSnapshot(0)).replay).toHaveLength(COLD_START_BUFFER_LIMIT);
  });

  it("keeps a frame that arrived while the snapshot was in flight", () => {
    // The whole point. Flush 4 happened after the snapshot was captured at 3, so it is
    // not in the snapshot and is the console's only copy of that change.
    const coldStart = createColdStart();
    coldStart.receive(buildBatch(4));

    const settled = coldStart.settle(buildSnapshot(3));

    expect(settled.replay.map((frame) => frame.flushSequence)).toStrictEqual([4]);
    expect(settled.discarded).toBe(0);
    expect(settled.mismatched).toBe(0);
  });

  it("refuses a buffered frame from a different server runtime", () => {
    // ADR 31: a sequence comparison across sessions is meaningless, so a mismatched
    // frame is never replayed — however plausible its number — and the count tells the
    // transport the socket disagrees with the snapshot.
    const coldStart = createColdStart();
    coldStart.receive(buildBatch(99, OTHER_SESSION));
    coldStart.receive(buildBatch(4));

    const settled = coldStart.settle(buildSnapshot(3));

    expect(settled.replay.map((frame) => frame.flushSequence)).toStrictEqual([4]);
    expect(settled.mismatched).toBe(1);
    expect(settled.discarded).toBe(0);
  });

  it("discards a frame the snapshot already reflects", () => {
    // At-or-below is redundant: the snapshot reflects every flush up to its own sequence,
    // so replaying flush 3 would re-apply state the snapshot already carries.
    const coldStart = createColdStart();
    coldStart.receive(buildBatch(2));
    coldStart.receive(buildBatch(3));

    const settled = coldStart.settle(buildSnapshot(3));

    expect(settled.replay).toHaveLength(0);
    expect(settled.discarded).toBe(2);
  });

  it("replays surviving frames oldest first", () => {
    // Each frame is a keyed replace, so applying 6 before 5 would leave the older state
    // winning for any robot present in both.
    const coldStart = createColdStart();
    coldStart.receive(buildBatch(5));
    coldStart.receive(buildBatch(6));

    expect(
      coldStart.settle(buildSnapshot(4)).replay.map((frame) => frame.flushSequence),
    ).toStrictEqual([5, 6]);
  });

  it("refuses a frame once settled rather than swallowing it", () => {
    // The buffer's job ends at settle, and a caller still handing it frames is routing
    // live telemetry into something that will never drain again.
    const coldStart = createColdStart();
    coldStart.settle(buildSnapshot(1));

    expect(() => {
      coldStart.receive(buildBatch(2));
    }).toThrow(/already settled/);
  });

  it("keeps everything when the server has never flushed", () => {
    // A cold server reports sequence 0, and zero must discard nothing.
    const coldStart = createColdStart();
    coldStart.receive(buildBatch(1));

    expect(coldStart.settle(buildSnapshot(0)).replay).toHaveLength(1);
  });

  it("refuses a second snapshot rather than silently replaying applied frames", () => {
    const coldStart = createColdStart();
    coldStart.settle(buildSnapshot(1));

    expect(() => coldStart.settle(buildSnapshot(2))).toThrow(/already settled/);
  });
});
