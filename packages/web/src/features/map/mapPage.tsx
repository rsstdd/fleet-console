import { useState, type ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import { DataPlate } from "@/components/dataPlate";
import { EmptyState } from "@/components/emptyState";
import { isStreamConnected, useConnectionState } from "@/context/connectionContext";

import type { FleetData } from "@/stores/fleetStore";
import {
  computeSiteExtents,
  computeViewBoxSize,
  mergeExtents,
  selectMapMarker,
  selectPlottableRobots,
  selectPositionedSummary,
  selectSiteRobots,
  selectUnpositionedRobots,
  type SiteExtents,
} from "@/utils/robotSelectors";
import { useFleetRobots } from "@/hooks/useFleetRobots";
import { selectSiteLabel } from "@/utils/siteLabel";

import { MAP_VIEWBOX_WIDTH, MapCanvas } from "./mapCanvas";
import { RobotList } from "./robotList";

/**
 * Map page: one site's positions at a time (page spec 04, ADR 34, ADR 35).
 *
 * Site selection and the per-site running extents are local view state
 * (Principle 11); all computation over them lives in `utils/robotSelectors`
 * (ADR 35). Freshness arrives on the envelope — no timer here (ADR 3).
 */
export function MapPage(): ReactNode {
  const resource = useFleetRobots();
  const isFleetStreamConnected = isStreamConnected(useConnectionState());
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  /*
   * Per-site running extents, persisted via render-phase setState: `mergeExtents`
   * returns `previous` by reference when nothing widened, so a settled box
   * writes nothing (ADR 35).
   */
  const [extentsBySite, setExtentsBySite] = useState<ReadonlyMap<string, SiteExtents>>(
    () => new Map(),
  );

  const data: FleetData | null = "data" in resource ? resource.data : null;
  const robots = data?.robots ?? [];
  const sites = data?.sites ?? [];

  // A stale selection (manifest replaced, ADR 31/34) falls back to the first site.
  const selectionValid = sites.some((site) => site.siteId === selectedSite);
  const siteId = (selectionValid ? selectedSite : null) ?? sites[0]?.siteId ?? null;
  const siteLabel = siteId === null ? "" : selectSiteLabel(siteId, sites);

  const plottable = siteId === null ? [] : selectPlottableRobots(robots, siteId);
  const siteRobots = siteId === null ? [] : selectSiteRobots(robots, siteId);
  const unpositionedRobots = selectUnpositionedRobots(siteRobots);
  const summary =
    siteId === null ? { positioned: 0, total: 0 } : selectPositionedSummary(robots, siteId);

  const previousExtents = siteId === null ? null : (extentsBySite.get(siteId) ?? null);
  const merged =
    siteId === null
      ? null
      : mergeExtents(previousExtents, computeSiteExtents(plottable.map((robot) => robot.position)));
  if (siteId !== null && merged !== null && merged !== previousExtents) {
    setExtentsBySite(new Map(extentsBySite).set(siteId, merged));
  }

  const viewBox = merged === null ? null : computeViewBoxSize(merged, MAP_VIEWBOX_WIDTH);
  const markers =
    merged === null || viewBox === null
      ? []
      : plottable.map((robot) => selectMapMarker(robot, merged, viewBox, isFleetStreamConnected));

  const handleSiteChange = (_event: unknown, value: unknown): void => {
    // A deselect (null) is ignored: the map always shows exactly one site.
    if (typeof value === "string") {
      setSelectedSite(value);
    }
  };

  return (
    <Box component="section" aria-labelledby="map-heading">
      <Typography id="map-heading" variant="h1" component="h1" sx={{ mb: 3 }}>
        Map
      </Typography>

      {/* Terminal by decision: same contract-failure treatment as the fleet page (ADR 20). */}
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

      {/* Same busy treatment as the fleet page: the shell banner owns role="status" (ADR 23). */}
      {resource.kind === "loading" ? (
        <Box aria-busy="true" aria-live="polite">
          <Typography sx={{ mb: 2, color: "text.secondary" }}>Loading map…</Typography>
          <Skeleton variant="rounded" height={48} sx={{ mb: 1 }} />
          <Skeleton variant="rounded" height={240} />
        </Box>
      ) : null}

      {resource.kind === "refreshing" ? (
        <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
          Refreshing fleet data · showing last-known positions
        </Typography>
      ) : null}

      {data !== null ? (
        robots.length === 0 ? (
          <EmptyState
            title="No robots registered"
            description="No robots are present in the fleet manifest yet."
          />
        ) : (
          <>
            <Stack direction="row" spacing={2} sx={{ mb: 3, alignItems: "center" }}>
              <Typography id="map-site-label" variant="body2" sx={{ color: "text.secondary" }}>
                Site
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={siteId}
                onChange={handleSiteChange}
                aria-labelledby="map-site-label"
              >
                {sites.map((site) => (
                  <ToggleButton key={site.siteId} value={site.siteId}>
                    {site.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>

            <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
              {/* The heading carries the one shared currency qualification (ADR 23). */}
              <Box
                component="section"
                aria-labelledby="map-positions-heading"
                sx={{ flex: 2, minWidth: 0 }}
              >
                <Typography id="map-positions-heading" variant="h2" component="h2" sx={{ mb: 1 }}>
                  {isFleetStreamConnected
                    ? `Positions · ${siteLabel}`
                    : `Positions · ${siteLabel} · last known`}
                </Typography>
                <Typography variant="body2" sx={{ mb: 2, color: "text.secondary" }}>
                  {String(summary.positioned)} of {String(summary.total)} robots positioned
                </Typography>
                <Paper sx={{ p: 3 }}>
                  <Stack component="figure" spacing={1.5} sx={{ m: 0 }}>
                    <MapCanvas
                      markers={markers}
                      viewBox={viewBox}
                      siteLabel={siteLabel}
                      positionedCount={summary.positioned}
                      totalCount={summary.total}
                    />
                    {/* The caption names the frame as derived, not a floor plan (ADR 35). */}
                    <DataPlate as="figcaption">
                      derived site frame · metres · no floor plan
                    </DataPlate>
                  </Stack>
                </Paper>
                {/* The legend and the list carry the fill rule as text (Principle 6). */}
                <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
                  ● filled = Live &nbsp; ○ hollow = not Live
                </Typography>
              </Box>

              <Box
                component="section"
                aria-labelledby="map-robots-heading"
                sx={{ flex: 1, minWidth: 0 }}
              >
                <Typography id="map-robots-heading" variant="h2" component="h2" sx={{ mb: 2 }}>
                  Robots
                </Typography>
                <RobotList robots={siteRobots} isStreamConnected={isFleetStreamConnected} />
                {unpositionedRobots.length > 0 ? (
                  <>
                    <Typography variant="h3" component="h3" sx={{ mt: 3, mb: 1 }}>
                      No position
                    </Typography>
                    <RobotList
                      robots={unpositionedRobots}
                      isStreamConnected={isFleetStreamConnected}
                      isUnpositioned
                    />
                  </>
                ) : null}
              </Box>
            </Stack>
          </>
        )
      ) : null}
    </Box>
  );
}
