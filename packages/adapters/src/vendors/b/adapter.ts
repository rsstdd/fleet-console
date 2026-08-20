/**
 * Vendor B: flat payload, integer-percentage battery, centimetres, epoch-ms
 * timestamp, numeric status codes — and no sequence field at all.
 *
 * ## Status vocabulary
 *
 * | `status_code` | canonical `status` |
 * | ------------- | ------------------ |
 * | `0`           | `idle`             |
 * | `1`           | `busy`             |
 * | `2`           | `charging`         |
 * | `3`           | `fault`            |
 *
 * ## Health severity
 *
 * | `health_code` | canonical `health.severity` |
 * | ------------- | --------------------------- |
 * | `0`           | `nominal`                   |
 * | `1`           | `degraded`                  |
 * | `2`           | `critical`                  |
 *
 * ## Dock state
 *
 * | `dock_state` | canonical `dock.docked` |
 * | ------------ | ----------------------- |
 * | `0`          | `false`                  |
 * | `1`          | `true`                   |
 *
 * A code outside its table is `unmappable_value`, not canonical `unknown` and not
 * a guess (**C5**). The distinction the rejection preserves: `unknown` would say
 * the robot's state is unknown, when what is actually unknown is the *code* —
 * that is an integration defect, and the server counts it as one rather than
 * showing an operator a state nobody reported. Vendor A reaches the same outcome
 * through its schema, because a dialect spelling its states as words declares its
 * vocabulary and a dialect spelling them as integers does not.
 *
 * ## Capabilities
 *
 * Declares **`dock` and nothing else**, and both absences are load-bearing.
 *
 * **No `sequence`:** vendor B sends no counter, and `ts` is not one. Ordering by
 * timestamp cannot separate a duplicate delivery from two events in the same
 * millisecond, and that ambiguity is the thing vendor B exists to demonstrate
 * (ADR 1 § Implications). Synthesizing a counter here would delete it.
 *
 * **No `lidarHealth`:** the payload carries no lidar source data, so there is
 * nothing to declare it from — and the absence is what makes vendor B's operator
 * capability set differ from vendor A's. `sequence` could not have done that job:
 * [ADR 19](../../../../docs/00_adr/19_CAPABILITY_KIND_SPLITS_THE_NAME_SET_IN_CONTRACTS.md)
 * classifies it `diagnostic` in `CAPABILITY_KINDS`, and the console keys its panel
 * registry off `OPERATOR_CAPABILITY_NAMES`, so a vendor B declaring `lidarHealth`
 * would render the same panels as vendor A. Settled in ADR 1 § Observed
 * consequences, 19 August 2026.
 *
 * Coupling: producer is `packages/simulator/src/vendors/vendorB.ts`; the schema
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
import { failure, issuesForKind, ok, type AdapterFailure } from "../../core/result.ts";
import { noteAcceptedPayload, type UnknownFieldLedger } from "../../core/unknownFields.ts";
import { VENDOR_B_KNOWN_PATHS, vendorBPayloadSchema } from "./schema.ts";

/**
 * This adapter's own identifier, distinct from the vendor id it decodes.
 *
 * Spelled the way `vendor-a` is, and for the same reason: `vendorId` names the
 * dialect's producer while `adapterId` names the software that understands it.
 * The open half — that `UnknownFieldSnapshot.byAdapter` is keyed by
 * `SupportedVendor` while ADR 25's health response is keyed by open identifier —
 * is recorded once, on vendor A's `ADAPTER_ID`, and is the **C8** registry's to
 * settle rather than each adapter's.
 */
const ADAPTER_ID = "vendor-b";

/**
 * Bumped when this adapter's output changes for an unchanged input.
 *
 * A mapping correction, a newly declared capability and a unit fix all qualify;
 * a comment or a test does not.
 */
const ADAPTER_VERSION = "1.0.0";

/** Vendor B's status codes, mapped to the canonical vocabulary the table above documents. */
const STATUS_BY_CODE: Readonly<Record<number, RobotStatus>> = {
  0: "idle",
  1: "busy",
  2: "charging",
  3: "fault",
};

/** Vendor B's health codes, mapped to canonical severity. */
const SEVERITY_BY_CODE: Readonly<Record<number, HealthSeverity>> = {
  0: "nominal",
  1: "degraded",
  2: "critical",
};

/** Vendor B's dock codes; the dialect has no third state and no dock identifier. */
const DOCKED_BY_CODE: Readonly<Record<number, boolean>> = {
  0: false,
  1: true,
};

/**
 * Rejects one integer code the dialect used and this adapter has no mapping for.
 *
 * The message names the field and the rule, never the value: these issues are
 * serialized into an HTTP error body, and a code echoed back is still vendor
 * content (ADR 20, Principle 7).
 */
function unmappable(field: string, what: string): AdapterFailure {
  return failure({
    kind: "unmappable_value",
    vendor: "B",
    issues: issuesForKind("unmappable_value", field, `Expected ${what}.`),
  });
}

/**
 * Metres, from the vendor's whole centimetres.
 *
 * Dividing an integer by 100 is correctly rounded to the nearest double, which is
 * the same value the decimal literal would parse to — so unlike vendor A's
 * fraction-to-percentage multiplication, this needs no rounding step to keep
 * digits the vendor never sent off a technician's screen.
 *
 * Local rather than in `core/units.ts` by that file's own admission rule: it takes
 * a conversion when two or more dialects need it, so the two cannot disagree about
 * one right answer. Vendor B is the only dialect that reports centimetres.
 */
function toMetres(centimetres: number): number {
  return centimetres / 100;
}

/**
 * Builds the vendor B adapter over a caller-owned unknown-field ledger.
 *
 * The ledger is closed over rather than passed per call so that one process has
 * one tally per adapter, which is the only scope ADR 1 permits and the only one
 * `UnknownFieldSnapshot` can express.
 */
export function createVendorBAdapter(ledger: UnknownFieldLedger): VendorAdapter {
  return function decodeVendorB(payload, receivedAt) {
    const parsed = vendorBPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return failure({
        kind: "malformed_payload",
        vendor: "B",
        issues: toContractIssues(parsed.error),
      });
    }

    // Ordering is structural, not remembered: the accepted flag is an argument, and
    // the walk reads the raw payload rather than `parsed.data`, so a schema default
    // could never be counted as something the vendor sent (ADR 15).
    noteAcceptedPayload({
      ledger,
      vendor: "B",
      accepted: true,
      payload,
      knownPaths: VENDOR_B_KNOWN_PATHS,
    });

    const reading = parsed.data;

    if (!epochMillisecondsSchema.safeParse(reading.ts).success) {
      return unmappable("ts", "whole epoch milliseconds within the canonical range");
    }

    const status = STATUS_BY_CODE[reading.status_code];
    if (status === undefined) {
      return unmappable("status_code", "one of vendor B's four documented status codes");
    }

    const severity = SEVERITY_BY_CODE[reading.health_code];
    if (severity === undefined) {
      return unmappable("health_code", "one of vendor B's three documented health codes");
    }

    const docked = DOCKED_BY_CODE[reading.dock_state];
    if (docked === undefined) {
      return unmappable("dock_state", "0 or 1");
    }

    const capabilities: Capabilities = {
      // Null rather than a synthesized name: vendor B reports that a robot is
      // docked without saying which dock, which is exactly the case
      // `dockCapabilitySchema` makes the field nullable for.
      dock: { docked, dockId: null },
    };

    const envelope: AdapterEnvelope = {
      schemaVersion: SCHEMA_VERSION,
      robotId: reading.id,
      siteId: reading.site,
      vendorId: "B",
      model: reading.model,
      adapterId: ADAPTER_ID,
      adapterVersion: ADAPTER_VERSION,
      reportedAt: reading.ts,
      receivedAt,
      capabilities,
      core: {
        // No dialect field reports link state, and the contract's rule for that is
        // `unknown` rather than an optimistic `online` (`connectivitySchema`).
        connectivity: "unknown",
        batteryPercent: reading.batt_pct,
        // The frame is the site: vendor B's pose is centimetres in that site's own
        // map, and `positionSchema` requires a named frame because coordinates
        // without one are numbers an operator cannot act on.
        position: { frame: reading.site, x: toMetres(reading.x_cm), y: toMetres(reading.y_cm) },
        status,
        health: { severity },
      },
    };

    return ok(envelope);
  };
}
