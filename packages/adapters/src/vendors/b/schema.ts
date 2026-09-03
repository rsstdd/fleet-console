/**
 * Vendor B's wire dialect: one flat object, integers throughout, no nesting.
 *
 * Every object is `looseObject` for the reason ADR 15 gives — a strict object
 * rejects an unrecognized key, while ADR 1 requires an unknown field to be
 * *counted* on a payload that still normalizes, and one operation cannot do
 * both. There is only one object to be loose about here: vendor B has no nested
 * block, so its unknown fields are top-level names rather than dotted paths, and
 * it is the dialect that proves the walk handles a flat payload as well as
 * vendor C's nested one.
 *
 * `identifierSchema` and `displayNameSchema` come from `@fleet/contracts` rather
 * than being restated, so a bad `id` is a `malformed_payload` naming `id` instead
 * of an envelope that fails to parse later with no vendor field to blame.
 *
 * **Two kinds of number are checked here and two are not.** `batt_pct` is a
 * percentage and `[0, 100]` is the dialect's own declared range, so a value
 * outside it is a malformed document. `ts` and the three codes are checked only
 * for *shape* — a number, an integer — because whether an integer names a real
 * instant, or a status this adapter understands, is a mapping question the
 * adapter answers with `unmappable_value` (ADR 20, and the split vendor A makes
 * between its `timestamp` string and the instant it may not name). The codes are
 * deliberately not constrained to their known values: doing so would make an
 * unrecognized code a schema rejection for vendor B and a mapping rejection for
 * every dialect that spells its states as words, for no difference a reader
 * could defend.
 *
 * Coupling: the producer is `packages/simulator/src/vendors/vendorB.ts`, and its
 * recorded output is the fixture set this schema is tested against. A field,
 * unit or code changing there changes this file, its fixtures and its contract
 * test in one commit (Principle 14, ADR 13).
 */
import { displayNameSchema, identifierSchema } from "@fleet/contracts";
import { z } from "zod";

import { knownFieldPaths } from "../../core/unknownFieldPaths.ts";

/** One vendor B telemetry reading, validated as vendor B writes it. */
export const vendorBPayloadSchema = z.looseObject({
  id: identifierSchema,
  site: identifierSchema,
  model: displayNameSchema,
  /** Epoch milliseconds, not an ISO string; the adapter owns whether it is a legal instant. */
  ts: z.number(),
  /** A whole percentage, not a fraction — vendor B keeps the whole payload integer-valued. */
  batt_pct: z.number().int().min(0).max(100),
  /** Whole centimetres, converted to metres by the adapter. */
  x_cm: z.number().int(),
  y_cm: z.number().int(),
  /**
   * Reported by the dialect and dropped by the adapter: `positionSchema` has no
   * heading, because ADR 1 treats a canonical field no adapter populates as a
   * defect. Declared here so it is a known field rather than one the ledger
   * counts as unknown — the drop is deliberate and silent by design, as it is
   * for vendor A's `heading_deg`.
   */
  heading_cdeg: z.number().int(),
  status_code: z.number().int(),
  health_code: z.number().int(),
  dock_state: z.number().int(),
});

/** A decoded vendor B payload, in the vendor's units and codes. */
export type VendorBPayload = z.infer<typeof vendorBPayloadSchema>;

/**
 * Every field name vendor B declares, computed once at module load.
 *
 * Derived from the schema rather than hand-listed beside it, so the two cannot
 * disagree, and computed here rather than per payload because it is a schema
 * traversal and ADR 2's peak is roughly 2,500 readings a second (ADR 15).
 */
export const VENDOR_B_KNOWN_PATHS: ReadonlySet<string> = knownFieldPaths(vendorBPayloadSchema);
