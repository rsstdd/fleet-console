import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";

import { DataPlate } from "@/shared/ui/dataPlate";
import { EmptyState } from "@/shared/ui/emptyState";
import { isStreamConnected, useConnectionState } from "@/shared/lib/connectionContext";
import { FreshnessLabel } from "@/shared/ui/freshnessLabel";
import { Stat } from "@/shared/ui/stat";
import { StatusChip } from "@/shared/ui/statusChip";

import {
  selectBatteryDisplay,
  selectFreshnessSummary,
  selectStatusPresentation,
} from "@/entities/robot/selectors";
import { useFleetRobots } from "@/entities/robot/useFleetRobots";
import { VENDORS, type Freshness, type Robot, type Vendor } from "@/entities/robot/model";
import { SITES, selectSiteLabel } from "@/entities/site/model";

import { formatTimeUtc } from "@/shared/lib/time";

const FRESHNESS_FILTER_OPTIONS: ReadonlyArray<{ value: Freshness; label: string }> = [
  { value: "live", label: "Live" },
  { value: "stale", label: "Stale" },
  { value: "unreachable", label: "Unreachable" },
  { value: "unknown", label: "Unknown" },
];

const ALL = "all" as const;
// Site ids are plain strings, so this cannot be narrowed to a union with
// ALL without inventing a nominal type. ALL is the sentinel; the name carries
// the meaning the type system cannot.
type SiteFilter = string;
type VendorFilter = typeof ALL | Vendor;
type FreshnessFilter = typeof ALL | Freshness;

interface Filters {
  readonly site: SiteFilter;
  readonly vendor: VendorFilter;
  readonly freshness: FreshnessFilter;
  readonly search: string;
}

const EMPTY_FILTERS: Filters = { site: ALL, vendor: ALL, freshness: ALL, search: "" };

function matchesFilters(robot: Robot, filters: Filters): boolean {
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
 * Fleet overview — the operator's primary surface. See page spec 02.
 *
 * Summary counts reflect the whole fleet, not the filtered set: a reader
 * adjusting filters to find one robot should not watch the fleet-wide
 * freshness counts change underneath them. Filtering and summarising are
 * two different questions, and the wireframe treats the strip as constant
 * while the table below it narrows.
 *
 * Activation is the robot id link and nothing else — the row carries no click
 * handler and is not focusable (page spec §2, Principle 6). Filter state is
 * local view state owned by this feature; it is never written back to the store
 * and never merged with observed telemetry (Principle 11). Nothing here derives
 * freshness: `robot.freshness` arrives on the envelope from the server sweep,
 * and this feature holds no timer (ADR 3).
 */
export function FleetPage(): ReactNode {
  const robots = useFleetRobots();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  /*
   * Whether per-robot freshness may be shown at all. Read once here rather than per row:
   * it is one fact about the console's own socket, not a property of any robot, and
   * Principle 11 keeps the two apart. The rule itself lives in `shared/lib` so this page
   * and robot detail cannot drift into suppressing on different conditions (ADR 3, ADR 23).
   */
  const streamConnected = isStreamConnected(useConnectionState());

  const summary = useMemo(() => selectFreshnessSummary(robots), [robots]);

  /**
   * Provenance for the DataPlate, taken from the data rather than from the
   * client clock. Reading `new Date()` here would stamp the plate with render
   * time, which moves on every filter keystroke while the underlying data has
   * not changed — a fabricated provenance claim (Principle 4). Comparing ISO-8601
   * UTC strings lexicographically is sound because they are fixed-width and all
   * end in `Z`. Coupling: once `packages/server` exists it sends its own snapshot
   * instant on the envelope, and this derivation is replaced by that field.
   */
  const latestReadingAt = useMemo(() => {
    let latest: string | null = null;
    for (const robot of robots) {
      if (robot.lastSeenAt === null) continue;
      if (latest === null || robot.lastSeenAt > latest) latest = robot.lastSeenAt;
    }
    return latest;
  }, [robots]);
  const filteredRobots = useMemo(
    () => robots.filter((robot) => matchesFilters(robot, filters)),
    [robots, filters],
  );

  const handleSiteChange = (event: SelectChangeEvent): void => {
    setFilters((prev) => ({ ...prev, site: event.target.value }));
  };

  const handleVendorChange = (event: SelectChangeEvent): void => {
    setFilters((prev) => ({ ...prev, vendor: event.target.value as VendorFilter }));
  };

  const handleFreshnessChange = (event: SelectChangeEvent): void => {
    setFilters((prev) => ({ ...prev, freshness: event.target.value as FreshnessFilter }));
  };

  const clearFilters = (): void => {
    setFilters(EMPTY_FILTERS);
  };

  return (
    <Box component="section" aria-labelledby="fleet-heading">
      <Typography id="fleet-heading" variant="h1" component="h1" sx={{ mb: 3 }}>
        Fleet overview
      </Typography>

      {/*
        The counts stay on screen during an outage because a frozen tally is still
        operationally useful — but only under a heading that says what it is. One shared
        qualification for the whole group, from the same connection fact that suppresses
        the row labels below (ADR 23); a per-metric tag would imply the four numbers can
        differ in currency, and a client-derived "as of" timestamp would be invented
        provenance (Principle 4). No aria-live: the shell banner already announces the
        outage, and a second announcement of the same event is noise, not access.
      */}
      <Box component="section" aria-labelledby="fleet-summary-heading" sx={{ mb: 3 }}>
        <Typography id="fleet-summary-heading" variant="h2" component="h2" sx={{ mb: 2 }}>
          {streamConnected ? "Fleet freshness" : "Fleet freshness · last known"}
        </Typography>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
          <Stat label="Live" value={summary.live} hint={`of ${String(robots.length)}`} />
          <Stat
            label="Stale"
            value={summary.stale}
            tone={summary.stale > 0 ? "warning" : "default"}
          />
          <Stat
            label="Unreachable"
            value={summary.unreachable}
            tone={summary.unreachable > 0 ? "critical" : "default"}
          />
          <Stat label="Unknown" value={summary.unknown} />
        </Stack>
      </Box>

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
            onChange={handleSiteChange}
          >
            <MenuItem value={ALL}>All sites</MenuItem>
            {SITES.map((site) => (
              <MenuItem key={site.id} value={site.id}>
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
            onChange={handleVendorChange}
          >
            <MenuItem value={ALL}>All vendors</MenuItem>
            {VENDORS.map((vendor) => (
              <MenuItem key={vendor} value={vendor}>
                Vendor {vendor}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="freshness-filter-label">Freshness</InputLabel>
          <Select
            labelId="freshness-filter-label"
            label="Freshness"
            value={filters.freshness}
            onChange={handleFreshnessChange}
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
          onChange={(event) => {
            setFilters((prev) => ({ ...prev, search: event.target.value }));
          }}
          sx={{ minWidth: 160 }}
        />
      </Stack>

      {/*
        Page spec §10 separates these two conditions, and the difference is
        operational: an empty manifest is a fact about the fleet and is not an
        error, while an over-narrow filter is something the reader can undo.
        Offering "Clear filters" against an empty fleet would be an action that
        does nothing (Principle 5).
      */}
      {robots.length === 0 ? (
        <EmptyState
          title="No robots registered"
          description="No robots are present in the fleet manifest yet."
        />
      ) : null}

      {robots.length > 0 && filteredRobots.length === 0 ? (
        <EmptyState
          title="No robots match these filters"
          description="Clear filters or change site."
          action={
            <Button type="button" variant="outlined" size="small" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : null}

      {filteredRobots.length > 0 ? (
        <Paper sx={{ overflow: "hidden" }}>
          {/* Sticky header per page spec §4 and DESIGN_SYSTEM §5; the container
              needs a bounded height for the header to have anything to stick to. */}
          <TableContainer sx={{ maxHeight: "70vh" }}>
            <Table size="small" stickyHeader aria-label="Fleet">
              <TableHead>
                <TableRow>
                  <TableCell>Robot id</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Freshness</TableCell>
                  <TableCell>Site</TableCell>
                  <TableCell align="right">Battery</TableCell>
                  <TableCell align="right">Last seen</TableCell>
                </TableRow>
              </TableHead>
              {/*
                No aria-live wrapper here, per page spec §9: an aggressive
                live region on every row would announce every delta as it
                arrives once this is wired to the real store. Freshness
                changes are visible, not announced.
              */}
              <TableBody>
                {filteredRobots.map((robot) => {
                  const presentation = selectStatusPresentation(robot);
                  return (
                    <TableRow
                      key={robot.id}
                      hover
                      sx={{ "&:hover": { bgcolor: "var(--row-hover)" } }}
                    >
                      <TableCell component="th" scope="row">
                        {/*
                          The only activation path in the row, and it fills its
                          cell (page spec §2). A row-level onClick plus this
                          nested link would fire twice on one pointer click and
                          would still leave no keyboard path, because a <tr> is
                          not focusable (Principle 6).
                        */}
                        <Link
                          to={`/robots/${robot.id}`}
                          style={{
                            display: "block",
                            width: "100%",
                            fontFamily: "var(--font-mono)",
                            fontVariantNumeric: "tabular-nums",
                            color: "inherit",
                            textDecoration: "none",
                          }}
                        >
                          {robot.id}
                        </Link>
                      </TableCell>
                      <TableCell sx={{ color: "text.secondary" }}>{robot.vendor}</TableCell>
                      <TableCell>
                        <StatusChip
                          variant={presentation.variant}
                          label={presentation.label}
                          current={presentation.current}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        {/*
                          Suppressed, not substituted. While the stream is down the cell is
                          empty and the shell's banner carries the connection-level state
                          (fleet spec § 8, ADR 3). A per-robot "unreachable" here would
                          blame every machine for the console's own dead socket.
                        */}
                        {streamConnected ? (
                          <FreshnessLabel state={robot.freshness} asOf={robot.lastSeenAt} compact />
                        ) : null}
                      </TableCell>
                      <TableCell>{selectSiteLabel(robot.siteId)}</TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontFamily: "var(--font-mono)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {selectBatteryDisplay(robot)}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontFamily: "var(--font-mono)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatTimeUtc(robot.lastSeenAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ px: 3, py: 2 }}>
            <DataPlate>
              Fleet snapshot · latest reading {formatTimeUtc(latestReadingAt)} · source: local
              fixture
            </DataPlate>
          </Box>
        </Paper>
      ) : null}
    </Box>
  );
}

export default FleetPage;
