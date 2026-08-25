import { SCHEMA_VERSION, type CapabilityWireEntry } from "@fleet/contracts";

import type { AdapterHealthCounters } from "@/utils/fromEnvelope";
import type { Connectivity, HealthSeverity, Robot, SequenceHealth } from "@/types/robot";
import type { FetchLike } from "@/lib/transportDecoding";

interface VendorFixture {
  readonly model: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly position: {
    readonly frame: string;
    readonly x: number;
    readonly y: number;
  } | null;
  readonly capabilities: readonly CapabilityWireEntry[];
  readonly counters: AdapterHealthCounters;
  readonly sequenceHealth: SequenceHealth;
  readonly rawPayload: Readonly<Record<string, unknown>>;
}

const FIXTURE_BY_VENDOR: Readonly<Record<string, VendorFixture>> = {
  A: {
    model: "Courier 4",
    adapterId: "vendor-a",
    adapterVersion: "1.4.0",
    position: { frame: "site-map", x: 41.2, y: 18.7 },
    capabilities: [
      { name: "dock", payload: { docked: false, dockId: "dock-a3" } },
      { name: "lidarHealth", payload: { severity: "nominal", rpm: 600 } },
      { name: "sequence", payload: { value: 88_412 } },
    ],
    counters: { unknownFieldCount: 0 },
    sequenceHealth: { evaluated: true, gaps: 0, duplicates: 0 },
    rawPayload: {
      robot: { state: "MOVING" },
      battery: { fraction: 0.91 },
      pose: { frame: "site-map", x: 41.2, y: 18.7 },
    },
  },
  B: {
    model: "Hauler S",
    adapterId: "vendor-b",
    adapterVersion: "0.9.2",
    position: { frame: "site-map", x: 7.4, y: 62.1 },
    capabilities: [{ name: "dock", payload: { docked: true, dockId: "dock-a3" } }],
    counters: { unknownFieldCount: 0 },
    // Vendor B has no sequence source; unevaluated is distinct from zero observed gaps.
    sequenceHealth: { evaluated: false },
    rawPayload: { state: "charging", battery_pct: 34, x_cm: 740, y_cm: 6210 },
  },
  C: {
    model: "Scrubber 2",
    adapterId: "vendor-c",
    adapterVersion: "1.1.7",
    position: { frame: "level-2", x: 12.9, y: 3.4 },
    capabilities: [
      { name: "dock", payload: { docked: false, dockId: null } },
      { name: "waterLevel", payload: { percent: 62 } },
      { name: "sequence", payload: { value: 5_140 } },
    ],
    counters: { unknownFieldCount: 2 },
    sequenceHealth: { evaluated: true, gaps: 3, duplicates: 1 },
    rawPayload: {
      robot: { state: "FAULT" },
      battery: { fraction: 0.12 },
      water_level_pct: 62,
      undocumented_field: "counted, not dropped",
    },
  },
};

const HEALTH_DESCRIPTION: Partial<Record<HealthSeverity, string>> = {
  degraded: "Drive current above nominal",
  critical: "Obstacle sensor unresponsive",
};

const FIXTURE_RECEIPT_DELAY_MS = 120;

function withRobotId(
  payload: Readonly<Record<string, unknown>>,
  id: string,
): Readonly<Record<string, unknown>> {
  const nested = payload.robot;
  if (typeof nested === "object" && nested !== null) {
    return { ...payload, robot: { ...nested, id } };
  }
  return { ...payload, id };
}

// No current vendor reports connectivity; never infer it from freshness.
const FIXTURE_CONNECTIVITY = "unknown" satisfies Connectivity;

function buildWireResponse(robot: Robot, fixture: VendorFixture, reportedAt: number): unknown {
  const description = robot.health === null ? undefined : HEALTH_DESCRIPTION[robot.health.severity];

  return {
    schemaVersion: SCHEMA_VERSION,
    robotId: robot.id,
    siteId: robot.siteId,
    vendorId: robot.vendor,
    model: fixture.model,
    adapterId: fixture.adapterId,
    adapterVersion: fixture.adapterVersion,
    reportedAt,
    receivedAt: reportedAt + FIXTURE_RECEIPT_DELAY_MS,
    core: {
      connectivity: FIXTURE_CONNECTIVITY,
      batteryPercent: robot.batteryPercent,
      position: fixture.position,
      status: robot.status,
      health:
        robot.health === null
          ? { severity: "nominal" }
          : {
              severity: robot.health.severity,
              ...(description === undefined ? {} : { description }),
            },
    },
    freshness: robot.freshness,
    capabilities: fixture.capabilities,
    sequenceHealth: fixture.sequenceHealth,
    rawPayload: withRobotId(fixture.rawPayload, robot.id),
  };
}

function buildRegisteredResponse(robot: Robot): unknown {
  return {
    schemaVersion: SCHEMA_VERSION,
    robotId: robot.id,
    siteId: robot.siteId,
    vendorId: robot.vendor,
    freshness: "unknown",
  };
}

export function createFixtureFetch(
  options: {
    readonly health?: unknown;
    readonly healthFails?: boolean;
    readonly history?: unknown;
    readonly historyFails?: boolean;
  } = {},
): FetchLike {
  return (url: string) => {
    if (url.includes("/health")) {
      if (options.healthFails === true) return Promise.reject(new Error("health unavailable"));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(options.health ?? buildHealthResponse()),
      });
    }

    if (url.endsWith("/history")) {
      if (options.historyFails === true) return Promise.reject(new Error("history unavailable"));
      const historyId = decodeURIComponent(url.split("/").at(-2) ?? "");
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(options.history ?? buildHistoryResponse(historyId)),
      });
    }

    const id = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
    const body = buildRobotResponse(id);
    if (body === null) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };
}

export function buildRobotResponse(id: string): unknown {
  const robot = buildFixtureRobots().find((candidate) => candidate.id === id);
  if (robot === undefined) return null;

  const fixture = FIXTURE_BY_VENDOR[robot.vendor];
  const reportedAt = robot.lastSeenAt === null ? null : Date.parse(robot.lastSeenAt);
  // A never-reported robot uses the registered-only contract, not nullable telemetry.
  if (reportedAt === null || fixture === undefined) return buildRegisteredResponse(robot);
  return buildWireResponse(robot, fixture, reportedAt);
}

export function buildHistoryResponse(id: string): unknown {
  const robot = buildFixtureRobots().find((candidate) => candidate.id === id);
  const capturedAt = Date.now();
  const base = {
    schemaVersion: "1",
    robotId: id,
    capturedAt,
    windowMs: 60_000,
    maxPoints: 60,
  };
  if (robot === undefined || robot.lastSeenAt === null) {
    return { ...base, sourceSampleCount: 0, missingBatterySampleCount: 0, points: [] };
  }
  const battery = robot.batteryPercent;
  if (battery === null) {
    // Samples arrived and none carried a battery value — counted, never plotted as zero.
    return { ...base, sourceSampleCount: 6, missingBatterySampleCount: 6, points: [] };
  }
  const points = Array.from({ length: 6 }, (_unused, index) => ({
    receivedAt: capturedAt - (5 - index) * 10_000,
    batteryPercent: Math.min(100, battery + (5 - index)),
  }));
  return {
    ...base,
    sourceSampleCount: points.length,
    missingBatterySampleCount: 0,
    points,
  };
}

export function buildHealthResponse(): unknown {
  return {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: Date.now(),
    malformedIngest: 0,
    unsupportedVendors: 0,
    unknownFieldScope: "accepted",
    byAdapter: Object.fromEntries(
      Object.entries(FIXTURE_BY_VENDOR).map(([vendor, fixture]) => [
        vendor,
        {
          failures: 0,
          unknownFields: {
            total: fixture.counters.unknownFieldCount ?? 0,
            fields: {},
          },
          sequence: { evaluated: false },
        },
      ]),
    ),
    lateFreshnessTicks: { count: 0, lastLatenessMs: null },
  };
}

export function buildFixtureRobots(): readonly Robot[] {
  const now = Date.now();
  const formatSecondsAgo = (elapsedSeconds: number) =>
    new Date(now - elapsedSeconds * 1_000).toISOString();
  const formatMinutesAgo = (elapsedMinutes: number) =>
    new Date(now - elapsedMinutes * 60_000).toISOString();

  const rows: ReadonlyArray<
    Omit<Robot, "observed" | "model" | "connectivity" | "position" | "capabilities">
  > = [
    {
      id: "R-118",
      vendor: "A",
      siteId: "zone-a",
      status: "busy",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 91,
      lastSeenAt: formatSecondsAgo(2),
    },
    {
      id: "R-055",
      vendor: "B",
      siteId: "dock-a3",
      status: "charging",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 34,
      lastSeenAt: formatSecondsAgo(5),
    },
    {
      id: "R-301",
      vendor: "C",
      siteId: "zone-c",
      status: "fault",
      health: { severity: "critical" },
      freshness: "live",
      batteryPercent: 12,
      lastSeenAt: formatSecondsAgo(9),
    },
    {
      id: "R-204",
      vendor: "A",
      siteId: "zone-b",
      status: "busy",
      health: { severity: "degraded" },
      freshness: "stale",
      batteryPercent: 67,
      lastSeenAt: formatSecondsAgo(18),
    },
    {
      id: "R-087",
      vendor: "B",
      siteId: "zone-b",
      status: "idle",
      health: { severity: "nominal" },
      freshness: "unreachable",
      batteryPercent: null,
      lastSeenAt: formatMinutesAgo(29),
    },
    {
      id: "R-142",
      vendor: "C",
      siteId: "zone-a",
      status: "idle",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 78,
      lastSeenAt: formatSecondsAgo(3),
    },
    {
      id: "R-090",
      vendor: "A",
      siteId: "zone-c",
      status: "busy",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 55,
      lastSeenAt: formatSecondsAgo(4),
    },
    {
      id: "R-233",
      vendor: "B",
      siteId: "zone-a",
      status: "unknown",
      health: { severity: "nominal" },
      freshness: "unknown",
      batteryPercent: null,
      // Unknown freshness means this robot has never reported.
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
      lastSeenAt: formatSecondsAgo(6),
    },
    {
      id: "R-072",
      vendor: "A",
      siteId: "zone-b",
      status: "busy",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 88,
      lastSeenAt: formatSecondsAgo(1),
    },
  ];

  // Registered-only rows have no observed fields; other rows carry minimal fleet values.
  return rows.map((row) => {
    const observed = row.freshness !== "unknown";
    return {
      ...row,
      observed,
      model: observed ? `Model ${row.vendor}` : null,
      connectivity: observed ? "online" : null,
      position: null,
      capabilities: {},
    };
  });
}
