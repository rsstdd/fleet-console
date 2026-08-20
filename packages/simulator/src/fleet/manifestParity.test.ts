import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { renderFleetManifest } from "../app.ts";
import { createFleet, toFleetManifest } from "./createFleet.ts";
import { DEFAULTS } from "../config/simulatorConfig.ts";
import type { SimulatorConfig } from "../config/simulatorConfig.ts";

/**
 * The equality half of ADR 14: the roster this simulator prints must be exactly
 * the roster the repository ships, byte for byte, so the documented handoff
 * (`--print-manifest > config/fleet-manifest.json`) is a step someone can
 * actually follow rather than a promise.
 *
 * Reading the committed file here is a test-time read of deployment
 * configuration, not a runtime dependency: the simulator still generates its
 * fleet from CLI inputs and never consumes this file when it runs (ADR 14
 * § Decision).
 *
 * The other half lives in `packages/server/src/config/fleetManifest.test.ts`,
 * which parses the same committed file with `fleetManifestSchema`. Together
 * they prove the printed roster is valid server input without either package
 * importing the other.
 */
const MANIFEST_PATH = fileURLToPath(
  new URL("../../../../config/fleet-manifest.json", import.meta.url),
);

/**
 * The documented inputs that produced the committed roster. `--robots 50
 * --seed 1` are the defaults, so a bare `--print-manifest` reproduces the file;
 * naming them here means a default change fails this test rather than silently
 * re-defining what the shipped roster is.
 */
const RECORDED_INPUTS = { robots: 50, seed: 1 } as const;

function configFor(inputs: { robots: number; seed: number }): SimulatorConfig {
  const config: SimulatorConfig = {
    ...DEFAULTS,
    ...inputs,
    droppedRobotIds: [],
    printManifest: true,
  };
  return config;
}

describe("fleet manifest parity", () => {
  it("prints exactly the committed roster under the recorded inputs", () => {
    const printed = renderFleetManifest(configFor(RECORDED_INPUTS));
    const committed = readFileSync(MANIFEST_PATH, "utf8");

    // Byte comparison, trailing newline aside: the handoff is a redirect into a
    // file, so formatting differences are differences.
    expect(printed.trim()).toBe(committed.trim());
  });

  it("uses the recorded inputs as its defaults, so a bare run reproduces the file", () => {
    expect(DEFAULTS.robots).toBe(RECORDED_INPUTS.robots);
    expect(DEFAULTS.seed).toBe(RECORDED_INPUTS.seed);
  });

  it("emits the server's spelling, with no wrapper key and no `vendor`", () => {
    const printed = renderFleetManifest(configFor(RECORDED_INPUTS));

    // The two deviations the server's strict schema rejected, asserted on the
    // document itself rather than on a parsed object: a `seed` wrapper key, and
    // `vendor` where the canonical spelling is `vendorId` (ADR 14). Text is the
    // right level here — this file is consumed as bytes by a redirect, and the
    // simulator carries no schema library to re-validate it with.
    expect(printed.startsWith('{\n  "sites": [')).toBe(true);
    expect(printed).not.toContain('"seed"');
    expect(printed).not.toMatch(/"vendor":/);
    expect(printed).toContain('"vendorId": "A"');
  });

  it("projects exactly the four roster fields, in the server's order", () => {
    // Read off the typed projection rather than the JSON, so a field added to
    // `FleetManifestEntry` fails here even if the recorded file is re-recorded
    // in the same commit.
    const [entry] = toFleetManifest(createFleet(1, 1));

    expect(Object.keys(entry ?? {})).toEqual(["robotId", "siteId", "vendorId", "model"]);
  });
});
