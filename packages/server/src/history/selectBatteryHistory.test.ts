import { describe, expect, it } from "vitest";

import {
  BATTERY_HISTORY_MAX_POINTS,
  BATTERY_HISTORY_WINDOW_MS,
  parseRobotBatteryHistory,
} from "@fleet/contracts";

import type { BatteryHistorySample } from "../state/currentStateStore.ts";
import { selectBatteryHistory } from "./selectBatteryHistory.ts";

/** A capture instant far enough in that every in-window timestamp stays positive. */
const CAPTURED_AT = 1_700_000_120_000;

/** Builds `count` numeric samples evenly spaced over the window ending at `CAPTURED_AT`. */
function evenSamples(count: number, spacingMs: number): BatteryHistorySample[] {
  return Array.from({ length: count }, (_unused, index) => ({
    receivedAt: CAPTURED_AT - (count - 1 - index) * spacingMs,
    batteryPercent: index % 100,
  }));
}

function select(samples: readonly BatteryHistorySample[]) {
  return selectBatteryHistory({ robotId: "R-001", samples, capturedAt: CAPTURED_AT });
}

describe("selectBatteryHistory", () => {
  it("produces a response the contract parser accepts, at every tested size", () => {
    for (const count of [0, 1, 59, 60, 61, 500]) {
      const response = select(evenSamples(count, 90));
      const parsed = parseRobotBatteryHistory(JSON.parse(JSON.stringify(response)));
      expect(parsed.ok, `count=${String(count)}`).toBe(true);
    }
  });

  it("returns the empty response for a robot with no retained samples", () => {
    const response = select([]);

    expect(response).toMatchObject({
      robotId: "R-001",
      capturedAt: CAPTURED_AT,
      windowMs: BATTERY_HISTORY_WINDOW_MS,
      maxPoints: BATTERY_HISTORY_MAX_POINTS,
      sourceSampleCount: 0,
      missingBatterySampleCount: 0,
      points: [],
    });
  });

  it("filters to the preceding window, keeping the inclusive trailing edge", () => {
    const inWindow = { receivedAt: CAPTURED_AT - BATTERY_HISTORY_WINDOW_MS, batteryPercent: 40 };
    const outOfWindow = {
      receivedAt: CAPTURED_AT - BATTERY_HISTORY_WINDOW_MS - 1,
      batteryPercent: 90,
    };
    const response = select([outOfWindow, inWindow]);

    expect(response.sourceSampleCount).toBe(1);
    expect(response.points).toEqual([inWindow]);
  });

  it("counts null-battery samples without plotting them", () => {
    const response = select([
      { receivedAt: CAPTURED_AT - 2_000, batteryPercent: null },
      { receivedAt: CAPTURED_AT - 1_000, batteryPercent: 55 },
      { receivedAt: CAPTURED_AT, batteryPercent: null },
    ]);

    expect(response.sourceSampleCount).toBe(3);
    expect(response.missingBatterySampleCount).toBe(2);
    expect(response.points).toEqual([{ receivedAt: CAPTURED_AT - 1_000, batteryPercent: 55 }]);
  });

  it("returns a null-only window as counted samples with no points", () => {
    const response = select([
      { receivedAt: CAPTURED_AT - 1_000, batteryPercent: null },
      { receivedAt: CAPTURED_AT, batteryPercent: null },
    ]);

    expect(response.sourceSampleCount).toBe(2);
    expect(response.missingBatterySampleCount).toBe(2);
    expect(response.points).toEqual([]);
  });

  it("returns every numeric sample untouched at or below the point budget", () => {
    const samples = evenSamples(BATTERY_HISTORY_MAX_POINTS, 1_000);
    const response = select(samples);

    expect(response.points).toEqual(samples);
  });

  it("decimates above the budget, preserving the first and last numeric samples", () => {
    const samples = evenSamples(300, 200);
    const response = select(samples);

    expect(response.points.length).toBeLessThanOrEqual(BATTERY_HISTORY_MAX_POINTS);
    expect(response.points.length).toBeGreaterThanOrEqual(2);
    expect(response.points[0]).toEqual(samples[0]);
    expect(response.points.at(-1)).toEqual(samples.at(-1));
    expect(response.sourceSampleCount).toBe(300);
  });

  it("keeps the global extrema through decimation", () => {
    // A spike and a trough buried mid-window must survive: each falls in some
    // bucket, and a bucket always emits its own minimum and maximum.
    const samples = evenSamples(500, 100).map((sample, index) => ({
      ...sample,
      batteryPercent: index === 200 ? 100 : index === 350 ? 0 : 50,
    }));
    const response = select(samples);

    const values = response.points.map((point) => point.batteryPercent);
    expect(values).toContain(100);
    expect(values).toContain(0);
  });

  it("emits bucket extrema in chronological order", () => {
    const samples = evenSamples(500, 100).map((sample, index) => ({
      ...sample,
      batteryPercent: (index * 37) % 101,
    }));
    const response = select(samples);

    const times = response.points.map((point) => point.receivedAt);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("emits one point when a bucket's minimum and maximum are the same sample", () => {
    // Two interior samples land in distinct buckets across a 29-bucket split of
    // 61 evenly spaced samples only sometimes; instead force a single interior
    // sample per bucket with 61 samples and assert no receivedAt repeats.
    const samples = evenSamples(61, 900);
    const response = select(samples);

    const times = response.points.map((point) => point.receivedAt);
    expect(new Set(times).size).toBe(times.length);
  });

  it("breaks value ties by the earliest retained occurrence", () => {
    // All interior values equal: min and max of every bucket must resolve to
    // the same earliest sample and collapse to one point per bucket. A latest-
    // occurrence max would split them and emit two points per bucket instead.
    const samples = evenSamples(300, 200).map((sample) => ({
      ...sample,
      batteryPercent: 50,
    }));
    const response = select(samples);

    // First + last + one point for each of the 29 evenly filled interior buckets.
    expect(response.points).toHaveLength(31);
  });

  it("decimates only numeric samples while still counting the nulls", () => {
    const numeric = evenSamples(200, 250);
    const nulls: BatteryHistorySample[] = Array.from({ length: 50 }, (_unused, index) => ({
      receivedAt: CAPTURED_AT - index * 400 - 7,
      batteryPercent: null,
    }));
    const merged = [...numeric, ...nulls].sort((a, b) => a.receivedAt - b.receivedAt);
    const response = select(merged);

    expect(response.sourceSampleCount).toBe(250);
    expect(response.missingBatterySampleCount).toBe(50);
    // Null exclusion is proved by the round trip: the contract's point schema
    // rejects a null batteryPercent, so a leaked null fails the parse below.
    const parsed = parseRobotBatteryHistory(JSON.parse(JSON.stringify(response)));
    expect(parsed.ok).toBe(true);
    expect(response.points).toHaveLength(60);
  });
});
