/**
 * Vendor A's wire dialect, decoded as the vendor's own shape rather than the
 * canonical one.
 *
 * Every object is `looseObject`, including the nested ones, and that is the whole
 * of ADR 15's mechanism. A strict object *rejects* an unrecognized key, but ADR 1
 * requires an unknown field to be counted on a payload that still normalizes, and
 * one operation cannot do both. Loose accepts it; `knownFieldPaths` below derives
 * what the dialect declared; `findUnknownFieldPaths` reports the difference. A
 * nested strict object would break this at exactly the case that matters, since
 * vendor C's undocumented field is nested.
 *
 * `identifierSchema` and `displayNameSchema` come from `@fleet/contracts` rather
 * than being restated as local regexes. They are the constraints the canonical
 * envelope enforces on these same values, so validating them here is what makes a
 * bad `robot_id` a `malformed_payload` with a path pointing at `robot_id`, instead
 * of an envelope that fails to parse later with no vendor field to blame.
 *
 * `timestamp` is checked only as a string here. Whether it names a real instant is
 * the adapter's judgement and produces `unmappable_value`, because a well-formed
 * string carrying an impossible date is not a malformed document (ADR 20, and the
 * `unparsable-timestamp` payload under `__malformed__/`).
 *
 * Coupling: the producer is `packages/simulator/src/vendors/vendorA.ts`, and its
 * recorded output is the fixture set this schema is tested against. A field, unit
 * or name changing there changes this file, its fixtures and its contract test in
 * one commit (Principle 14, ADR 13).
 */
import { displayNameSchema, identifierSchema } from "@fleet/contracts";
import { z } from "zod";

import { knownFieldPaths } from "../../core/unknownFieldPaths.ts";

/** Vendor A's status vocabulary, which happens to be four of the canonical five. */
export const VENDOR_A_STATES = ["idle", "busy", "charging", "fault"] as const;

/** Vendor A's health vocabulary, which matches the canonical severities by name. */
export const VENDOR_A_HEALTH_LEVELS = ["nominal", "degraded", "critical"] as const;

/** One vendor A telemetry reading, validated as vendor A writes it. */
export const vendorAPayloadSchema = z.looseObject({
  robot_id: identifierSchema,
  site: identifierSchema,
  model: displayNameSchema,
  /** The vendor's own reading counter; becomes the `sequence` capability. */
  seq: z.number().int().min(0),
  /** ISO-8601; converted by the adapter, which owns the failure (see the module comment). */
  timestamp: z.string(),
  telemetry: z.looseObject({
    /** A fraction, not a percentage — the conversion the canonical model needs. */
    battery: z.looseObject({ level: z.number().min(0).max(1) }),
    pose: z.looseObject({
      x_m: z.number(),
      y_m: z.number(),
      /**
       * Reported by the dialect and dropped by the adapter: `positionSchema` has
       * no heading, because ADR 1 treats a canonical field no adapter populates
       * as a defect. Declared here so it is a known field rather than one the
       * ledger counts as unknown — the drop is deliberate and silent by design.
       */
      heading_deg: z.number(),
    }),
    state: z.enum(VENDOR_A_STATES),
    health: z.looseObject({ level: z.enum(VENDOR_A_HEALTH_LEVELS) }),
    dock: z.looseObject({ docked: z.boolean(), dock_id: identifierSchema.nullable() }),
    lidar: z.looseObject({ rpm: z.number().min(0).max(10_000), fault: z.boolean() }),
  }),
});

/** A decoded vendor A payload, in the vendor's units and vocabulary. */
export type VendorAPayload = z.infer<typeof vendorAPayloadSchema>;

/**
 * Every dotted path vendor A declares, computed once at module load.
 *
 * Derived from the schema rather than hand-listed beside it, so the two cannot
 * disagree, and computed here rather than per payload because it is a schema
 * traversal and ADR 2's peak is roughly 2,500 readings a second (ADR 15).
 */
export const VENDOR_A_KNOWN_PATHS: ReadonlySet<string> = knownFieldPaths(vendorAPayloadSchema);
