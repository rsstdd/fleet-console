/**
 * Vendor A: nested payload, fractional battery, metres, ISO-8601, string status.
 *
 * ## Status vocabulary
 *
 * Vendor A's `telemetry.state` is four of the canonical five, spelled identically.
 * The table is written out anyway, because an identity mapping that is *declared*
 * fails to compile when either vocabulary is renamed, while one that is merely
 * assumed keeps passing the wrong value through.
 *
 * | `telemetry.state` | canonical `status` |
 * | ----------------- | ------------------ |
 * | `idle`            | `idle`             |
 * | `busy`            | `busy`             |
 * | `charging`        | `charging`         |
 * | `fault`           | `fault`            |
 *
 * Canonical `unknown` is unreachable from this dialect: the schema accepts only
 * the four values above, so anything else is a `malformed_payload` rejection
 * rather than a silent downgrade to `unknown`. That is the intended reading of
 * "reject it or map it to an explicit canonical unknown state **where the contract
 * permits**" — here the vendor is unambiguous, so a guess would be the invention.
 *
 * ## Health severity
 *
 * | `telemetry.health.level` | canonical `health.severity` |
 * | ------------------------ | --------------------------- |
 * | `nominal`                | `nominal`                   |
 * | `degraded`               | `degraded`                  |
 * | `critical`               | `critical`                  |
 *
 * No `description` is emitted: vendor A sends no prose, and an empty string would
 * be a claim that it did.
 *
 * ## Capabilities
 *
 * Declares `dock`, `lidarHealth` and `sequence`, each from source data the payload
 * actually carries. Nothing is declared from an absence and nothing canonical is
 * populated without a declaration behind it (ADR 1 § Constraints).
 *
 * Coupling: producer is `packages/simulator/src/vendors/vendorA.ts`; the schema
 * this decodes is `./schema.ts`; the ledger it writes to is owned by
 * `packages/server` (ADR 15).
 */
import {
  SCHEMA_VERSION,
  epochMillisecondsSchema,
  type AdapterEnvelope,
  type Capabilities,
  type HealthSeverity,
  type RobotStatus,
  toContractIssues,
} from "@fleet/contracts";

import type { VendorAdapter } from "../../core/adapter.ts";
import { parseIsoInstant } from "../../core/isoInstant.ts";
import { toBatteryPercent } from "../../core/units.ts";
import { failure, issuesForKind, ok } from "../../core/result.ts";
import { noteAcceptedPayload, type UnknownFieldLedger } from "../../core/unknownFields.ts";
import { VENDOR_A_KNOWN_PATHS, vendorAPayloadSchema } from "./schema.ts";

/**
 * This adapter's own identifier, distinct from the vendor id it decodes.
 *
 * `vendorId` names the dialect's producer and `adapterId` names the software that
 * understands it; they are one-to-one today and would stop being so the first
 * time vendor A published a second dialect version needing its own module. The
 * spelling matches the one `packages/web`'s robot-detail fixtures already ship,
 * which was the only product spelling in the tree — the others were test
 * placeholders.
 *
 * **Not the ledger's key.** `UnknownFieldSnapshot.byAdapter` is keyed by
 * `SupportedVendor` (`"A"`), and ADR 25's health response is keyed by open
 * identifier. Whichever of the two the server puts on `GET /api/health` it must
 * choose once, in the dispatch registry that knows both — not by joining these
 * two identifier spaces at the handler. Recorded in `TODO.md` § FIXME.
 */
const ADAPTER_ID = "vendor-a";

/**
 * Bumped when this adapter's output changes for an unchanged input.
 *
 * A mapping correction, a newly declared capability and a unit fix all qualify;
 * a comment or a test does not. The value travels on every envelope, so a
 * technician comparing two readings can tell whether the difference is the robot
 * or the software reading it.
 */
const ADAPTER_VERSION = "1.0.0";

/** Vendor A's four states, mapped to the canonical vocabulary the table above documents. */
const STATUS_BY_STATE = {
  idle: "idle",
  busy: "busy",
  charging: "charging",
  fault: "fault",
} as const satisfies Record<string, RobotStatus>;

/** Vendor A's three health levels, mapped to canonical severity. */
const SEVERITY_BY_LEVEL = {
  nominal: "nominal",
  degraded: "degraded",
  critical: "critical",
} as const satisfies Record<string, HealthSeverity>;

/**
 * The lidar unit's own severity, derived from the dialect's boolean.
 *
 * Vendor A reports `fault` as true or false and never a severity, so `degraded` is
 * unreachable for this vendor. Two values out of three is the honest projection of
 * a boolean; inventing a middle state from spin rate would be the invented
 * precision `AGENTS.md` § Adapter contract forbids.
 *
 * This is the *unit's* severity and not the robot's. They are separate facts and
 * can legitimately disagree — the simulator's own `healthFor` reads a faulted lidar
 * as `degraded` at the robot level while the unit itself is broken.
 */
function lidarSeverity(faulted: boolean): HealthSeverity {
  return faulted ? "critical" : "nominal";
}

/**
 * Builds the vendor A adapter over a caller-owned unknown-field ledger.
 *
 * The ledger is closed over rather than passed per call so that one process has
 * one tally per adapter, which is the only scope ADR 1 permits and the only one
 * `UnknownFieldSnapshot` can express.
 */
export function createVendorAAdapter(ledger: UnknownFieldLedger): VendorAdapter {
  return function decodeVendorA(payload, receivedAt) {
    const parsed = vendorAPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return failure({
        kind: "malformed_payload",
        vendor: "A",
        issues: toContractIssues(parsed.error),
      });
    }

    // Ordering is structural, not remembered: the accepted flag is an argument, and
    // the walk reads the raw payload rather than `parsed.data`, so a schema default
    // could never be counted as something the vendor sent (ADR 15).
    noteAcceptedPayload({
      ledger,
      vendor: "A",
      accepted: true,
      payload,
      knownPaths: VENDOR_A_KNOWN_PATHS,
    });

    const instant = parseIsoInstant(parsed.data.timestamp);
    if (instant === null || !epochMillisecondsSchema.safeParse(instant).success) {
      return failure({
        kind: "unmappable_value",
        vendor: "A",
        issues: issuesForKind(
          "unmappable_value",
          "timestamp",
          "Expected a complete ISO-8601 instant with a zone designator, within the canonical epoch range.",
        ),
      });
    }

    const { telemetry } = parsed.data;

    const capabilities: Capabilities = {
      dock: { docked: telemetry.dock.docked, dockId: telemetry.dock.dock_id },
      lidarHealth: { severity: lidarSeverity(telemetry.lidar.fault), rpm: telemetry.lidar.rpm },
      sequence: { value: parsed.data.seq },
    };

    const envelope: AdapterEnvelope = {
      schemaVersion: SCHEMA_VERSION,
      robotId: parsed.data.robot_id,
      siteId: parsed.data.site,
      vendorId: "A",
      model: parsed.data.model,
      adapterId: ADAPTER_ID,
      adapterVersion: ADAPTER_VERSION,
      reportedAt: instant,
      receivedAt,
      capabilities,
      core: {
        // No dialect field reports link state, and the contract's rule for that is
        // `unknown` rather than an optimistic `online` (`connectivitySchema`).
        connectivity: "unknown",
        batteryPercent: toBatteryPercent(telemetry.battery.level),
        // The frame is the site: vendor A's pose is metres in that site's own map,
        // and `positionSchema` requires a named frame because coordinates without
        // one are numbers an operator cannot act on.
        position: { frame: parsed.data.site, x: telemetry.pose.x_m, y: telemetry.pose.y_m },
        status: STATUS_BY_STATE[telemetry.state],
        health: { severity: SEVERITY_BY_LEVEL[telemetry.health.level] },
      },
    };

    return ok(envelope);
  };
}
