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

import type { Site } from "@/types/site";

import { ALL_FILTER_VALUE, FRESHNESS_FILTER_OPTIONS, type Filters } from "./fleetFilterModel";

/**
 * The filter bar. Filter state is local view state owned by the page
 * (Principle 11); this component only renders the controls and reports
 * changes upward through the handlers it is given. The state shape, the
 * sentinel, and the predicate live in `fleetFilterModel.ts`.
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
