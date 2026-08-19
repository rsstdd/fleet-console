/**
 * Violates nothing.
 *
 * The control the other fixtures depend on: without it, a rule set reporting
 * nothing for any input would satisfy every assertion in `enforcement.test.ts`.
 * Imports within the package, takes time as an argument rather than reading a
 * clock, and asserts nothing into shape.
 */
import { VENDOR_IDS, type VendorId } from "../fleet/simulatedRobot.ts";

/** Pairs the package's own vendor list with an injected instant. */
export function vendorsAt(nowMs: number): {
  readonly vendors: readonly VendorId[];
  readonly at: number;
} {
  return { vendors: [...VENDOR_IDS], at: nowMs };
}
