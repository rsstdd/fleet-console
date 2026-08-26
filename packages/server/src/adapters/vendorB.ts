import {
  SCHEMA_VERSION,
  type AdapterEnvelope,
  displayNameSchema,
  epochMillisecondsSchema,
  type HealthSeverity,
  identifierSchema,
  type RobotStatus,
  toContractIssues,
} from "@fleet/contracts";
import { z } from "zod";
import { failure, ok, unmappable, type VendorAdapter } from "./result.ts";
import { findUnknownFieldPaths, type UnknownFieldLedger } from "./unknownFields.ts";

/** Vendor B has no sequence signal; continuity remains unevaluated. */
export const vendorBPayloadSchema = z.looseObject({
  id: identifierSchema,
  site: identifierSchema,
  model: displayNameSchema,
  ts: z.number(),
  batt_pct: z.number().int().min(0).max(100),
  x_cm: z.number().int(),
  y_cm: z.number().int(),
  heading_cdeg: z.number().int(),
  status_code: z.number().int(),
  health_code: z.number().int(),
  dock_state: z.number().int(),
});
export type VendorBPayload = z.infer<typeof vendorBPayloadSchema>;

export const VENDOR_B_KNOWN_PATHS: ReadonlySet<string> = new Set([
  "id",
  "site",
  "model",
  "ts",
  "batt_pct",
  "x_cm",
  "y_cm",
  "heading_cdeg",
  "status_code",
  "health_code",
  "dock_state",
]);

const STATUS_BY_CODE: Readonly<Record<number, RobotStatus>> = {
  0: "idle",
  1: "busy",
  2: "charging",
  3: "fault",
};
const SEVERITY_BY_CODE: Readonly<Record<number, HealthSeverity>> = {
  0: "nominal",
  1: "degraded",
  2: "critical",
};
const DOCKED_BY_CODE: Readonly<Record<number, boolean>> = { 0: false, 1: true };

export function createVendorBAdapter(ledger: UnknownFieldLedger): VendorAdapter {
  return (payload, receivedAt) => {
    const parsed = vendorBPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return failure({
        kind: "malformed_payload",
        vendor: "B",
        issues: toContractIssues(parsed.error),
      });
    }

    ledger.note("B", findUnknownFieldPaths(payload, VENDOR_B_KNOWN_PATHS));

    const reading = parsed.data;
    if (!epochMillisecondsSchema.safeParse(reading.ts).success) {
      return unmappable("B", "ts", "Expected whole epoch milliseconds within the canonical range.");
    }
    const status = STATUS_BY_CODE[reading.status_code];
    if (status === undefined) {
      return unmappable(
        "B",
        "status_code",
        "Expected one of vendor B's four documented status codes.",
      );
    }
    const severity = SEVERITY_BY_CODE[reading.health_code];
    if (severity === undefined) {
      return unmappable(
        "B",
        "health_code",
        "Expected one of vendor B's three documented health codes.",
      );
    }
    const docked = DOCKED_BY_CODE[reading.dock_state];
    if (docked === undefined) {
      return unmappable("B", "dock_state", "Expected 0 or 1.");
    }

    const envelope: AdapterEnvelope = {
      schemaVersion: SCHEMA_VERSION,
      robotId: reading.id,
      siteId: reading.site,
      vendorId: "B",
      model: reading.model,
      adapterId: "vendor-b",
      adapterVersion: "1.0.0",
      reportedAt: reading.ts,
      receivedAt,
      capabilities: { dock: { docked, dockId: null } },
      core: {
        connectivity: "unknown",
        batteryPercent: reading.batt_pct,
        position: { frame: reading.site, x: reading.x_cm / 100, y: reading.y_cm / 100 },
        status,
        health: { severity },
      },
    };
    return ok(envelope);
  };
}
