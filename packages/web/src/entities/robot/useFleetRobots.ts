import { useMemo } from "react";
import type { Robot } from "./model";

/**
 * TEMPORARY. packages/contracts, packages/adapters, and packages/server are
 * all decided (ADR 1, ADR 2) but not yet implemented — there is no real
 * WebSocket store to subscribe to. This hook returns a fixed fixture set so
 * features/fleet can be built and reviewed against the real component
 * contract now, rather than blocking on the server.
 *
 * When the server exists, replace this function's body with a subscription
 * to the normalized client-side store (useSyncExternalStore against the
 * store keyed by robot id, per the data-flow design already agreed) —
 * the exported signature, `readonly Robot[]`, should not need to change.
 *
 * Note what that replacement does NOT add: a freshness timer. The `freshness`
 * field on each fixture below stands in for a value the server sweep computes
 * and sends (ADR 3). The store applies whatever the delta says. Do not add an
 * interval here that ages robots locally.
 */
/**
 * Exported for `useRobotDetail`, which layers detail-only fields on top of
 * these rows rather than keeping a second fixture set. One authority for the
 * core fields means the detail header cannot disagree with the row that was
 * clicked to reach it (Principle 1).
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

/** Returns the current fleet snapshot. Fixture-backed — see file comment. */
export function useFleetRobots(): readonly Robot[] {
  return useMemo(() => buildFixtureRobots(), []);
}
