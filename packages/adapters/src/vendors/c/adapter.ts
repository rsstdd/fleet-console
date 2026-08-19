/**
 * Vendor C: A-shaped payload with a water tank instead of a lidar, and one
 * undocumented field the ledger counts.
 *
 * ## Status vocabulary
 *
 * | `telemetry.state` | canonical `status` |
 * | ----------------- | ------------------ |
 * | `idle`            | `idle`             |
 * | `busy`            | `busy`             |
 * | `charging`        | `charging`         |
 * | `fault`           | `fault`            |
 *
 * Identical to vendor A's table and deliberately restated rather than imported.
 * Two vendor contracts that agree today are not one contract, and lint forbids the
 * cross-vendor import that would make them look like one (ADR 1). What *is* shared
 * — the battery unit conversion — lives in `core/units.ts`, because a unit
 * conversion has one right answer while a vocabulary mapping is a per-dialect fact.
 *
 * Canonical `unknown` is unreachable here for the same reason as vendor A: the
 * schema admits only these four values, so a fifth is a rejection rather than a
 * silent downgrade.
 *
 * ## Health severity
 *
 * | `telemetry.health.level` | canonical `health.severity` |
 * | ------------------------ | --------------------------- |
 * | `nominal`                | `nominal`                   |
 * | `degraded`               | `degraded`                  |
 * | `critical`               | `critical`                  |
 *
 * Written out for the same reason the status table is: a declared identity mapping
 * stops compiling when either vocabulary is renamed, while an assumed one keeps
 * passing the wrong value through. A level outside this table is a rejection —
 * canonical `HealthSeverity` has no `unknown` member to downgrade to, so there is
 * nothing here to guess with even if guessing were permitted.
 *
 * No `description` is emitted; vendor C sends no prose.
 *
 * ## Capabilities
 *
 * Declares `dock`, `waterLevel` and `sequence`. **Declares no `lidarHealth`, and
 * that absence is the declaration** — the payload has no lidar block at all, not
 * `null` and not an empty object, so the console renders no lidar panel (ADR 1).
 * Emitting `lidarHealth` with a null payload would claim the vendor reports a
 * lidar it does not have.
 *
 * ## The undocumented field
 *
 * `telemetry.firmware_channel` is not in `./schema.ts`, so every accepted payload
 * adds it to the per-adapter ledger at its dotted path. Per adapter, never per
 * robot: two vendor C robots sending it increment one count by two (ADR 1, ADR 15).
 *
 * Coupling: producer is `packages/simulator/src/vendors/vendorC.ts`; the ledger is
 * owned by `packages/server`, which serves `snapshot()` from `GET /api/health`.
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
import { failure, issuesForKind, ok } from "../../core/result.ts";
import { noteAcceptedPayload, type UnknownFieldLedger } from "../../core/unknownFields.ts";
import { toBatteryPercent } from "../../core/units.ts";
import { VENDOR_C_KNOWN_PATHS, vendorCPayloadSchema } from "./schema.ts";

/**
 * This adapter's own identifier, distinct from the `C` vendor id it decodes.
 *
 * Same split as vendor A's, and the same caveat: this is **not** the key
 * `UnknownFieldSnapshot.byAdapter` uses, which is `SupportedVendor`. The server
 * must pick one of the two spellings for the health response in the **C8**
 * registry that knows both, rather than joining them at the handler.
 */
const ADAPTER_ID = "vendor-c";

/** Bumped when this adapter's output changes for an unchanged input. */
const ADAPTER_VERSION = "1.0.0";

/** Vendor C's four states, mapped to the canonical vocabulary the table above documents. */
const STATUS_BY_STATE = {
  idle: "idle",
  busy: "busy",
  charging: "charging",
  fault: "fault",
} as const satisfies Record<string, RobotStatus>;

/** Vendor C's three health levels, mapped to canonical severity. */
const SEVERITY_BY_LEVEL = {
  nominal: "nominal",
  degraded: "degraded",
  critical: "critical",
} as const satisfies Record<string, HealthSeverity>;

/**
 * Builds the vendor C adapter over a caller-owned unknown-field ledger.
 *
 * The ledger matters more for this vendor than for the others: vendor C is the one
 * dialect that actually sends an undeclared field, so this is the adapter whose
 * accounting has something to count.
 */
export function createVendorCAdapter(ledger: UnknownFieldLedger): VendorAdapter {
  return function decodeVendorC(payload, receivedAt) {
    const parsed = vendorCPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return failure({
        kind: "malformed_payload",
        vendor: "C",
        issues: toContractIssues(parsed.error),
      });
    }

    // Counted before the timestamp is judged, and only because the schema accepted
    // the payload. A rejected payload belongs to the server's malformed-ingest
    // counter and the two must never be summed (ADR 15).
    noteAcceptedPayload({
      ledger,
      vendor: "C",
      accepted: true,
      payload,
      knownPaths: VENDOR_C_KNOWN_PATHS,
    });

    const instant = parseIsoInstant(parsed.data.timestamp);
    if (instant === null || !epochMillisecondsSchema.safeParse(instant).success) {
      return failure({
        kind: "unmappable_value",
        vendor: "C",
        issues: issuesForKind(
          "unmappable_value",
          "timestamp",
          "Expected a complete ISO-8601 instant with a zone designator, within the canonical epoch range.",
        ),
      });
    }

    const { telemetry } = parsed.data;

    // No `lidarHealth` key. Absence is how a capability is undeclared, and this
    // record is the whole declaration (ADR 1, AGENTS.md § Adapter contract).
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
      adapterId: ADAPTER_ID,
      adapterVersion: ADAPTER_VERSION,
      reportedAt: instant,
      receivedAt,
      capabilities,
      core: {
        // No dialect field reports link state; `unknown` rather than an optimistic
        // `online` is the contract's own rule (`connectivitySchema`).
        connectivity: "unknown",
        batteryPercent: toBatteryPercent(telemetry.battery.level),
        position: { frame: parsed.data.site, x: telemetry.pose.x_m, y: telemetry.pose.y_m },
        status: STATUS_BY_STATE[telemetry.state],
        health: { severity: SEVERITY_BY_LEVEL[telemetry.health.level] },
      },
    };

    return ok(envelope);
  };
}
