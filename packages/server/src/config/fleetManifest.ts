import { SUPPORTED_VENDORS } from "@fleet/adapters";
import { displayNameSchema, fleetSiteSchema, identifierSchema } from "@fleet/contracts";
import { z } from "zod";

import { ConfigValidationError } from "./freshnessPolicy.ts";

const manifestRobotSchema = z.strictObject({
  robotId: identifierSchema,
  siteId: identifierSchema,
  vendorId: z.enum(SUPPORTED_VENDORS),
  model: displayNameSchema,
});

/**
 * Strict schema for the shared fleet configuration: the site directory plus the
 * registered-robot roster (ADR 14, ADR 34).
 *
 * Site definitions reuse the contract's `fleetSiteSchema` rather than a local
 * shape, because the manifest's sites are exactly what `GET /api/fleet` carries
 * onward — a second spelling here is where the two would drift (Principle 1).
 * The same referential rules apply at both boundaries: site ids are unique and
 * every robot references a defined site.
 */
export const fleetManifestSchema = z
  .strictObject({
    sites: z.array(fleetSiteSchema).min(1),
    robots: z.array(manifestRobotSchema).min(1),
  })
  .superRefine((manifest, ctx) => {
    const siteIds = new Set<string>();
    manifest.sites.forEach((site, index) => {
      if (siteIds.has(site.siteId)) {
        ctx.addIssue({
          code: "custom",
          path: ["sites", index, "siteId"],
          message: `duplicate site id: ${site.siteId}`,
          input: site.siteId,
        });
      }
      siteIds.add(site.siteId);
    });
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
      if (!siteIds.has(robot.siteId)) {
        ctx.addIssue({
          code: "custom",
          path: ["robots", index, "siteId"],
          message: `robot references undefined site: ${robot.siteId}`,
          input: robot.siteId,
        });
      }
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
