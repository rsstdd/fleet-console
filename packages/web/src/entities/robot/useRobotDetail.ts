import { useMemo } from "react";

import {
  SCHEMA_VERSION,
  parseRegisteredRobotState,
  parseRobotDiagnosticEnvelope,
  type CapabilityWireEntry,
  type ContractIssue,
} from "@fleet/contracts";

import { toRegisteredRobotDetail, toRobotDetail, type AdapterHealthCounters } from "./fromEnvelope";
import type { SequenceHealth } from "./model";
import type { HealthSeverity, Robot, RobotDetail } from "./model";
import { buildFixtureRobots } from "./useFleetRobots";

/**
 * TEMPORARY in its data source, not in its shape: `packages/server` serves no
 * `GET /api/robots/:id` yet, so the response is built here. Everything after
 * that point is the real path — the fixture is serialized to JSON, decoded by
 * `parseRobotDiagnosticEnvelope` as untrusted input, and mapped by
 * `fromEnvelope.ts`. Nothing in this package constructs a `RobotDetail`
 * directly, so when the fetch replaces `buildWireResponse` the mapping and the
 * decode are already the ones in use (Principle 2).
 *
 * When the server exists, replace `buildWireResponse` with the fetch and keep
 * everything below it. The exported signature — a discriminated state union —
 * is written for that transport: `loading` and the two error variants exist
 * because a real fetch produces them.
 *
 * No freshness timer, here or in the replacement. Freshness arrives as a field
 * the server's sweep set (ADR 3).
 */

/**
 * Every user-visible state of the single-robot surface (robot detail spec
 * §10). A union rather than a bag of booleans: "loading and not found" and
 * "ready with no robot" are not representable (Principle 11).
 */
export type RobotDetailState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly robot: RobotDetail }
  | { readonly status: "not-found"; readonly id: string }
  /**
   * Recoverable: whatever is already valid stays on screen and the page offers
   * a retry, rather than blanking (spec §10). `robot` is null only when the
   * first load itself failed.
   */
  | {
      readonly status: "error";
      readonly recoverable: true;
      readonly message: string;
      readonly robot: RobotDetail | null;
      readonly retry: () => void;
    }
  /** Terminal: nothing more will arrive, so the page states what failed. */
  | {
      readonly status: "error";
      readonly recoverable: false;
      readonly message: string;
      readonly robot: null;
    };

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
 * One line naming what failed to decode, for the terminal error state.
 *
 * Coupling: `ContractIssue` is the repository's one failure vocabulary (ADR 20),
 * so these are the decoder's own issues — and, once the transport lands, the
 * ones an HTTP error body carries (`parseErrorEnvelope` in `@fleet/contracts`).
 * The console composes its own sentence from `path` and `code`; the envelope's
 * server-authored `message` is for logs and non-console callers, not for this.
 */
function describeIssues(issues: readonly ContractIssue[]): string {
  const summary = issues.map((issue) => `${issue.path}: ${issue.code}`).join(", ");
  return `The robot response did not match the canonical contract (${summary}).`;
}

/**
 * Serializes, decodes and maps one fixture response — the same three steps the
 * transport will perform, minus the network.
 */
function loadFixtureDetail(id: string): RobotDetailState {
  const robot = buildFixtureRobots().find((candidate) => candidate.id === id);
  if (robot === undefined) {
    return { status: "not-found", id };
  }

  const fixture = FIXTURE_BY_VENDOR[robot.vendor];
  const reportedAt = robot.lastSeenAt === null ? null : Date.parse(robot.lastSeenAt);

  // A robot that has never reported is a different contract, not an envelope
  // full of nulls: it has no telemetry instant and no core (ADR 1).
  if (reportedAt === null || fixture === undefined) {
    const registered = parseRegisteredRobotState(
      JSON.parse(JSON.stringify(buildRegisteredResponse(robot))),
    );
    return registered.ok
      ? { status: "ready", robot: toRegisteredRobotDetail(registered.value) }
      : {
          status: "error",
          recoverable: false,
          message: describeIssues(registered.issues),
          robot: null,
        };
  }

  const wire: unknown = JSON.parse(JSON.stringify(buildWireResponse(robot, fixture, reportedAt)));
  const decoded = parseRobotDiagnosticEnvelope(wire);

  // A response that fails the contract is terminal rather than retryable: the
  // server did not stumble, it sent something this console cannot read, and
  // retrying returns the same bytes (Principle 2).
  return decoded.ok
    ? { status: "ready", robot: toRobotDetail(decoded.value, fixture.counters) }
    : { status: "error", recoverable: false, message: describeIssues(decoded.issues), robot: null };
}

/**
 * Returns every user-visible state of one robot, keyed by route id.
 * Fixture-backed — see the file comment.
 */
export function useRobotDetail(id: string | undefined): RobotDetailState {
  return useMemo<RobotDetailState>(() => {
    if (id === undefined || id === "") {
      return { status: "not-found", id: "" };
    }
    return loadFixtureDetail(id);
  }, [id]);
}
