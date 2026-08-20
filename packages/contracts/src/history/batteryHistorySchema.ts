import { z } from "zod";

import {
  batteryPercentSchema,
  epochMillisecondsSchema,
  identifierSchema,
  type ParseResult,
  parseWith,
} from "../shared/primitives.js";

/**
 * The `GET /api/robots/:id/history` response: one robot's battery percentage
 * over the last minute, decimated to a bounded point count (ADR 33).
 *
 * The window and point budget are literals on the wire, not parameters. A
 * caller cannot ask for more history than this contract promises, and a server
 * cannot quietly serve a different window — the sparkline's fixed 60-second
 * x-axis renders exactly what `windowMs` says, so a negotiated value would
 * change the chart's meaning without changing its markup.
 *
 * Battery is the only metric here. Position, status, health, capabilities and
 * raw vendor payloads never enter this response; adding a second metric is a
 * contract and ADR amendment, not a field addition.
 *
 * Coupling: `packages/server`'s history store derives its per-robot capacity
 * from `BATTERY_HISTORY_WINDOW_MS` and the simulator's validated 50 Hz ceiling,
 * and its decimator promises the count invariants the `.check` below enforces.
 * `packages/web`'s `useRobotHistory` decodes with `parseRobotBatteryHistory`
 * and builds the sparkline from `points` alone.
 */

/** The fixed history window: the 60 seconds preceding `capturedAt`, inclusive. */
export const BATTERY_HISTORY_WINDOW_MS = 60_000;

/** The most points one response may carry; beyond this the server decimates. */
export const BATTERY_HISTORY_MAX_POINTS = 60;

/**
 * This response's own schema version, independent of the envelope's
 * `SCHEMA_VERSION`. The two evolve for different reasons: the envelope version
 * moves when the canonical robot model changes, this one only when the history
 * response itself does.
 */
export const BATTERY_HISTORY_SCHEMA_VERSION = "1";

/**
 * One retained battery reading: server receipt time and the reported charge.
 *
 * `receivedAt`, not the vendor's `reportedAt`, deliberately: retention and the
 * chart's x-axis both measure what the server observed, matching the freshness
 * sweep's clock (ADR 3), so a vendor with a skewed clock cannot bend the axis.
 */
export const batteryHistoryPointSchema = z.strictObject({
  receivedAt: epochMillisecondsSchema,
  batteryPercent: batteryPercentSchema,
});

/** One plotted battery reading at its server receipt time. */
export type BatteryHistoryPoint = z.infer<typeof batteryHistoryPointSchema>;

/** The battery-history response served at `GET /api/robots/:id/history`. */
export const robotBatteryHistorySchema = z
  .strictObject({
    schemaVersion: z.literal(BATTERY_HISTORY_SCHEMA_VERSION),
    robotId: identifierSchema,
    /** The server clock when the window was captured; the window's trailing edge is `capturedAt - windowMs`. */
    capturedAt: epochMillisecondsSchema,
    windowMs: z.literal(BATTERY_HISTORY_WINDOW_MS),
    maxPoints: z.literal(BATTERY_HISTORY_MAX_POINTS),
    /** Samples of any kind retained inside the window, numeric or not. */
    sourceSampleCount: z.number().int().min(0),
    /** In-window samples whose reading carried no battery value; counted, never plotted as zero. */
    missingBatterySampleCount: z.number().int().min(0),
    /** Chronologically ordered numeric readings, decimated only above `maxPoints`. */
    points: z.array(batteryHistoryPointSchema).max(BATTERY_HISTORY_MAX_POINTS),
  })
  .check((ctx) => {
    const { capturedAt, missingBatterySampleCount, points, sourceSampleCount, windowMs } =
      ctx.value;

    if (missingBatterySampleCount > sourceSampleCount) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["missingBatterySampleCount"],
        message: "More missing-battery samples than samples: the counts cannot both be true.",
      });
      return;
    }

    // The decimator's promise, enforced on the wire: below the budget every
    // numeric sample is returned; above it, at least the preserved first and
    // last survive. A count outside these bounds means data was dropped or
    // invented, and either way the chart would lie about coverage.
    const numericSampleCount = sourceSampleCount - missingBatterySampleCount;
    const withinBudget = numericSampleCount <= BATTERY_HISTORY_MAX_POINTS;
    if (withinBudget ? points.length !== numericSampleCount : points.length < 2) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["points"],
        message: withinBudget
          ? "Point count must equal the numeric sample count when it fits the budget."
          : "A decimated response must retain at least the first and last numeric samples.",
      });
    }

    const windowStart = capturedAt - windowMs;
    points.forEach((point, index) => {
      if (point.receivedAt < windowStart || point.receivedAt > capturedAt) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: ["points", index, "receivedAt"],
          message: "Point timestamp falls outside the response window.",
        });
      }
      // Non-decreasing, not strictly increasing: a decimation bucket's minimum
      // and maximum may share one millisecond.
      const previous = points[index - 1];
      if (previous !== undefined && point.receivedAt < previous.receivedAt) {
        ctx.issues.push({
          code: "custom",
          input: ctx.value,
          path: ["points", index, "receivedAt"],
          message: "Points must be in chronological order.",
        });
      }
    });
  });

/** One robot's decimated battery history over the fixed 60-second window. */
export type RobotBatteryHistory = z.infer<typeof robotBatteryHistorySchema>;

/** Decodes an untrusted battery-history response from the wire. */
export function parseRobotBatteryHistory(input: unknown): ParseResult<RobotBatteryHistory> {
  return parseWith(robotBatteryHistorySchema, input);
}
