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

export const vendorAPayloadSchema = z.looseObject({
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
    lidar: z.looseObject({ rpm: z.number().min(0).max(10_000), fault: z.boolean() }),
  }),
});
export type VendorAPayload = z.infer<typeof vendorAPayloadSchema>;

export const VENDOR_A_KNOWN_PATHS: ReadonlySet<string> = new Set([
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
  "telemetry.lidar",
  "telemetry.lidar.rpm",
  "telemetry.lidar.fault",
]);

export function createVendorAAdapter(ledger: UnknownFieldLedger): VendorAdapter {
  return (payload, receivedAt) => {
    const parsed = vendorAPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return failure({
        kind: "malformed_payload",
        vendor: "A",
        issues: toContractIssues(parsed.error),
      });
    }

    ledger.note("A", findUnknownFieldPaths(payload, VENDOR_A_KNOWN_PATHS));

    const instant = parseIsoInstant(parsed.data.timestamp);
    if (instant === null || !epochMillisecondsSchema.safeParse(instant).success) {
      return unmappable(
        "A",
        "timestamp",
        "Expected a complete ISO-8601 instant with a zone designator, within the canonical epoch range.",
      );
    }

    const { telemetry } = parsed.data;
    const capabilities: Capabilities = {
      dock: { docked: telemetry.dock.docked, dockId: telemetry.dock.dock_id },
      lidarHealth: {
        severity: telemetry.lidar.fault ? "critical" : "nominal",
        rpm: telemetry.lidar.rpm,
      },
      sequence: { value: parsed.data.seq },
    };

    const envelope: AdapterEnvelope = {
      schemaVersion: SCHEMA_VERSION,
      robotId: parsed.data.robot_id,
      siteId: parsed.data.site,
      vendorId: "A",
      model: parsed.data.model,
      adapterId: "vendor-a",
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
