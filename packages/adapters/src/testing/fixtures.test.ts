import { describe, expect, it } from "vitest";

import { SUPPORTED_VENDORS } from "../core/vendor.ts";
import * as testingSurface from "./index.ts";
import {
  FIXTURE_RECORDING,
  listMalformedPayloads,
  listVendorFixtures,
  loadMalformedPayload,
  loadVendorFixture,
  type MalformedPayload,
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
  // The same rule for a malformed payload, and it matters more here: a typed
  // malformed fixture would not compile at all, and the temptation would be to
  // "fix" it into something the schema accepts.
  Assert<Equals<MalformedPayload["payload"], unknown>>,
];

/**
 * The public surface of `@fleet/adapters/testing`, pinned by name.
 *
 * The same idiom `@fleet/contracts` uses for `.`: growing a public subpath
 * should be a deliberate edit to a test, not a side effect of adding an export
 * (ADR 11).
 */
const PUBLIC_SURFACE = [
  "FIXTURE_RECORDING",
  "listMalformedPayloads",
  "listVendorFixtures",
  "loadMalformedPayload",
  "loadVendorFixture",
] as const;

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
    expect(() => loadVendorFixture("A", "nonexistent")).toThrow(/No recorded nonexistent fixture/);
  });

  it("loads both boundary cases for every vendor", () => {
    for (const vendor of SUPPORTED_VENDORS) {
      for (const name of ["boundary-empty", "boundary-full"] as const) {
        expect(loadVendorFixture(vendor, name).name).toBe(name);
      }
    }
  });

  it("puts battery at both ends of each dialect's own scale", () => {
    // The representative set cannot show this: `initialState` in the simulator
    // draws battery from [0.35, 1), so no seed reaches either end.
    expect(loadVendorFixture("A", "boundary-empty").payload).toHaveProperty(
      "telemetry.battery.level",
      0,
    );
    expect(loadVendorFixture("A", "boundary-full").payload).toHaveProperty(
      "telemetry.battery.level",
      1,
    );
    expect(loadVendorFixture("B", "boundary-empty").payload).toHaveProperty("batt_pct", 0);
    expect(loadVendorFixture("B", "boundary-full").payload).toHaveProperty("batt_pct", 100);
  });

  it("carries a docked robot, so `dock_id` is not null everywhere", () => {
    // A schema typing dock_id as `null` would accept every representative payload.
    expect(loadVendorFixture("C", "boundary-empty").payload).toHaveProperty(
      "telemetry.dock.dock_id",
      "SITE-NORTH-DOCK-03",
    );
    expect(loadVendorFixture("C", "boundary-full").payload).toHaveProperty(
      "telemetry.dock.dock_id",
      null,
    );
  });

  it("keeps vendor C's undocumented field in every recorded case", () => {
    for (const name of ["representative", "boundary-empty", "boundary-full"] as const) {
      expect(loadVendorFixture("C", name).payload).toHaveProperty(
        "telemetry.firmware_channel",
        "stable",
      );
    }
  });

  it("keeps vendor C's unsupported lidar block absent in every recorded case", () => {
    // The dialect has no optional lidar block to toggle: key absence is the
    // source fact from which the adapter must omit the `lidarHealth` capability.
    for (const name of ["representative", "boundary-empty", "boundary-full"] as const) {
      expect(loadVendorFixture("C", name).payload).not.toHaveProperty("telemetry.lidar");
    }
  });
});

describe("loadMalformedPayload", () => {
  it("gives every vendor a payload its schema must reject", () => {
    // One per vendor, each broken differently, so the D4 rejection tests are not
    // three assertions about one defect.
    expect(listMalformedPayloads().map((payload) => `${payload.vendor}/${payload.name}`)).toEqual([
      "A/wrong-type",
      "B/multiple-defects",
      "C/unparsable-timestamp",
    ]);
  });

  it("states why each payload is malformed", () => {
    for (const payload of listMalformedPayloads()) {
      expect(payload.reason.length).toBeGreaterThan(0);
    }
  });

  it("breaks a nested field, so the issue path cannot be a top-level key", () => {
    expect(loadMalformedPayload("A", "wrong-type").payload).toHaveProperty(
      "telemetry.battery.level",
      "0.9661",
    );
  });

  it("carries two independent defects in one vendor B payload", () => {
    // ADR 20: a payload wrong in two fields must still be wrong in two fields by
    // the time a technician reads the error.
    const payload = loadMalformedPayload("B", "multiple-defects").payload;

    expect(payload).not.toHaveProperty("ts");
    expect(payload).toHaveProperty("batt_pct", 150);
  });

  it("throws for a defect that vendor does not have", () => {
    expect(() => loadMalformedPayload("A", "multiple-defects")).toThrow(
      /No malformed multiple-defects payload for vendor A/,
    );
  });
});

describe("listVendorFixtures", () => {
  it("returns every recorded case, grouped by vendor in vendor order", () => {
    expect(listVendorFixtures().map((fixture) => `${fixture.vendor}/${fixture.name}`)).toEqual(
      SUPPORTED_VENDORS.flatMap((vendor) =>
        ["representative", "boundary-empty", "boundary-full"].map((name) => `${vendor}/${name}`),
      ),
    );
  });

  it("returns the same objects loadVendorFixture returns", () => {
    // One registry, not two. A separate list would be a second place to forget
    // a vendor when a fourth is added.
    for (const fixture of listVendorFixtures()) {
      expect(loadVendorFixture(fixture.vendor, fixture.name)).toBe(fixture);
    }
  });
});
