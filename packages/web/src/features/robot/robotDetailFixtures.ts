import { SCHEMA_VERSION, type CapabilityWireEntry } from "@fleet/contracts";

import type { AdapterHealthCounters } from "@/entities/robot/fromEnvelope";
import type { HealthSeverity, Robot, SequenceHealth } from "@/entities/robot/model";
import type { FetchLike } from "@/shared/lib/transportDecoding";

/**
 * The wire responses `GET /api/robots/:id` and `GET /api/health` would serve, for tests
 * that render the real detail page.
 *
 * These used to live inside `useRobotDetail`, standing in for a server that did not exist.
 * They moved here rather than being deleted when the fetch landed, because the tests that
 * use them exercise the **true** path — serialize, decode with the contract's own parser,
 * map with `fromEnvelope` — and mocking the hook instead would have deleted that coverage
 * rather than moved it.
 *
 * It sits beside the page rather than under `src/test/**` because this package classifies
 * `features/robot/robotDetailPage.test.tsx` as a *feature* file, and a feature may not
 * import `test`. Nothing but the sibling suites imports this, so it is absent from the
 * bundle — but the classification is worth revisiting; see the note in `TODO.md`.
 */

/** The per-vendor half of a fixture response: what the dialect declares. */
interface VendorFixture {
  readonly model: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly position: { readonly frame: string; readonly x: number; readonly y: number } | null;
  readonly capabilities: readonly CapabilityWireEntry[];
  readonly counters: AdapterHealthCounters;
  /**
   * This robot's sequence continuity as the server would report it on the wire
   * (ADR 25). On the fixture rather than in `counters` because it is per-robot and
   * travels on the envelope; `counters` is what genuinely is not.
   */
  readonly sequenceHealth: SequenceHealth;
  readonly rawPayload: Readonly<Record<string, unknown>>;
}

/**
 * ADR 1's three dialects, as capability declarations: A and B declare dock and
 * lidarHealth, C declares dock and waterLevel and omits lidarHealth, and B
 * alone is sequence-less. C reports an undocumented field its adapter counted
 * rather than dropped. Capabilities are in wire form — an array of entries —
 * because that is what JSON carries; the schema decodes them to the record
 * (ADR 1).
 *
 * Nothing downstream branches on vendor. The differences reach the console
 * only as which capabilities exist (Principle 3).
 */
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
    capabilities: [
      { name: "dock", payload: { docked: true, dockId: "dock-a3" } },
      { name: "lidarHealth", payload: { severity: "nominal", rpm: 480 } },
    ],
    counters: { unknownFieldCount: 0 },
    // No sequence declared, so there is nothing to count gaps in. "Not
    // evaluated" and "no gaps observed" are different statements (ADR 1), and
    // the discriminated shape is what makes the second unrepresentable here.
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

/**
 * Vendor-supplied health prose, which arrives only when there is something to
 * say. A nominal robot has no description, which is why the contract makes the
 * field optional rather than an empty string.
 */
const HEALTH_DESCRIPTION: Partial<Record<HealthSeverity, string>> = {
  degraded: "Drive current above nominal",
  critical: "Obstacle sensor unresponsive",
};

/** Transport delay between the vendor's instant and the server's receipt. */
const FIXTURE_RECEIPT_DELAY_MS = 120;

/** Stamps the robot's own id into a payload shaped like its vendor's dialect. */
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

/**
 * Connectivity is the robot's own link state, not the console's socket and not
 * freshness (ADR 1). The fixture reports `unknown` for a robot the server has
 * stopped hearing from, because at that point the link state is exactly what
 * nobody knows.
 *
 * FIXME(fixture-only): this rule is invented here because a fixture has to
 * choose something. The real endpoint reports connectivity, at which point this
 * function is deleted rather than kept as a fallback — a plausible stand-in
 * that outlives its fixture becomes an undocumented product rule
 * (src/entities/robot/TODO.md W-7).
 */
function fixtureConnectivity(robot: Robot): "online" | "unknown" {
  return robot.freshness === "unreachable" ? "unknown" : "online";
}

/**
 * Builds the JSON body `GET /api/robots/:id` will serve, for a robot that has
 * reported at least once. Returns `unknown` deliberately: the value crosses the
 * decode boundary like any other response and gets no type until the schema
 * gives it one.
 */
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
      connectivity: fixtureConnectivity(robot),
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

/** The manifest entry for a robot that is registered and has never reported. */
function buildRegisteredResponse(robot: Robot): unknown {
  return {
    schemaVersion: SCHEMA_VERSION,
    robotId: robot.id,
    siteId: robot.siteId,
    vendorId: robot.vendor,
    freshness: "unknown",
  };
}

/**
 * A `fetch` stub answering the two requests the detail hook makes.
 *
 * Both, because the hook fetches the robot and the health counters in parallel and they
 * fail independently — a test that stubbed only the robot would exercise a path the
 * console never takes.
 */
export function createFixtureFetch(
  options: { readonly health?: unknown; readonly healthFails?: boolean } = {},
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

    const id = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
    const body = buildRobotResponse(id);
    if (body === null) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve(null) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  };
}

/** The wire body for one fixture robot, or null when no fixture has that id. */
export function buildRobotResponse(id: string): unknown {
  const robot = buildFixtureRobots().find((candidate) => candidate.id === id);
  if (robot === undefined) return null;

  const fixture = FIXTURE_BY_VENDOR[robot.vendor];
  const reportedAt = robot.lastSeenAt === null ? null : Date.parse(robot.lastSeenAt);
  // A robot that has never reported is a different contract, not an envelope full of
  // nulls: it has no telemetry instant and no core (ADR 1).
  if (reportedAt === null || fixture === undefined) return buildRegisteredResponse(robot);
  return buildWireResponse(robot, fixture, reportedAt);
}

/** A health body carrying a per-adapter unknown-field count for each fixture vendor. */
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

/**
 * The fleet rows these fixture responses describe.
 *
 * One set of core values, so a fixture detail response cannot disagree with the row a test
 * would have clicked to reach it (Principle 1). Timestamps are relative to `Date.now()`
 * because freshness varies across the set on purpose — a suite asserting on an exact
 * instant should pass its own.
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
