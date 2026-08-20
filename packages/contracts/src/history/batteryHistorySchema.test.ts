import { describe, expect, it } from "vitest";

import {
  BATTERY_HISTORY_MAX_POINTS,
  BATTERY_HISTORY_SCHEMA_VERSION,
  BATTERY_HISTORY_WINDOW_MS,
  type RobotBatteryHistory,
  parseRobotBatteryHistory,
  robotBatteryHistorySchema,
} from "./batteryHistorySchema.js";

/** A capture instant safely past one window, so in-window timestamps stay non-negative. */
const CAPTURED_AT = 1_700_000_120_000;

/** Evenly spaced in-window points ending at the capture instant. */
function points(count: number): RobotBatteryHistory["points"] {
  return Array.from({ length: count }, (_unused, index) => ({
    receivedAt: CAPTURED_AT - (count - 1 - index) * 1_000,
    batteryPercent: 50 + (index % 2),
  }));
}

/** A minimal well-formed history response. */
function response(overrides: Partial<RobotBatteryHistory> = {}): RobotBatteryHistory {
  const returned = points(3);
  return {
    schemaVersion: BATTERY_HISTORY_SCHEMA_VERSION,
    robotId: "R-001",
    capturedAt: CAPTURED_AT,
    windowMs: BATTERY_HISTORY_WINDOW_MS,
    maxPoints: BATTERY_HISTORY_MAX_POINTS,
    sourceSampleCount: 4,
    missingBatterySampleCount: 1,
    points: returned,
    ...overrides,
  };
}

describe("contract constants", () => {
  it("fixes the window at 60 seconds and the response at 60 points", () => {
    // The plan derives server capacity (50 Hz × 60 s + 1) from these two values,
    // so a drift here silently invalidates HISTORY_CAPACITY on the server side.
    expect(BATTERY_HISTORY_WINDOW_MS).toBe(60_000);
    expect(BATTERY_HISTORY_MAX_POINTS).toBe(60);
  });
});

describe("robotBatteryHistorySchema", () => {
  it("decodes a well-formed response after a JSON round trip", () => {
    const result = parseRobotBatteryHistory(JSON.parse(JSON.stringify(response())));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.robotId).toBe("R-001");
    expect(result.value.points).toHaveLength(3);
  });

  it("decodes the empty response a registered but unheard robot returns", () => {
    const result = parseRobotBatteryHistory(
      response({ sourceSampleCount: 0, missingBatterySampleCount: 0, points: [] }),
    );

    expect(result.ok).toBe(true);
  });

  it("decodes a window where samples exist but none carried a battery value", () => {
    const result = parseRobotBatteryHistory(
      response({ sourceSampleCount: 5, missingBatterySampleCount: 5, points: [] }),
    );

    expect(result.ok).toBe(true);
  });

  it("accepts exactly the maximum point count with matching source counts", () => {
    const result = parseRobotBatteryHistory(
      response({
        sourceSampleCount: BATTERY_HISTORY_MAX_POINTS,
        missingBatterySampleCount: 0,
        points: points(BATTERY_HISTORY_MAX_POINTS),
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("rejects more than the maximum point count", () => {
    const result = parseRobotBatteryHistory(
      response({
        sourceSampleCount: BATTERY_HISTORY_MAX_POINTS + 1,
        missingBatterySampleCount: 0,
        points: points(BATTERY_HISTORY_MAX_POINTS + 1),
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a foreign window or point budget", () => {
    // Literals, not maxima: a server negotiating its own window would silently
    // change what the sparkline's fixed x-axis means.
    expect(robotBatteryHistorySchema.safeParse({ ...response(), windowMs: 30_000 }).success).toBe(
      false,
    );
    expect(robotBatteryHistorySchema.safeParse({ ...response(), maxPoints: 100 }).success).toBe(
      false,
    );
  });

  it("rejects points out of chronological order", () => {
    const ordered = points(3);
    const swapped = [ordered[1], ordered[0], ordered[2]].filter(
      (point): point is RobotBatteryHistory["points"][number] => point !== undefined,
    );
    const result = parseRobotBatteryHistory(response({ points: swapped }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path.startsWith("points"))).toBe(true);
  });

  it("accepts two points sharing one receivedAt, which decimation ties can produce", () => {
    const at = CAPTURED_AT - 1_000;
    const result = parseRobotBatteryHistory(
      response({
        sourceSampleCount: 2,
        missingBatterySampleCount: 0,
        points: [
          { receivedAt: at, batteryPercent: 40 },
          { receivedAt: at, batteryPercent: 60 },
        ],
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("accepts a point exactly on the window's trailing edge and rejects one just past it", () => {
    const edge = CAPTURED_AT - BATTERY_HISTORY_WINDOW_MS;
    const single = (receivedAt: number) =>
      response({
        sourceSampleCount: 1,
        missingBatterySampleCount: 0,
        points: [{ receivedAt, batteryPercent: 50 }],
      });

    expect(parseRobotBatteryHistory(single(edge)).ok).toBe(true);
    expect(parseRobotBatteryHistory(single(edge - 1)).ok).toBe(false);
  });

  it("rejects a point from the future, after capturedAt", () => {
    const result = parseRobotBatteryHistory(
      response({
        sourceSampleCount: 1,
        missingBatterySampleCount: 0,
        points: [{ receivedAt: CAPTURED_AT + 1, batteryPercent: 50 }],
      }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a missing count that exceeds the source count", () => {
    const result = parseRobotBatteryHistory(
      response({ sourceSampleCount: 2, missingBatterySampleCount: 3, points: [] }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects more returned points than numeric source samples", () => {
    const result = parseRobotBatteryHistory(
      response({ sourceSampleCount: 3, missingBatterySampleCount: 1, points: points(3) }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a decimated shortfall: numeric samples within budget must all be returned", () => {
    // 5 numeric samples fit inside 60 points, so returning only 3 means the
    // server dropped data it had no license to drop.
    const result = parseRobotBatteryHistory(
      response({ sourceSampleCount: 5, missingBatterySampleCount: 0, points: points(3) }),
    );

    expect(result.ok).toBe(false);
  });

  it("rejects unrecognized fields at both levels", () => {
    expect(robotBatteryHistorySchema.safeParse({ ...response(), rawPayload: {} }).success).toBe(
      false,
    );
    expect(
      robotBatteryHistorySchema.safeParse(
        response({
          sourceSampleCount: 1,
          missingBatterySampleCount: 0,
          points: [
            { receivedAt: CAPTURED_AT, batteryPercent: 50, vendorStatus: "ok" },
          ] as unknown as RobotBatteryHistory["points"],
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects an unsupported schema version rather than reinterpreting it", () => {
    expect(robotBatteryHistorySchema.safeParse({ ...response(), schemaVersion: "2" }).success).toBe(
      false,
    );
  });

  it("rejects an out-of-range battery percentage", () => {
    const result = parseRobotBatteryHistory(
      response({
        sourceSampleCount: 1,
        missingBatterySampleCount: 0,
        points: [{ receivedAt: CAPTURED_AT, batteryPercent: 101 }],
      }),
    );

    expect(result.ok).toBe(false);
  });
});
