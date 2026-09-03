import { readFile } from "node:fs/promises";

import { type FleetManifest, parseFleetManifest } from "./fleetManifest.ts";
import {
  ConfigValidationError,
  type FreshnessPolicy,
  parseFreshnessPolicy,
} from "./freshnessPolicy.ts";

/** Fully decoded file-backed server configuration. */
export interface ServerConfiguration {
  readonly freshness: FreshnessPolicy;
  readonly manifest: FleetManifest;
}

async function readJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown read failure";
    throw new ConfigValidationError(path, [message]);
  }

  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new ConfigValidationError(path, [message]);
  }
}

/** Reads and strictly validates both shared configuration files once at startup. */
export async function loadServerConfiguration(
  freshnessPath: string,
  manifestPath: string,
): Promise<ServerConfiguration> {
  const [freshnessInput, manifestInput] = await Promise.all([
    readJson(freshnessPath),
    readJson(manifestPath),
  ]);
  return {
    freshness: parseFreshnessPolicy(freshnessInput, freshnessPath),
    manifest: parseFleetManifest(manifestInput, manifestPath),
  };
}
