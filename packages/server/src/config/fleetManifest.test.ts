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

const SITE = { siteId: "site-a", label: "Site A" };

const ROBOT = { robotId: "R-001", siteId: "site-a", vendorId: "A", model: "Carrier 1" };

describe("parseFleetManifest", () => {
  it("strictly parses the site directory and fleet roster", () => {
    expect(parseFleetManifest({ sites: [SITE], robots: [ROBOT] })).toEqual({
      sites: [SITE],
      robots: [ROBOT],
    });
  });

  it("rejects duplicates, missing fields, extra fields, and unsupported vendors", () => {
    for (const input of [
      { sites: [SITE], robots: [ROBOT, ROBOT] },
      { sites: [SITE], robots: [{ robotId: "R-001" }] },
      { sites: [SITE], robots: [{ ...ROBOT, region: "north" }] },
      { sites: [SITE], robots: [{ ...ROBOT, vendorId: "D" }] },
    ]) {
      expect(() => parseFleetManifest(input)).toThrow(ConfigValidationError);
    }
  });

  it("rejects a manifest without a site directory", () => {
    // ADR 34: the roster's site ids get their labels here, so a manifest with
    // robots and no sites cannot produce a valid snapshot.
    expect(() => parseFleetManifest({ robots: [ROBOT] })).toThrow(ConfigValidationError);
  });

  it("rejects duplicate site ids", () => {
    expect(() => parseFleetManifest({ sites: [SITE, SITE], robots: [ROBOT] })).toThrow(
      ConfigValidationError,
    );
  });

  it("rejects a robot referencing a site the directory does not define", () => {
    expect(() =>
      parseFleetManifest({ sites: [SITE], robots: [{ ...ROBOT, siteId: "site-b" }] }),
    ).toThrow(ConfigValidationError);
  });

  it("accepts the configuration this repository ships", () => {
    const committed: unknown = JSON.parse(readFileSync(COMMITTED_MANIFEST, "utf8"));

    const manifest = parseFleetManifest(committed);

    expect(manifest.robots).toHaveLength(50);
    // The shipped directory, in the simulator's emission order (ADR 14, ADR 34).
    expect(manifest.sites).toEqual([
      { siteId: "SITE-NORTH", label: "North site" },
      { siteId: "SITE-SOUTH", label: "South site" },
      { siteId: "SITE-EAST", label: "East site" },
    ]);
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
