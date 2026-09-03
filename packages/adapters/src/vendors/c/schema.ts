/**
 * Vendor C's wire dialect: broadly A-shaped, with a tank where A has a lidar, and
 * with one field this schema deliberately does not declare.
 *
 * **`telemetry.firmware_channel` is absent on purpose and must stay absent.** It is
 * the payload's undocumented field, and declaring it here would make it a known
 * path — which would silence the unknown-field ledger and delete the only evidence
 * in the repository that ADR 1's counting requirement works. The `looseObject` on
 * `telemetry` is what lets the payload be accepted anyway; `VENDOR_C_KNOWN_PATHS`
 * is what makes the field countable. If a future dialect revision documents it,
 * adding it here is the correct change and the ledger going quiet is the expected
 * consequence — not a regression.
 *
 * **Not shared with vendor A, despite the near-identical shape.** Lint forbids the
 * import and ADR 1 is the reason: these are two independent vendor contracts that
 * agree today. A shared schema would turn one vendor's revision into an edit that
 * silently changes the other, and the near-miss is exactly what makes that
 * tempting. `packages/simulator/src/vendors/vendorC.ts` keeps its serializer
 * separate for the same reason and says so.
 *
 * Coupling: producer is `packages/simulator/src/vendors/vendorC.ts`; its recorded
 * output is the fixture set this is tested against (ADR 13).
 */
import { displayNameSchema, identifierSchema } from "@fleet/contracts";
import { z } from "zod";

import { knownFieldPaths } from "../../core/unknownFieldPaths.ts";

/** Vendor C's status vocabulary, which happens to match vendor A's and is not shared with it. */
export const VENDOR_C_STATES = ["idle", "busy", "charging", "fault"] as const;

/** Vendor C's health vocabulary, which matches the canonical severities by name. */
export const VENDOR_C_HEALTH_LEVELS = ["nominal", "degraded", "critical"] as const;

/** One vendor C telemetry reading, validated as vendor C writes it. */
export const vendorCPayloadSchema = z.looseObject({
  robot_id: identifierSchema,
  site: identifierSchema,
  model: displayNameSchema,
  seq: z.number().int().min(0),
  /** ISO-8601; the adapter owns the conversion and its `unmappable_value` failure. */
  timestamp: z.string(),
  telemetry: z.looseObject({
    battery: z.looseObject({ level: z.number().min(0).max(1) }),
    pose: z.looseObject({
      x_m: z.number(),
      y_m: z.number(),
      /** Declared so the deliberate drop is a known field, not counted as unknown. */
      heading_deg: z.number(),
    }),
    state: z.enum(VENDOR_C_STATES),
    health: z.looseObject({ level: z.enum(VENDOR_C_HEALTH_LEVELS) }),
    dock: z.looseObject({ docked: z.boolean(), dock_id: identifierSchema.nullable() }),
    /** Already a percentage in this dialect, unlike battery — no conversion, and no lidar block. */
    water: z.looseObject({ level_pct: z.number().min(0).max(100) }),
  }),
});

/** A decoded vendor C payload, in the vendor's units and vocabulary. */
export type VendorCPayload = z.infer<typeof vendorCPayloadSchema>;

/**
 * Every dotted path vendor C declares, computed once at module load.
 *
 * `telemetry.firmware_channel` is not among them, which is the point: the walk
 * reports it against every accepted payload and the ledger counts it (ADR 15).
 */
export const VENDOR_C_KNOWN_PATHS: ReadonlySet<string> = knownFieldPaths(vendorCPayloadSchema);
