/**
 * The determinism guarantee ADR 13 rests on.
 *
 * The CI re-record-and-diff step is only a drift guard if re-recording an
 * unchanged tree produces identical bytes. If it does not, unrelated pull
 * requests start failing on fixture noise and the guard gets deleted within a
 * week. This is the cheapest place to catch that, long before CI does.
 */
import { describe, expect, it } from "vitest";

import { RECORDING_INSTANT_MS, buildRecordedFixtures, serializeFixture } from "./fixtureSet.ts";

const fixtures = buildRecordedFixtures();

function forVendor(vendor: string) {
  const found = fixtures.find((fixture) => fixture.vendor === vendor);
  if (found === undefined) {
    throw new Error(`No fixture recorded for vendor ${vendor}.`);
  }
  return found;
}

describe("recorded fixture set", () => {
  it("produces byte-identical output on every build", () => {
    const first = buildRecordedFixtures().map(serializeFixture);
    const second = buildRecordedFixtures().map(serializeFixture);

    expect(second).toEqual(first);
  });

  it("records every vendor, so no dialect ships without evidence", () => {
    expect(fixtures.map((fixture) => fixture.vendor)).toEqual(["A", "B", "C"]);
  });

  it("pins the robot ids that `FIXTURE_RECORDING` names to consumers", () => {
    // packages/adapters/src/testing/fixtures.ts hard-codes these in its registry.
    // If the fleet's vendor allocation changes, this fails here rather than
    // leaving that package describing a robot the payload did not come from.
    expect(fixtures.map((fixture) => fixture.robotId)).toEqual(["R-001", "R-002", "R-003"]);
  });

  it("stamps every payload with the pinned instant, in each dialect's encoding", () => {
    const iso = new Date(RECORDING_INSTANT_MS).toISOString();

    expect(forVendor("A").payload).toMatchObject({ timestamp: iso });
    expect(forVendor("C").payload).toMatchObject({ timestamp: iso });
    // Vendor B carries epoch milliseconds instead — the disagreement the
    // adapters must reconcile into one `reportedAt` (ADR 1).
    expect(forVendor("B").payload).toMatchObject({ ts: RECORDING_INSTANT_MS });
  });

  it("records the initial fleet state, so the seed alone reproduces the set", () => {
    // No evolution ticks: every recorded sequence is the starting one. This is
    // what keeps the recording a function of RECORDING_SEED and nothing else.
    expect(forVendor("A").payload).toMatchObject({ seq: 0 });
    expect(forVendor("C").payload).toMatchObject({ seq: 0 });
  });

  it("carries vendor C's undocumented field", () => {
    // ADR 1 requires it counted rather than dropped; a fixture set that omitted
    // it would let an adapter pass without ever exercising the ledger.
    expect(forVendor("C").payload).toMatchObject({
      telemetry: { firmware_channel: expect.any(String) },
    });
  });

  it("records no lidar block for vendor C, whose absence is the declaration", () => {
    expect(forVendor("C").payload).not.toHaveProperty("telemetry.lidar");
  });

  it("records no sequence field for vendor B", () => {
    expect(forVendor("B").payload).not.toHaveProperty("seq");
  });

  it("serializes with a trailing newline so the committed files end cleanly", () => {
    for (const fixture of fixtures) {
      expect(serializeFixture(fixture).endsWith("}\n")).toBe(true);
    }
  });
});
