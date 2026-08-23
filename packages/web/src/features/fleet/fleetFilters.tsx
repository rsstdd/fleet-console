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

const ALL = "all" as const;
// Site and vendor ids are open identifiers from the wire, so neither filter can
// be narrowed to a union with ALL without inventing a nominal type. ALL is the
// sentinel; the name carries the meaning the type system cannot.
type SiteFilter = string;
type VendorFilter = string;
/** A freshness selection, or the ALL sentinel that passes every state — the one filter dimension the wire's closed enum lets us narrow. */
export type FreshnessFilter = typeof ALL | Freshness;

/** The complete filter state the fleet page owns; every dimension defaults to ALL. */
export interface Filters {
  readonly site: SiteFilter;
  readonly vendor: VendorFilter;
  readonly freshness: FreshnessFilter;
  readonly search: string;
}

/** The unfiltered state, shared by first render and the "Clear filters" action. */
export const EMPTY_FILTERS: Filters = { site: ALL, vendor: ALL, freshness: ALL, search: "" };

/** Whether one robot survives every active filter dimension; ALL dimensions pass everything. */
export function matchesFilters(robot: Robot, filters: Filters): boolean {
  if (filters.site !== ALL && robot.siteId !== filters.site) {
    return false;
  }
  if (filters.vendor !== ALL && robot.vendor !== filters.vendor) {
    return false;
  }
  if (filters.freshness !== ALL && robot.freshness !== filters.freshness) {
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
          value={filters.site}
          onChange={onSiteChange}
        >
          <MenuItem value={ALL}>All sites</MenuItem>
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
          value={filters.vendor}
          onChange={onVendorChange}
        >
          <MenuItem value={ALL}>All vendors</MenuItem>
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
          value={filters.freshness}
          onChange={onFreshnessChange}
        >
          <MenuItem value={ALL}>All</MenuItem>
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
