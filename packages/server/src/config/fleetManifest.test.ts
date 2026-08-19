import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ConfigValidationError } from "./freshnessPolicy.ts";
import { parseFleetManifest } from "./fleetManifest.ts";

/**
 * The server half of the manifest parity chain (ADR 14). This asserts the
 * roster the repository actually ships is valid server input; the simulator
 * half, `packages/simulator/src/fleet/manifestParity.test.ts`, asserts that
 * `--print-manifest` reproduces that same file byte for byte. Together they
 * prove the printed roster boots the server, without either package importing
 * the other.
 */
const COMMITTED_MANIFEST = fileURLToPath(
  new URL("../../../../config/fleet-manifest.json", import.meta.url),
);

const ROBOT = { robotId: "R-001", siteId: "site-a", vendorId: "A", model: "Carrier 1" };

describe("parseFleetManifest", () => {
  it("strictly parses a fleet roster", () => {
    expect(parseFleetManifest({ robots: [ROBOT] })).toEqual({ robots: [ROBOT] });
  });

  it("rejects duplicates, missing fields, extra fields, and unsupported vendors", () => {
    for (const input of [
      { robots: [ROBOT, ROBOT] },
      { robots: [{ robotId: "R-001" }] },
      { robots: [{ ...ROBOT, region: "north" }] },
      { robots: [{ ...ROBOT, vendorId: "D" }] },
    ]) {
      expect(() => parseFleetManifest(input)).toThrow(ConfigValidationError);
    }
  });

  it("accepts the roster this repository ships", () => {
    const committed: unknown = JSON.parse(readFileSync(COMMITTED_MANIFEST, "utf8"));

    const manifest = parseFleetManifest(committed);

    expect(manifest.robots).toHaveLength(50);
    // Not a smoke test: the schema is strict, so this fails if the shipped file
    // ever gains a wrapper key, loses `vendorId`, or names a vendor no adapter
    // supports — the three ways the simulator's output used to be invalid here.
    expect(manifest.robots[0]).toEqual({
      robotId: "R-001",
      siteId: "SITE-NORTH",
      vendorId: "A",
      model: "AX-240",
    });
  });
});
