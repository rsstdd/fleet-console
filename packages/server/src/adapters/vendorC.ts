import {
  SCHEMA_VERSION,
  type AdapterEnvelope,
  type Capabilities,
  displayNameSchema,
  epochMillisecondsSchema,
  type HealthSeverity,
  identifierSchema,
  type RobotStatus,
  toContractIssues,
} from "@fleet/contracts";
import { z } from "zod";
import { parseIsoInstant, toBatteryPercent } from "./format.ts";
import { failure, ok, unmappable, type VendorAdapter } from "./result.ts";
import { findUnknownFieldPaths, type UnknownFieldLedger } from "./unknownFields.ts";

export const vendorCPayloadSchema = z.looseObject({
  robot_id: identifierSchema,
  site: identifierSchema,
  model: displayNameSchema,
  seq: z.number().int().min(0),
  timestamp: z.string(),
  telemetry: z.looseObject({
    battery: z.looseObject({ level: z.number().min(0).max(1) }),
    pose: z.looseObject({ x_m: z.number(), y_m: z.number(), heading_deg: z.number() }),
    state: z.enum(["idle", "busy", "charging", "fault"]),
    health: z.looseObject({ level: z.enum(["nominal", "degraded", "critical"]) }),
    dock: z.looseObject({ docked: z.boolean(), dock_id: identifierSchema.nullable() }),
    water: z.looseObject({ level_pct: z.number().min(0).max(100) }),
  }),
});
export type VendorCPayload = z.infer<typeof vendorCPayloadSchema>;

export const VENDOR_C_KNOWN_PATHS: ReadonlySet<string> = new Set([
  "robot_id",
  "site",
  "model",
  "seq",
  "timestamp",
  "telemetry",
  "telemetry.battery",
  "telemetry.battery.level",
  "telemetry.pose",
  "telemetry.pose.x_m",
  "telemetry.pose.y_m",
  "telemetry.pose.heading_deg",
  "telemetry.state",
  "telemetry.health",
  "telemetry.health.level",
  "telemetry.dock",
  "telemetry.dock.docked",
  "telemetry.dock.dock_id",
  "telemetry.water",
  "telemetry.water.level_pct",
]);

export function createVendorCAdapter(ledger: UnknownFieldLedger): VendorAdapter {
  return (payload, receivedAt) => {
    const parsed = vendorCPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return failure({
        kind: "malformed_payload",
        vendor: "C",
        issues: toContractIssues(parsed.error),
      });
    }

    ledger.note("C", findUnknownFieldPaths(payload, VENDOR_C_KNOWN_PATHS));

    const instant = parseIsoInstant(parsed.data.timestamp);
    if (instant === null || !epochMillisecondsSchema.safeParse(instant).success) {
      return unmappable(
        "C",
        "timestamp",
        "Expected a complete ISO-8601 instant with a zone designator, within the canonical epoch range.",
      );
    }

    const { telemetry } = parsed.data;
    const capabilities: Capabilities = {
      dock: { docked: telemetry.dock.docked, dockId: telemetry.dock.dock_id },
      waterLevel: { percent: telemetry.water.level_pct },
      sequence: { value: parsed.data.seq },
    };

    const envelope: AdapterEnvelope = {
      schemaVersion: SCHEMA_VERSION,
      robotId: parsed.data.robot_id,
      siteId: parsed.data.site,
      vendorId: "C",
      model: parsed.data.model,
      adapterId: "vendor-c",
      adapterVersion: "1.0.0",
      reportedAt: instant,
      receivedAt,
      capabilities,
      core: {
        connectivity: "unknown",
        batteryPercent: toBatteryPercent(telemetry.battery.level),
        position: { frame: parsed.data.site, x: telemetry.pose.x_m, y: telemetry.pose.y_m },
        status: telemetry.state satisfies RobotStatus,
        health: { severity: telemetry.health.level satisfies HealthSeverity },
      },
    };
    return ok(envelope);
  };
}
