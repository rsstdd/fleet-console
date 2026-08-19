import { describe, expect, it } from "vitest";

import {
  createFleet,
  FleetConfigurationError,
  MAX_ROBOTS,
  robotIdFor,
  SITE_IDS,
  toFleetManifest,
} from "./createFleet.ts";
import { VENDOR_IDS } from "./simulatedRobot.ts";

describe("createFleet", () => {
  it("creates exactly the requested number of robots", () => {
    for (const count of [1, 2, 3, 50, 500]) {
      expect(createFleet(count, 1)).toHaveLength(count);
    }
  });

  it("assigns unique robot ids in the documented R-### form", () => {
    const fleet = createFleet(500, 1);
    const ids = fleet.map((robot) => robot.identity.robotId);

    expect(new Set(ids).size).toBe(500);
    expect(ids[0]).toBe("R-001");
    expect(ids[6]).toBe("R-007"); // a documented --drop example id
    expect(ids[203]).toBe("R-204"); // padding holds past 99
    expect(ids.at(-1)).toBe("R-500");
  });

  it("puts all three vendors in the fleet as soon as the count allows", () => {
    expect(createFleet(3, 1).map((r) => r.identity.vendor)).toEqual(["A", "B", "C"]);
  });

  it("keeps the vendor mix even to within one robot for uneven counts", () => {
    for (const count of [1, 2, 4, 5, 7, 50, 500]) {
      const counts = new Map<string, number>();
      for (const robot of createFleet(count, 1)) {
        counts.set(robot.identity.vendor, (counts.get(robot.identity.vendor) ?? 0) + 1);
      }
      const values = [...counts.values()];
      expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
      expect(values.reduce((sum, n) => sum + n, 0)).toBe(count);
    }
  });

  it("allocates sites without correlating them to vendors", () => {
    const fleet = createFleet(90, 1);
    const pairs = new Set(fleet.map((r) => `${r.identity.siteId}/${r.identity.vendor}`));

    // Every site/vendor combination appears; a correlated allocation would
    // produce only three of the nine.
    expect(pairs.size).toBe(SITE_IDS.length * VENDOR_IDS.length);
  });

  it("produces an identical fleet for the same seed", () => {
    expect(createFleet(50, 7)).toEqual(createFleet(50, 7));
  });

  it("varies state but not structure across seeds", () => {
    const a = createFleet(50, 1);
    const b = createFleet(50, 2);

    expect(a).not.toEqual(b);
    expect(a.map((r) => r.identity.robotId)).toEqual(b.map((r) => r.identity.robotId));
    expect(a.map((r) => r.identity.vendor)).toEqual(b.map((r) => r.identity.vendor));
    expect(a.map((r) => r.identity.siteId)).toEqual(b.map((r) => r.identity.siteId));
  });

  it("keeps a robot's initial state independent of how many robots follow it", () => {
    // If robots shared one generator, growing the fleet would rewrite the
    // history of every robot already in it.
    const small = createFleet(3, 1);
    const large = createFleet(500, 1);

    expect(large.slice(0, 3)).toEqual(small);
  });

  it("starts every robot inside its valid ranges", () => {
    for (const { state } of createFleet(500, 3)) {
      expect(state.battery).toBeGreaterThanOrEqual(0);
      expect(state.battery).toBeLessThanOrEqual(1);
      expect(state.waterLevel).toBeGreaterThanOrEqual(0);
      expect(state.waterLevel).toBeLessThanOrEqual(1);
      expect(state.heading).toBeGreaterThanOrEqual(0);
      expect(state.heading).toBeLessThan(360);
      expect(Number.isFinite(state.x)).toBe(true);
      expect(Number.isFinite(state.y)).toBe(true);
      expect(state.sequence).toBe(0);
    }
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_ROBOTS + 1])(
    "rejects an impossible robot count (%s) at startup",
    (count) => {
      expect(() => createFleet(count, 1)).toThrow(FleetConfigurationError);
    },
  );

  it("names the accepted range in the rejection message", () => {
    expect(() => createFleet(0, 1)).toThrow(/between 1 and 5000/);
  });
});

describe("robotIdFor", () => {
  it("zero-pads to three digits and stays sortable past 99", () => {
    expect(robotIdFor(0)).toBe("R-001");
    expect(robotIdFor(99)).toBe("R-100");
    expect(robotIdFor(499)).toBe("R-500");
  });
});

describe("toFleetManifest", () => {
  it("carries identity only, so no evolving state leaks into the roster", () => {
    const manifest = toFleetManifest(createFleet(2, 1));

    // `vendorId` is the server's spelling and therefore the canonical one
    // (ADR 14); a `vendor` key here is rejected by its strict schema.
    expect(manifest).toEqual([
      { robotId: "R-001", siteId: "SITE-NORTH", vendorId: "A", model: expect.any(String) },
      { robotId: "R-002", siteId: "SITE-NORTH", vendorId: "B", model: expect.any(String) },
    ]);
    for (const entry of manifest) {
      expect(entry).not.toHaveProperty("battery");
      expect(entry).not.toHaveProperty("sequence");
    }
  });
});
