import { SUPPORTED_VENDORS } from "@fleet/adapters";
import { displayNameSchema, identifierSchema } from "@fleet/contracts";
import { z } from "zod";

import { ConfigValidationError } from "./freshnessPolicy.ts";

const manifestRobotSchema = z.strictObject({
  robotId: identifierSchema,
  siteId: identifierSchema,
  vendorId: z.enum(SUPPORTED_VENDORS),
  model: displayNameSchema,
});

/** Strict schema for the shared registered-robot roster. */
export const fleetManifestSchema = z
  .strictObject({ robots: z.array(manifestRobotSchema).min(1) })
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    manifest.robots.forEach((robot, index) => {
      if (seen.has(robot.robotId)) {
        ctx.addIssue({
          code: "custom",
          path: ["robots", index, "robotId"],
          message: `duplicate robot id: ${robot.robotId}`,
          input: robot.robotId,
        });
      }
      seen.add(robot.robotId);
    });
  });

/** Validated fleet-manifest configuration. */
export type FleetManifest = z.infer<typeof fleetManifestSchema>;

/** Decodes an untrusted fleet manifest or fails startup with field-level issues. */
export function parseFleetManifest(
  input: unknown,
  source = "config/fleet-manifest.json",
): FleetManifest {
  const result = fleetManifestSchema.safeParse(input);
  if (result.success) return result.data;
  throw new ConfigValidationError(
    source,
    result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
  );
}
