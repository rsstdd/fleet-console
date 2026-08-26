import { identifierSchema } from "@fleet/contracts";

import type { Freshness, Robot } from "@/types/robot";

/**
 * The fleet filter model: state shape, defaults, the Select-boundary
 * conversions, and the predicate. Pure data and functions only — the
 * `FleetFilters` control lives in `fleetFilters.tsx`, so editing the model
 * cannot invalidate Fast Refresh for the component tree.
 */

/** The Reporting-status choices in display order; the values are the ADR 3 freshness vocabulary. */
export const FRESHNESS_FILTER_OPTIONS: ReadonlyArray<{
  readonly value: Freshness;
  readonly label: string;
}> = [
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
  const search = filters.search.trim().toLowerCase();

  const siteMatches = filters.site === null || robot.siteId === filters.site;

  const vendorMatches = filters.vendor === null || robot.vendor === filters.vendor;

  const freshnessMatches = filters.freshness === null || robot.freshness === filters.freshness;

  const searchMatches = robot.id.toLowerCase().includes(search);

  return siteMatches && vendorMatches && freshnessMatches && searchMatches;
}

/**
 * The query-parameter names a shared fleet URL uses.
 *
 * `status` rather than `freshness`: the operator copy on the control and the column both
 * read "Reporting status", and a URL an operator pastes to a colleague should say what the
 * screen says (fleet spec § 2).
 */
const FILTER_PARAM = {
  site: "site",
  vendor: "vendor",
  freshness: "status",
  search: "q",
} as const;

/**
 * Bounds the id substring a URL may carry. Matching is a substring test over robot ids, so
 * nothing longer than one identifier can match anything.
 */
const SEARCH_MAX_LENGTH = 64;

/** Decodes one open identifier, or null where the URL offered nothing the contract accepts. */
function readIdentifier(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key);
  if (raw === null) return null;
  const parsed = identifierSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Decodes filter state from the address bar.
 *
 * A URL is untrusted input and is decoded here like any other boundary payload
 * (Principle 2): site and vendor go through the contract's own `identifierSchema`, and a
 * reporting status outside the ADR 3 vocabulary is dropped. Every dimension degrades to
 * "filters nothing" on its own, so one unreadable parameter never costs the others.
 */
export function filtersFromSearchParams(params: URLSearchParams): Filters {
  return {
    site: readIdentifier(params, FILTER_PARAM.site),
    vendor: readIdentifier(params, FILTER_PARAM.vendor),
    freshness: toFreshnessFilter(params.get(FILTER_PARAM.freshness) ?? ""),
    search: (params.get(FILTER_PARAM.search) ?? "").slice(0, SEARCH_MAX_LENGTH),
  };
}

/**
 * @returns Only the dimensions that filter something, so an operator who clears the
 *   filters is left with a clean address rather than a row of empty parameters.
 */
export function searchParamsFromFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.site !== null) params.set(FILTER_PARAM.site, filters.site);
  if (filters.vendor !== null) params.set(FILTER_PARAM.vendor, filters.vendor);
  if (filters.freshness !== null) params.set(FILTER_PARAM.freshness, filters.freshness);
  if (filters.search !== "") params.set(FILTER_PARAM.search, filters.search);
  return params;
}

/**
 * Narrows requested filters to the ones this fleet can currently honour.
 *
 * A shared URL can name a site or vendor the fleet does not have — decommissioned, not yet
 * in the snapshot, or simply another deployment's. Filtering on it would show an empty
 * table under a control with no matching option; dropping it shows the fleet. The address
 * is left untouched, so a site that arrives in a later snapshot re-engages its filter.
 *
 * Reporting status needs no narrowing: its vocabulary is closed and every state is always
 * offered, including ones no robot is currently in.
 */
export function selectApplicableFilters(
  filters: Filters,
  siteIds: readonly string[],
  vendorIds: readonly string[],
): Filters {
  return {
    ...filters,
    site: filters.site !== null && siteIds.includes(filters.site) ? filters.site : null,
    vendor: filters.vendor !== null && vendorIds.includes(filters.vendor) ? filters.vendor : null,
  };
}
