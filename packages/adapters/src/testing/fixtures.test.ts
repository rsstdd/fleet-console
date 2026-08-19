import { describe, expect, it } from "vitest";

import { SUPPORTED_VENDORS } from "../core/vendor.ts";
import * as testingSurface from "./index.ts";
import {
  FIXTURE_RECORDING,
  listVendorFixtures,
  loadVendorFixture,
  type VendorFixture,
} from "./fixtures.ts";

type Assert<T extends true> = T;
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- conditional-type identity trick */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

export type FixtureTypeAssertions = [
  // A fixture payload stays `unknown`, so a contract test enters the adapter
  // through the same untrusted door production does. A typed fixture would let
  // a test pass while the schema it exercises is wrong (adapters TODO D1).
  Assert<Equals<VendorFixture["payload"], unknown>>,
];

/**
 * The public surface of `@fleet/adapters/testing`, pinned by name.
 *
 * The same idiom `@fleet/contracts` uses for `.`: growing a public subpath
 * should be a deliberate edit to a test, not a side effect of adding an export
 * (ADR 11).
 */
const PUBLIC_SURFACE = ["FIXTURE_RECORDING", "listVendorFixtures", "loadVendorFixture"] as const;

describe("@fleet/adapters/testing public surface", () => {
  it("exports exactly the documented runtime surface", () => {
    expect(Object.keys(testingSurface).sort()).toEqual([...PUBLIC_SURFACE].sort());
  });

  it("carries no adapter or schema behaviour", () => {
    // The subpath is banned in production code precisely because it is
    // test-only. If a decoder ever appears here, that ban starts costing
    // something real and the boundary needs rethinking rather than widening.
    for (const value of Object.values(testingSurface)) {
      expect(typeof value === "function" || typeof value === "object").toBe(true);
    }
  });
});

describe("loadVendorFixture", () => {
  it("returns a recorded payload for every supported vendor", () => {
    for (const vendor of SUPPORTED_VENDORS) {
      const fixture = loadVendorFixture(vendor);

      expect(fixture.vendor).toBe(vendor);
      expect(fixture.name).toBe("representative");
      expect(fixture.recordedAt).toBe(FIXTURE_RECORDING.instantMs);
      expect(fixture.payload).toBeTypeOf("object");
    }
  });

  it("preserves each dialect's own spelling rather than a normalized one", () => {
    // These differences are the reason the fixtures exist. If a future
    // re-recording flattens them, the adapter contract tests stop proving that
    // normalization happens at all (ADR 1).
    // Asserted through matchers rather than a cast: this package bans type
    // assertions at a boundary, and a fixture is exactly that boundary.
    const a = loadVendorFixture("A").payload;
    const b = loadVendorFixture("B").payload;
    const c = loadVendorFixture("C").payload;

    // Vendor A: nested payload, fractional battery, ISO instant, sequence.
    expect(a).toHaveProperty("telemetry.battery.level", 0.9661);
    expect(a).toHaveProperty("timestamp", "2025-08-19T10:40:00.000Z");
    expect(a).toHaveProperty("seq");

    // Vendor B: flat payload, integer percent, centimetres, epoch ms, numeric
    // codes — and no sequence field at all, which is what makes "not evaluated"
    // different from "no gaps".
    expect(b).toHaveProperty("batt_pct", 75);
    expect(b).toHaveProperty("x_cm", -2077);
    expect(b).toHaveProperty("ts", FIXTURE_RECORDING.instantMs);
    expect(b).toHaveProperty("status_code", 0);
    expect(b).not.toHaveProperty("seq");

    // Vendor C: A-shaped, water level instead of lidar, and one undocumented
    // field the adapter must count rather than drop.
    expect(c).toHaveProperty("telemetry.water.level_pct", 60);
    expect(c).not.toHaveProperty("telemetry.lidar");
    expect(c).toHaveProperty("telemetry.firmware_channel", "stable");
  });

  it("throws for a fixture that was never recorded", () => {
    // @ts-expect-error deliberately outside VendorFixtureName
    expect(() => loadVendorFixture("A", "malformed")).toThrow(/No recorded malformed fixture/);
  });
});

describe("listVendorFixtures", () => {
  it("returns one fixture per supported vendor, in vendor order", () => {
    expect(listVendorFixtures().map((fixture) => fixture.vendor)).toEqual([...SUPPORTED_VENDORS]);
  });

  it("returns the same objects loadVendorFixture returns", () => {
    // One registry, not two. A separate list would be a second place to forget
    // a vendor when a fourth is added.
    for (const fixture of listVendorFixtures()) {
      expect(loadVendorFixture(fixture.vendor, fixture.name)).toBe(fixture);
    }
  });
});
