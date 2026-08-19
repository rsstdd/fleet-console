/**
 * Dispatches a simulated robot to its vendor's serializer.
 *
 * The only thing shared across the three dialects: which function to call. No
 * field, unit or shape is shared, because every one of those disagreements is
 * load-bearing evidence for the adapter contract tests (ADR 1 § Implications).
 */
import type { SimulatedRobot } from "../fleet/simulatedRobot.ts";
import { buildVendorAPayload, type VendorAPayload } from "./vendorA.ts";
import { buildVendorBPayload, type VendorBPayload } from "./vendorB.ts";
import { buildVendorCPayload, type VendorCPayload } from "./vendorC.ts";

/** Any vendor's wire payload; the union is never narrowed by inspecting fields. */
export type VendorPayload = VendorAPayload | VendorBPayload | VendorCPayload;

/** Serializes a robot into its own vendor's dialect at the given wall-clock instant. */
export function buildPayload(robot: SimulatedRobot, nowMs: number): VendorPayload {
  switch (robot.identity.vendor) {
    case "A":
      return buildVendorAPayload(robot, nowMs);
    case "B":
      return buildVendorBPayload(robot, nowMs);
    case "C":
      return buildVendorCPayload(robot, nowMs);
  }
}
