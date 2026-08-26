import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { EmptyState, ErrorState, Loading } from "@/components/asyncState";
import { Stat } from "@/components/stat";
import { FRESHNESS_COLOR } from "@/app/theme";
import { useFleetContext } from "@/context/fleetContext";
import { useFleetState } from "@/hooks/useFleetRobots";
import { FRESHNESS_LABEL, selectFreshnessSummary } from "@/utils/robotSelectors";
import { applyFilters, type FleetFilters, NO_FILTERS } from "@/features/fleet/fleetFilterModel";
import { FleetTable } from "@/features/fleet/fleetTable";

export function FleetPage() {
  const state = useFleetState();
  const { connection } = useFleetContext();
  const [filters, setFilters] = useState<FleetFilters>(NO_FILTERS);

  const data = "data" in state ? state.data : null;
  const robots = useMemo(() => data?.robots ?? [], [data]);
  const visible = useMemo(() => applyFilters(robots, filters), [robots, filters]);
  const summary = useMemo(() => selectFreshnessSummary(robots), [robots]);
  const siteLabels = useMemo(
    () => new Map((data?.sites ?? []).map((site) => [site.siteId, site.label])),
    [data],
  );

  const update = <TKey extends keyof FleetFilters>(key: TKey, value: FleetFilters[TKey]): void => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  if (state.kind === "loading") {
    return <Loading label="Loading fleet…" />;
  }

  if (state.kind === "terminal-error") {
    return (
      <ErrorState
        title="The fleet snapshot did not match the contract."
        detail={state.issues.map((issue) => `${issue.path}: ${issue.code}`).join(", ")}
      />
    );
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={4} sx={{ flexWrap: "wrap" }} useFlexGap>
          <Stat label="Robots" value={String(robots.length)} />
          {(["live", "stale", "unreachable", "unknown"] as const).map((freshness) => (
            <Stat
              key={freshness}
              label={FRESHNESS_LABEL[freshness]}
              value={String(summary[freshness])}
              color={FRESHNESS_COLOR[freshness]}
            />
          ))}
        </Stack>
      </Paper>

      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }} useFlexGap>
        <TextField
          size="small"
          label="Search"
          value={filters.search}
          onChange={(event) => {
            update("search", event.target.value);
          }}
        />
        <TextField
          size="small"
          select
          label="Site"
          sx={{ minWidth: 160 }}
          value={filters.siteId}
          onChange={(event) => {
            update("siteId", event.target.value);
          }}
        >
          <MenuItem value="all">All sites</MenuItem>
          {(data?.sites ?? []).map((site) => (
            <MenuItem key={site.siteId} value={site.siteId}>
              {site.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          select
          label="Freshness"
          sx={{ minWidth: 160 }}
          value={filters.freshness}
          onChange={(event) => {
            update("freshness", event.target.value as FleetFilters["freshness"]);
          }}
        >
          <MenuItem value="all">Any freshness</MenuItem>
          {(["live", "stale", "unreachable", "unknown"] as const).map((freshness) => (
            <MenuItem key={freshness} value={freshness}>
              {FRESHNESS_LABEL[freshness]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Box>
        <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
          Showing {visible.length} of {robots.length} robots
        </Typography>
        {visible.length === 0 ? (
          <EmptyState
            title="No robots match these filters."
            detail="Widen the filters to see more."
          />
        ) : (
          <FleetTable
            robots={visible}
            siteLabels={siteLabels}
            isStreamConnected={connection === "connected"}
          />
        )}
      </Box>
    </Stack>
  );
}
