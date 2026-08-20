import { useSyncExternalStore } from "react";

import { useFleetStore } from "./fleetStoreContext";
import type { Robot } from "./model";

/**
 * The fleet, read from the store the transport fills.
 *
 * The exported signature is unchanged from the fixture version this replaced, which was
 * the point of writing it that way: `features/fleet` was built and reviewed against the
 * real component contract while the server did not exist, and the swap touched no
 * component.
 *
 * **No freshness timer, here or anywhere.** `freshness` is whatever the server's sweep
 * computed and sent (ADR 3). A client that aged robots locally would be a second authority
 * that can disagree with the first, and the disagreement would be invisible.
 */

/**
 * Fixture rows, still used by `useRobotDetail`.
 *
 * It stays here rather than moving because `useRobotDetail` is the last fixture-backed
 * hook and both should move together, with the single-robot fetch that replaces them
 * (`GET /api/robots/:id` exists and is unread). Exported so the detail view layers its
 * extra fields on one set of core values rather than keeping a second: the detail header
 * cannot then disagree with the row that was clicked to reach it (Principle 1).
 */
export function buildFixtureRobots(): Robot[] {
  const now = Date.now();
  const secondsAgo = (n: number) => new Date(now - n * 1_000).toISOString();
  const minutesAgo = (n: number) => new Date(now - n * 60_000).toISOString();

  return [
    {
      id: "R-118",
      vendor: "A",
      siteId: "zone-a",
      status: "busy",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 91,
      lastSeenAt: secondsAgo(2),
    },
    {
      id: "R-055",
      vendor: "B",
      siteId: "dock-a3",
      status: "charging",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 34,
      lastSeenAt: secondsAgo(5),
    },
    {
      id: "R-301",
      vendor: "C",
      siteId: "zone-c",
      status: "fault",
      health: { severity: "critical" },
      freshness: "live",
      batteryPercent: 12,
      lastSeenAt: secondsAgo(9),
    },
    {
      id: "R-204",
      vendor: "A",
      siteId: "zone-b",
      status: "busy",
      health: { severity: "degraded" },
      freshness: "stale",
      batteryPercent: 67,
      lastSeenAt: secondsAgo(18),
    },
    {
      id: "R-087",
      vendor: "B",
      siteId: "zone-b",
      status: "idle",
      health: { severity: "nominal" },
      freshness: "unreachable",
      batteryPercent: null,
      lastSeenAt: minutesAgo(29),
    },
    {
      id: "R-142",
      vendor: "C",
      siteId: "zone-a",
      status: "idle",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 78,
      lastSeenAt: secondsAgo(3),
    },
    {
      id: "R-090",
      vendor: "A",
      siteId: "zone-c",
      status: "busy",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 55,
      lastSeenAt: secondsAgo(4),
    },
    {
      id: "R-233",
      vendor: "B",
      siteId: "zone-a",
      status: "unknown",
      health: { severity: "nominal" },
      freshness: "unknown",
      batteryPercent: null,
      // A robot with freshness "unknown" has never reported — it cannot
      // have a last-seen time, so this stays null rather than "just now".
      lastSeenAt: null,
    },
    {
      id: "R-311",
      vendor: "C",
      siteId: "dock-a3",
      status: "charging",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 21,
      lastSeenAt: secondsAgo(6),
    },
    {
      id: "R-072",
      vendor: "A",
      siteId: "zone-b",
      status: "busy",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 88,
      lastSeenAt: secondsAgo(1),
    },
  ];
}

/**
 * Subscribes to the fleet and re-renders when a frame changes it.
 *
 * `getRobots` returns a cached array by identity, which is what makes this safe:
 * `useSyncExternalStore` compares snapshots by reference, and a store that built a new
 * array per call would loop forever rather than merely re-render often.
 */
export function useFleetRobots(): readonly Robot[] {
  const store = useFleetStore();
  return useSyncExternalStore(store.subscribe, store.getRobots);
}
