import type { ChangeEvent, ReactNode } from "react";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  type SelectChangeEvent,
} from "@mui/material";

import type { Freshness, Robot } from "@/types/robot";
import type { Site } from "@/types/site";

const FRESHNESS_FILTER_OPTIONS: ReadonlyArray<{ value: Freshness; label: string }> = [
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

/** Whether one robot survives every active filter dimension; a null dimension passes everything. */
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

/**
 * The filter bar. Filter state is local view state owned by the page
 * (Principle 11); this component only renders the controls and reports
 * changes upward through the handlers it is given.
 */
export function FleetFilters({
  filters,
  sites,
  vendorOptions,
  onSiteChange,
  onVendorChange,
  onFreshnessChange,
  onSearchChange,
}: {
  readonly filters: Filters;
  readonly sites: readonly Site[];
  readonly vendorOptions: readonly string[];
  readonly onSiteChange: (event: SelectChangeEvent) => void;
  readonly onVendorChange: (event: SelectChangeEvent) => void;
  readonly onFreshnessChange: (event: SelectChangeEvent) => void;
  readonly onSearchChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}): ReactNode {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={2}
      sx={{ mb: 2 }}
      role="group"
      aria-label="Fleet filters"
    >
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="site-filter-label">Site</InputLabel>
        <Select
          labelId="site-filter-label"
          label="Site"
          value={filters.site ?? ALL_FILTER_VALUE}
          onChange={onSiteChange}
        >
          <MenuItem value={ALL_FILTER_VALUE}>All sites</MenuItem>
          {sites.map((site) => (
            <MenuItem key={site.siteId} value={site.siteId}>
              {site.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="vendor-filter-label">Vendor</InputLabel>
        <Select
          labelId="vendor-filter-label"
          label="Vendor"
          value={filters.vendor ?? ALL_FILTER_VALUE}
          onChange={onVendorChange}
        >
          <MenuItem value={ALL_FILTER_VALUE}>All vendors</MenuItem>
          {vendorOptions.map((vendor) => (
            <MenuItem key={vendor} value={vendor}>
              Vendor {vendor}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="freshness-filter-label">Reporting status</InputLabel>
        <Select
          labelId="freshness-filter-label"
          label="Reporting status"
          value={filters.freshness ?? ALL_FILTER_VALUE}
          onChange={onFreshnessChange}
        >
          <MenuItem value={ALL_FILTER_VALUE}>All</MenuItem>
          {FRESHNESS_FILTER_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <TextField
        size="small"
        label="Search"
        placeholder="Robot id"
        value={filters.search}
        onChange={onSearchChange}
        sx={{ minWidth: 160 }}
      />
    </Stack>
  );
}
