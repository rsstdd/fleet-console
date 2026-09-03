import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ADR3_BASELINE_FRESHNESS_POLICY } from "./freshnessPolicy.ts";
import { loadServerConfiguration } from "./serverConfiguration.ts";

const FRESHNESS_PATH = fileURLToPath(new URL("../../../../config/freshness.json", import.meta.url));
const MANIFEST_PATH = fileURLToPath(
  new URL("../../../../config/fleet-manifest.json", import.meta.url),
);

/**
 * The three ids the root README and this repo's simulator README use in the
 * documented `--drop` example. The simulator validates drop targets against the
 * fleet it built and rejects unknown ids, so a manifest that does not contain
 * these makes the published demo command fail at startup.
 */
const DOCUMENTED_DROP_IDS = ["R-007", "R-023", "R-041"];

describe("loadServerConfiguration", () => {
  it("strictly validates the shipped shared configuration", async () => {
    const config = await loadServerConfiguration(FRESHNESS_PATH, MANIFEST_PATH);

    expect(config.freshness).toEqual(ADR3_BASELINE_FRESHNESS_POLICY);
    expect(config.manifest.robots.length).toBeGreaterThan(0);
  });

  it("rosters the 50-robot fleet the documented demo runs", async () => {
    // Asserted as properties rather than a literal count, so regenerating the
    // manifest at a different size does not fail the suite for no reason —
    // but shipping a roster that cannot back the demo still does.
    const { manifest } = await loadServerConfiguration(FRESHNESS_PATH, MANIFEST_PATH);
    const ids = manifest.robots.map((robot) => robot.robotId);

    expect(ids).toHaveLength(50);
    expect(ids).toContain("R-001");
    expect(ids).toContain("R-050");
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("contains every id the documented --drop example names", async () => {
    const { manifest } = await loadServerConfiguration(FRESHNESS_PATH, MANIFEST_PATH);
    const ids = new Set(manifest.robots.map((robot) => robot.robotId));

    for (const id of DOCUMENTED_DROP_IDS) {
      expect(ids.has(id), `${id} is named in the demo script but absent from the manifest`).toBe(
        true,
      );
    }
  });

  it("covers all three vendors and more than one site", async () => {
    // The console's two headline arguments need both: capability panels differ
    // by vendor, and the fleet table groups by site. A single-vendor or
    // single-site roster demonstrates neither.
    const { manifest } = await loadServerConfiguration(FRESHNESS_PATH, MANIFEST_PATH);

    expect(new Set(manifest.robots.map((robot) => robot.vendorId))).toEqual(
      new Set(["A", "B", "C"]),
    );
    expect(new Set(manifest.robots.map((robot) => robot.siteId)).size).toBeGreaterThan(1);
  });
});
