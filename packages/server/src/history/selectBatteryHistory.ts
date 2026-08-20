import {
  BATTERY_HISTORY_MAX_POINTS,
  BATTERY_HISTORY_SCHEMA_VERSION,
  BATTERY_HISTORY_WINDOW_MS,
  type BatteryHistoryPoint,
  type RobotBatteryHistory,
} from "@fleet/contracts";

import type { BatteryHistorySample } from "../state/currentStateStore.ts";

/**
 * Turns one robot's retained samples into the battery-history response:
 * window filtering, null accounting, and extrema-preserving decimation (ADR 33).
 *
 * Pure and framework-independent: the route hands it samples and an instant, so
 * every decimation property is testable without a listener or a live store.
 * `capturedAt` is the injected server clock read at request time — never a
 * sample timestamp — because robot timestamps do not say when the aggregate was
 * captured.
 *
 * Coupling: `CurrentStateStore.batteryHistory` supplies `samples` oldest-first,
 * and its `HISTORY_CAPACITY` guarantees they span at least one full contract
 * window at the supported source rate. The count invariants promised here are
 * enforced by `robotBatteryHistorySchema`'s cross-field checks, so a drift
 * between this module and the contract fails the parser round trip, not a
 * reader's expectations.
 */

/** What one history read needs: the robot, its retained samples, and the request instant. */
export interface SelectBatteryHistoryInput {
  readonly robotId: string;
  /** Retained samples oldest-first, as `CurrentStateStore.batteryHistory` returns them. */
  readonly samples: readonly BatteryHistorySample[];
  /** The injected server clock at request time; the window is the 60 seconds before it. */
  readonly capturedAt: number;
}

/** Interior buckets between the preserved first and last points: (60 - 2) / 2. */
const INTERIOR_BUCKET_COUNT = (BATTERY_HISTORY_MAX_POINTS - 2) / 2;

/** Builds the contract response for one robot's retained battery samples. */
export function selectBatteryHistory(input: SelectBatteryHistoryInput): RobotBatteryHistory {
  const windowStart = input.capturedAt - BATTERY_HISTORY_WINDOW_MS;
  const inWindow = input.samples.filter(
    (sample) => sample.receivedAt >= windowStart && sample.receivedAt <= input.capturedAt,
  );
  const numeric = inWindow.filter(
    (sample): sample is BatteryHistoryPoint => sample.batteryPercent !== null,
  );

  return {
    schemaVersion: BATTERY_HISTORY_SCHEMA_VERSION,
    robotId: input.robotId,
    capturedAt: input.capturedAt,
    windowMs: BATTERY_HISTORY_WINDOW_MS,
    maxPoints: BATTERY_HISTORY_MAX_POINTS,
    sourceSampleCount: inWindow.length,
    missingBatterySampleCount: inWindow.length - numeric.length,
    points: decimate(numeric),
  };
}

/**
 * Extrema-preserving decimation: keep the first and last samples, split the
 * time between them into equal buckets, and keep each bucket's minimum and
 * maximum so no spike or trough can vanish into an average.
 *
 * Ties break toward the earliest retained occurrence, and a bucket whose
 * minimum and maximum are the same sample emits it once — which is what caps
 * the result at `2 + 29 × 2 = 60` points and lets it fall short when buckets
 * are empty.
 */
function decimate(numeric: readonly BatteryHistoryPoint[]): BatteryHistoryPoint[] {
  if (numeric.length <= BATTERY_HISTORY_MAX_POINTS) {
    return [...numeric];
  }

  const first = numeric[0];
  const last = numeric[numeric.length - 1];
  if (first === undefined || last === undefined) return [];

  const interior = numeric.slice(1, -1);
  const span = last.receivedAt - first.receivedAt;
  const buckets = new Map<number, { min: BatteryHistoryPoint; max: BatteryHistoryPoint }>();

  for (const point of interior) {
    // `span` is positive here: more than 60 points with a zero span would need
    // 61 samples in one millisecond, and even then the guard keeps index 0 legal.
    const fraction = span === 0 ? 0 : (point.receivedAt - first.receivedAt) / span;
    const index = Math.min(Math.floor(fraction * INTERIOR_BUCKET_COUNT), INTERIOR_BUCKET_COUNT - 1);
    const bucket = buckets.get(index);
    if (bucket === undefined) {
      buckets.set(index, { min: point, max: point });
      continue;
    }
    // Strict comparisons keep the earliest occurrence on a tie: a later equal
    // value never displaces the sample already holding the extremum.
    if (point.batteryPercent < bucket.min.batteryPercent) bucket.min = point;
    if (point.batteryPercent > bucket.max.batteryPercent) bucket.max = point;
  }

  const points: BatteryHistoryPoint[] = [first];
  for (const index of [...buckets.keys()].sort((a, b) => a - b)) {
    const bucket = buckets.get(index);
    if (bucket === undefined) continue;
    if (bucket.min === bucket.max) {
      points.push(bucket.min);
      continue;
    }
    const [earlier, later] =
      bucket.min.receivedAt <= bucket.max.receivedAt
        ? [bucket.min, bucket.max]
        : [bucket.max, bucket.min];
    points.push(earlier, later);
  }
  points.push(last);
  return points;
}
