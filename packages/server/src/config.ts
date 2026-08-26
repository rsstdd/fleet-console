import { readFile } from "node:fs/promises";
import { displayNameSchema, fleetSiteSchema, identifierSchema } from "@fleet/contracts";
import { z } from "zod";
import { SUPPORTED_VENDORS } from "./adapters/result.ts";

export class ConfigValidationError extends Error {
  constructor(source: string, issues: readonly string[]) {
    super(`Invalid configuration in ${source}:\n  - ${issues.join("\n  - ")}`);
    this.name = "ConfigValidationError";
  }
}

export const freshnessPolicySchema = z
  .strictObject({
    liveThresholdMs: z.number().int().positive(),
    staleThresholdMs: z.number().int().positive(),
    sweepIntervalMs: z.number().int().positive(),
    lateTickToleranceMs: z.number().int().min(0),
  })
  .refine((policy) => policy.liveThresholdMs < policy.staleThresholdMs, {
    error: "liveThresholdMs must be less than staleThresholdMs, or no robot can ever be STALE",
    path: ["staleThresholdMs"],
  })
  .refine((policy) => policy.sweepIntervalMs <= policy.liveThresholdMs, {
    error:
      "sweepIntervalMs must not exceed liveThresholdMs, or silence outlives its own detection window",
    path: ["sweepIntervalMs"],
  });
export type FreshnessPolicy = z.infer<typeof freshnessPolicySchema>;

const manifestRobotSchema = z.strictObject({
  robotId: identifierSchema,
  siteId: identifierSchema,
  vendorId: z.enum(SUPPORTED_VENDORS),
  model: displayNameSchema,
});

export const fleetManifestSchema = z
  .strictObject({
    sites: z.array(fleetSiteSchema).min(1),
    robots: z.array(manifestRobotSchema).min(1),
  })
  .superRefine((manifest, ctx) => {
    const siteIds = new Set(manifest.sites.map((site) => site.siteId));
    if (siteIds.size !== manifest.sites.length) {
      ctx.addIssue({ code: "custom", path: ["sites"], message: "duplicate site id", input: null });
    }
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
export type FleetManifest = z.infer<typeof fleetManifestSchema>;

export interface ServerConfiguration {
  readonly freshness: FreshnessPolicy;
  readonly manifest: FleetManifest;
}

export interface RuntimeEndpoints {
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, source: string): T {
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  throw new ConfigValidationError(
    source,
    result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path === "" ? issue.message : `${path}: ${issue.message}`;
    }),
  );
}

export function parseFreshnessPolicy(input: unknown, source = "freshness.json"): FreshnessPolicy {
  return parseOrThrow(freshnessPolicySchema, input, source);
}

export function parseFleetManifest(input: unknown, source = "fleet-manifest.json"): FleetManifest {
  return parseOrThrow(fleetManifestSchema, input, source);
}

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error: unknown) {
    throw new ConfigValidationError(path, [
      error instanceof Error ? error.message : "unknown read failure",
    ]);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new ConfigValidationError(path, [
      error instanceof Error ? error.message : "invalid JSON",
    ]);
  }
}

export async function loadServerConfiguration(
  freshnessPath: string,
  manifestPath: string,
): Promise<ServerConfiguration> {
  const [freshness, manifest] = await Promise.all([
    readJson(freshnessPath),
    readJson(manifestPath),
  ]);
  return {
    freshness: parseFreshnessPolicy(freshness, freshnessPath),
    manifest: parseFleetManifest(manifest, manifestPath),
  };
}

export function readRuntimeEndpoints(env: NodeJS.ProcessEnv = process.env): RuntimeEndpoints {
  const origins = (env.FLEET_ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin !== "");
  return {
    host: env.FLEET_HOST ?? "127.0.0.1",
    port: Number(env.FLEET_PORT ?? "8080"),
    allowedOrigins: origins,
  };
}
