/*
 * The console's half of ADR 11: `@fleet/adapters/testing` resolves and loads
 * here, in a browser-targeted package under jsdom.
 *
 * This is a smoke test, not the joining test. The end-to-end path — recorded
 * vendor payload → adapter → canonical envelope → JSON → read model — still
 * waits on a vendor adapter and the dispatch registry
 * (archived adapters joining-plan A-6). What it proves is the property
 * that path depends on and that nothing else in this package checks: the exact
 * recorded bytes are reachable from the console's test run through one public
 * specifier, with no deep import and no second copy.
 *
 * If this file starts failing with a module-resolution error, the likely cause
 * is a Node-only API appearing in the adapters testing surface — the falsifier
 * ADR 11 names.
 */
import { describe, expect, it } from "vitest";

import { FIXTURE_RECORDING, listVendorFixtures, loadVendorFixture } from "@fleet/adapters/testing";

describe("@fleet/adapters/testing from the console package", () => {
  it("loads a recorded payload for every vendor", () => {
    expect([...new Set(listVendorFixtures().map((fixture) => fixture.vendor))]).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("reaches the boundary cases too, not only the representative one", () => {
    // The joining test needs the extremes: a fraction of 0 and of 1 both have to
    // arrive as a percentage, and only these payloads carry them (adapters C1).
    expect(loadVendorFixture("A", "boundary-empty").payload).toHaveProperty(
      "telemetry.battery.level",
      0,
    );
    expect(loadVendorFixture("B", "boundary-full").payload).toHaveProperty("batt_pct", 100);
  });

  it("carries the pinned recording instant, so a joining test needs no clock", () => {
    // A test asserting exact canonical output uses this as `receivedAt`.
    // Reading a real clock here would make the expected output unstateable.
    expect(loadVendorFixture("B").recordedAt).toBe(FIXTURE_RECORDING.instantMs);
  });

  it("hands over the vendor's own dialect, not a normalized shape", () => {
    // The console never sees these spellings in production — that is the point.
    // Their presence here is what will make the joining test evidence rather
    // than ceremony: the same bytes go in, and a canonical envelope comes out.
    expect(loadVendorFixture("B").payload).toHaveProperty("batt_pct", 75);
    expect(loadVendorFixture("C").payload).toHaveProperty("telemetry.firmware_channel", "stable");
  });
});
