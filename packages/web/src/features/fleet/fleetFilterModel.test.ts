import { describe, expect, it } from "vitest";

import type { Robot } from "@/types/robot";

import {
  ALL_FILTER_VALUE,
  EMPTY_FILTERS,
  matchesFilters,
  toFreshnessFilter,
  toIdFilter,
} from "./fleetFilterModel";

/**
 * Contract test for the filter predicate's sentinel-collision behavior.
 *
 * `identifierSchema` permits a site or vendor literally named `all`
 * (packages/contracts/src/shared/primitives.ts), so "no filter" must be a
 * value outside the identifier space — null in `Filters` — rather than a
 * string a real fleet could contain.
 */
function robot(overrides: Partial<Robot> & Pick<Robot, "id">): Robot {
  return {
    vendor: "A",
    siteId: "zone-a",
    observed: true,
    model: "Model A",
    connectivity: "online",
    position: null,
    capabilities: {},
    status: "idle",
    health: { severity: "nominal" },
    freshness: "live",
    batteryPercent: 90,
    lastSeenAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

describe("matchesFilters", () => {
  it("treats a site literally named 'all' as an ordinary filter value, not the sentinel", () => {
    const elsewhere = robot({ id: "R-118", siteId: "zone-a" });

    expect(matchesFilters(elsewhere, { ...EMPTY_FILTERS, site: "all" })).toBe(false);
  });

  it("matches robots at a site literally named 'all' when that site is selected", () => {
    const atAll = robot({ id: "R-204", siteId: "all" });

    expect(matchesFilters(atAll, { ...EMPTY_FILTERS, site: "all" })).toBe(true);
  });

  it("treats a vendor literally named 'all' as an ordinary filter value, not the sentinel", () => {
    const otherVendor = robot({ id: "R-118", vendor: "A" });

    expect(matchesFilters(otherVendor, { ...EMPTY_FILTERS, vendor: "all" })).toBe(false);
  });

  it("matches robots of a vendor literally named 'all' when that vendor is selected", () => {
    const vendorAll = robot({ id: "R-204", vendor: "all" });

    expect(matchesFilters(vendorAll, { ...EMPTY_FILTERS, vendor: "all" })).toBe(true);
  });

  it("passes every robot when no dimension is filtered", () => {
    expect(
      matchesFilters(robot({ id: "R-118", siteId: "all", vendor: "all" }), EMPTY_FILTERS),
    ).toBe(true);
  });
});

describe("toIdFilter", () => {
  it("maps the All choice to null", () => {
    expect(toIdFilter(ALL_FILTER_VALUE)).toBeNull();
  });

  it("passes a real identifier through unchanged, including one named 'all'", () => {
    expect(toIdFilter("all")).toBe("all");
  });
});

describe("toFreshnessFilter", () => {
  it("narrows a canonical freshness value without a cast", () => {
    expect(toFreshnessFilter("stale")).toBe("stale");
  });

  it("maps the All choice to null", () => {
    expect(toFreshnessFilter(ALL_FILTER_VALUE)).toBeNull();
  });
});

describe("ALL_FILTER_VALUE", () => {
  it("is not a legal canonical identifier, so no real site or vendor can collide with it", () => {
    // The contract's identifier pattern: alphanumeric first character.
    expect(ALL_FILTER_VALUE).not.toMatch(/^[A-Za-z0-9]/);
  });
});
