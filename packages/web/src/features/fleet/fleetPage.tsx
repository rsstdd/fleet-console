import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Skeleton,
  Typography,
  styled,
  type SelectChangeEvent,
} from "@mui/material";

import { EmptyState } from "@/components/emptyState";
import { isStreamConnected, useConnectionState } from "@/context/connectionContext";

import type { FleetData } from "@/stores/fleetStore";
import { selectFreshnessSummary } from "@/utils/robotSelectors";
import { useFleetRobots } from "@/hooks/useFleetRobots";

import {
  EMPTY_FILTERS,
  matchesFilters,
  toFreshnessFilter,
  toIdFilter,
  type Filters,
} from "./fleetFilterModel";
import { FleetFilters } from "./fleetFilters";
import { FleetSummary } from "./fleetSummary";
import { FleetTable } from "./fleetTable";

/*
 * Styled at module scope: the decode-issue list is a `.map`, and an `sx` object
 * written in the callback is re-allocated and re-serialized for every issue on
 * every render of the banner.
 */
const IssueCode = styled("span")(({ theme }) => ({
  ...theme.typography.body2,
  fontFamily: "var(--font-mono)",
}));

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
   * Principle 11 keeps the two apart. The rule itself lives in `context` so this page
   * and robot detail cannot drift into suppressing on different conditions (ADR 3, ADR 23).
   */
  const isFleetStreamConnected = isStreamConnected(useConnectionState());

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
    setFilters((prev) => ({ ...prev, site: toIdFilter(event.target.value) }));
  };

  const handleVendorChange = (event: SelectChangeEvent): void => {
    setFilters((prev) => ({ ...prev, vendor: toIdFilter(event.target.value) }));
  };

  const handleFreshnessChange = (event: SelectChangeEvent): void => {
    setFilters((prev) => ({ ...prev, freshness: toFreshnessFilter(event.target.value) }));
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    setFilters((prev) => ({ ...prev, search: event.target.value }));
  };

  const handleClearFilters = (): void => {
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
                  <IssueCode>
                    {issue.path}: {issue.code}
                  </IssueCode>
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
          <FleetSummary
            isStreamConnected={isFleetStreamConnected}
            summary={summary}
            total={robots.length}
          />

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
                <Button type="button" variant="outlined" size="small" onClick={handleClearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : null}

          {filteredRobots.length > 0 ? (
            <FleetTable
              robots={filteredRobots}
              sites={sites}
              isStreamConnected={isFleetStreamConnected}
              capturedAt={data.capturedAt}
              latestFrameAt={data.latestFrameAt}
            />
          ) : null}
        </>
      ) : null}
    </Box>
  );
}
