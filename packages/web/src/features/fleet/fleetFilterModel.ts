import type { Freshness, Robot } from "@/types/robot";

/**
 * The fleet filter model: state shape, defaults, the Select-boundary
 * conversions, and the predicate. Pure data and functions only — the
 * `FleetFilters` control lives in `fleetFilters.tsx`, so editing the model
 * cannot invalidate Fast Refresh for the component tree.
 */

/** The Reporting-status choices in display order; the values are the ADR 3 freshness vocabulary. */
export const FRESHNESS_FILTER_OPTIONS: ReadonlyArray<{ value: Freshness; label: string }> = [
  { value: "live", label: "Live" },
  { value: "stale", label: "Stale" },
  { value: "unreachable", label: "Unreachable" },
  { value: "unknown", label: "Unknown" },
];

/**
 * The Select value for the "All …" choice on every dimension. A MUI Select
 * speaks strings, so "no filter" needs one at that boundary — but site and
 * vendor ids are open identifiers, and `identifierSchema` permits a site or
 * vendor literally named `all`. This value starts with an underscore, which
 * the identifier pattern forbids (alphanumeric first character), so no real
 * id can ever collide with it. `Filters` itself carries null: the sentinel
 * exists only where the widget demands a string.
 */
export const ALL_FILTER_VALUE = "__all__";

/** The complete filter state the fleet page owns; null on a dimension means it filters nothing. */
export interface Filters {
  readonly site: string | null;
  readonly vendor: string | null;
  readonly freshness: Freshness | null;
  readonly search: string;
}

/** The unfiltered state, shared by first render and the "Clear filters" action. */
export const EMPTY_FILTERS: Filters = { site: null, vendor: null, freshness: null, search: "" };

/** Maps a site or vendor Select value back to filter state: the All choice becomes null, any real id passes through. */
export function toIdFilter(value: string): string | null {
  return value === ALL_FILTER_VALUE ? null : value;
}

/** Narrows a Reporting-status Select value to a canonical freshness state without a cast; the All choice becomes null. */
export function toFreshnessFilter(value: string): Freshness | null {
  const option = FRESHNESS_FILTER_OPTIONS.find((candidate) => candidate.value === value);
  return option?.value ?? null;
}

/**
 * Whether one robot survives every active filter dimension; a null dimension passes everything.
 *
 * @param robot - One fleet row, unfiltered.
 * @param filters - The page's filter state. Site, vendor and freshness are exact
 *   equality against open identifiers — no prefix or fuzzy matching, so a filter set
 *   from the observed options can never exclude the robot it was derived from.
 *   `search` is trimmed and lower-cased and matched as a substring of the robot id
 *   alone, so a whitespace-only query filters nothing rather than everything.
 * @returns True when the robot belongs in the table under these filters.
 */
export function matchesFilters(robot: Robot, filters: Filters): boolean {
  if (filters.site !== null && robot.siteId !== filters.site) {
    return false;
  }
  if (filters.vendor !== null && robot.vendor !== filters.vendor) {
    return false;
  }
  if (filters.freshness !== null && robot.freshness !== filters.freshness) {
    return false;
  }
  if (filters.search.trim() !== "") {
    const needle = filters.search.trim().toLowerCase();
    if (!robot.id.toLowerCase().includes(needle)) {
      return false;
    }
  }
  return true;
}
