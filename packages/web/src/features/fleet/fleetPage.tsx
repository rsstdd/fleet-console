import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
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

import type { FleetData } from "@/entities/robot/fleetStore";
import {
  selectBatteryDisplay,
  selectFreshnessSummary,
  selectStatusPresentation,
  type FreshnessSummary,
} from "@/entities/robot/selectors";
import { useFleetRobots } from "@/entities/robot/useFleetRobots";
import type { Freshness, Robot } from "@/entities/robot/model";
import { selectSiteLabel, type Site } from "@/entities/site/model";

import { formatTimeUtc } from "@/shared/lib/time";

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
 * The fleet-wide freshness strip. The counts stay on screen during an outage
 * because a frozen tally is still operationally useful — but only under a
 * heading that says what it is. One shared qualification for the whole group,
 * from the same connection fact that suppresses the row labels below (ADR 23);
 * a per-metric tag would imply the four numbers can differ in currency, and a
 * client-derived "as of" timestamp would be invented provenance (Principle 4).
 * No aria-live: the shell banner already announces the outage, and a second
 * announcement of the same event is noise, not access.
 */
function FleetSummary({
  streamConnected,
  summary,
  total,
}: {
  readonly streamConnected: boolean;
  readonly summary: FreshnessSummary;
  readonly total: number;
}): ReactNode {
  return (
    <Box component="section" aria-labelledby="fleet-summary-heading" sx={{ mb: 3 }}>
      <Typography id="fleet-summary-heading" variant="h2" component="h2" sx={{ mb: 2 }}>
        {streamConnected ? "Fleet reporting status" : "Fleet reporting status · last known"}
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Stat label="Live" value={summary.live} hint={`of ${String(total)}`} />
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
  );
}

/**
 * The filter bar. Filter state is local view state owned by the page
 * (Principle 11); this component only renders the controls and reports
 * changes upward through the handlers it is given.
 */
function FleetFilters({
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

/**
 * The fleet table plus its provenance plate, rendering exactly the rows it is
 * given — filtering stays with the page that owns the filter state.
 */
function FleetTable({
  robots,
  sites,
  streamConnected,
  capturedAt,
  latestFrameAt,
}: {
  readonly robots: readonly Robot[];
  readonly sites: readonly Site[];
  readonly streamConnected: boolean;
  readonly capturedAt: number;
  readonly latestFrameAt: number | null;
}): ReactNode {
  return (
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
              <TableCell>Reporting status</TableCell>
              <TableCell>Site</TableCell>
              <TableCell align="right">Battery</TableCell>
              <TableCell align="right">Last seen</TableCell>
            </TableRow>
          </TableHead>
          {/*
            No aria-live wrapper here, per page spec §9: an aggressive
            live region on every row would announce every delta as it
            arrives. Freshness changes are visible, not announced.
          */}
          <TableBody>
            {robots.map((robot) => {
              const presentation = selectStatusPresentation(robot);
              return (
                <TableRow key={robot.id} hover sx={{ "&:hover": { bgcolor: "var(--row-hover)" } }}>
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
                  <TableCell>{selectSiteLabel(robot.siteId, sites)}</TableCell>
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
        {/*
          Decoded provenance, never invented: the capture instant the server
          stamped on the snapshot, and the send instant of the last applied
          stream frame (Principle 4, ADR 34). A client clock here would stamp
          render time, which moves while the data does not.
        */}
        <DataPlate>
          Fleet snapshot captured {formatTimeUtc(capturedAt)} · latest stream frame{" "}
          {latestFrameAt === null ? "none yet" : formatTimeUtc(latestFrameAt)}
        </DataPlate>
      </Box>
    </Paper>
  );
}

/**
 * Fleet overview — the operator's primary surface. See page spec 02.
 *
 * Renders the complete resource-state matrix (Principle 5): initial loading,
 * empty roster, filtered empty, retained rows during refresh and errors,
 * recoverable failure with a retry, and terminal contract failure naming the
 * issue paths and codes. Data-bearing error states keep last-known rows on
 * screen under an honest banner rather than blanking (Principle 4).
 *
 * Summary counts reflect the whole fleet, not the filtered set: a reader
 * adjusting filters to find one robot should not watch the fleet-wide
 * freshness counts change underneath them. Filtering and summarising are
 * two different questions, and the wireframe treats the strip as constant
 * while the table below it narrows.
 *
 * Filter options are derived, never declared: vendors from the robots on
 * screen — the vendor set is open, and a constant would close it (ADR 1) —
 * and sites from the snapshot's directory, the only source of labels (ADR 34).
 *
 * Activation is the robot id link and nothing else — the row carries no click
 * handler and is not focusable (page spec §2, Principle 6). Filter state is
 * local view state owned by this feature; it is never written back to the store
 * and never merged with observed telemetry (Principle 11). Nothing here derives
 * freshness: `robot.freshness` arrives on the envelope from the server sweep,
 * and this feature holds no timer (ADR 3). Connection state stays separate
 * from resource state: the shell banner owns the socket story, and this page
 * only suppresses per-row freshness while the stream is down (ADR 3, ADR 23).
 */
export function FleetPage(): ReactNode {
  const resource = useFleetRobots();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  /*
   * Whether per-robot freshness may be shown at all. Read once here rather than per row:
   * it is one fact about the console's own socket, not a property of any robot, and
   * Principle 11 keeps the two apart. The rule itself lives in `shared/lib` so this page
   * and robot detail cannot drift into suppressing on different conditions (ADR 3, ADR 23).
   */
  const streamConnected = isStreamConnected(useConnectionState());

  const data: FleetData | null = "data" in resource ? resource.data : null;
  const robots = useMemo(() => data?.robots ?? [], [data]);
  const sites = data?.sites ?? [];

  const summary = useMemo(() => selectFreshnessSummary(robots), [robots]);

  /** Vendor options observed in the fleet itself; the set is open (ADR 1). */
  const vendorOptions = useMemo(
    () => [...new Set(robots.map((robot) => robot.vendor))].sort(),
    [robots],
  );

  const filteredRobots = useMemo(
    () => robots.filter((robot) => matchesFilters(robot, filters)),
    [robots, filters],
  );

  const handleSiteChange = (event: SelectChangeEvent): void => {
    setFilters((prev) => ({ ...prev, site: event.target.value }));
  };

  const handleVendorChange = (event: SelectChangeEvent): void => {
    setFilters((prev) => ({ ...prev, vendor: event.target.value }));
  };

  const handleFreshnessChange = (event: SelectChangeEvent): void => {
    setFilters((prev) => ({ ...prev, freshness: event.target.value as FreshnessFilter }));
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    setFilters((prev) => ({ ...prev, search: event.target.value }));
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
        Terminal by decision, not by mood: the server sent bytes this console cannot
        read, and retrying returns the same bytes, so no retry is offered (ADR 20).
        The issue paths and codes are the decoder's own vocabulary and carry no
        rejected value. Retained rows stay below under this banner.
      */}
      {resource.kind === "terminal-error" ? (
        <Alert severity="error" sx={{ mb: 3 }}>
          The fleet response did not match the canonical contract, and retrying would return the
          same bytes.
          {resource.issues.length > 0 ? (
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 3 }}>
              {resource.issues.map((issue) => (
                <li key={`${issue.path}:${issue.code}`}>
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ fontFamily: "var(--font-mono)" }}
                  >
                    {issue.path}: {issue.code}
                  </Typography>
                </li>
              ))}
            </Box>
          ) : null}
          {data !== null ? (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Showing the last data this console could read.
            </Typography>
          ) : null}
        </Alert>
      ) : null}

      {/* Recoverable: the one state whose banner offers a retry (Principle 5). */}
      {resource.kind === "recoverable-error" ? (
        <Alert
          severity="warning"
          sx={{ mb: 3 }}
          action={
            <Button type="button" color="inherit" size="small" onClick={resource.retry}>
              Retry
            </Button>
          }
        >
          {data === null
            ? "The fleet could not be loaded. The server did not answer."
            : "The fleet could not be refreshed. Showing last-known data."}{" "}
          ({resource.failure.cause})
        </Alert>
      ) : null}

      {/*
        Initial load: nothing is known yet, and the page says so instead of an empty
        fleet. `aria-busy` + polite live region rather than role="status", because the
        shell's connection banner already owns that role and two status regions would
        double-announce one joining sequence (ADR 23).
      */}
      {resource.kind === "loading" ? (
        <Box aria-busy="true" aria-live="polite">
          <Typography sx={{ mb: 2, color: "text.secondary" }}>Loading fleet…</Typography>
          <Skeleton variant="rounded" height={48} sx={{ mb: 1 }} />
          <Skeleton variant="rounded" height={240} />
        </Box>
      ) : null}

      {/*
        A rejoin over retained rows; quiet and visual only. The connection banner
        announces outages, so this line is not a live region — it would re-announce
        every automatic reconnect attempt (ADR 23).
      */}
      {resource.kind === "refreshing" ? (
        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Refreshing fleet data · showing last-known rows
        </Typography>
      ) : null}

      {data !== null ? (
        <>
          <FleetSummary streamConnected={streamConnected} summary={summary} total={robots.length} />

          <FleetFilters
            filters={filters}
            sites={sites}
            vendorOptions={vendorOptions}
            onSiteChange={handleSiteChange}
            onVendorChange={handleVendorChange}
            onFreshnessChange={handleFreshnessChange}
            onSearchChange={handleSearchChange}
          />

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
            <FleetTable
              robots={filteredRobots}
              sites={sites}
              streamConnected={streamConnected}
              capturedAt={data.capturedAt}
              latestFrameAt={data.latestFrameAt}
            />
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
