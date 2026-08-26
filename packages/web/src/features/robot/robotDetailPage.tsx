import { useState } from "react";
import { Link as RouterLink, useParams } from "react-router";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { EmptyState, ErrorState, Loading } from "@/components/asyncState";
import { FreshnessLabel } from "@/components/freshnessLabel";
import { Stat } from "@/components/stat";
import { StatusChip } from "@/components/statusChip";
import { useFleetContext } from "@/context/fleetContext";
import { useRobotDetail } from "@/hooks/useRobotDetail";
import {
  NO_HONEST_VALUE,
  selectBatteryDisplay,
  selectClockDeltaDisplay,
  selectPanelCapabilities,
  selectPositionDisplay,
  selectSequenceDisplay,
  selectStatusPresentation,
} from "@/utils/robotSelectors";
import { CapabilityPanel } from "@/features/robot/capabilityPanels";

export function RobotDetailPage() {
  const { robotId = "" } = useParams();
  const state = useRobotDetail(robotId);
  const { connection } = useFleetContext();
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  if (state.kind === "loading") {
    return <Loading label={`Loading ${robotId}…`} />;
  }
  if (state.kind === "error") {
    return state.failure.kind === "not-found" ? (
      <EmptyState title={`No robot ${robotId} on the roster.`} />
    ) : (
      <ErrorState title="Could not load this robot." />
    );
  }

  const robot = state.robot;
  const isStreamConnected = connection === "connected";
  const panels = selectPanelCapabilities(robot);

  return (
    <Stack spacing={3}>
      <Link component={RouterLink} to="/">
        ← All robots
      </Link>

      <Box>
        <Typography variant="h1" className="mono">
          {robot.id}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", mt: 1 }}>
          <StatusChip presentation={selectStatusPresentation(robot)} />
          {robot.observed ? (
            <FreshnessLabel freshness={robot.freshness} suppressed={!isStreamConnected} />
          ) : (
            <Typography variant="body2">Never reported</Typography>
          )}
        </Stack>
      </Box>

      <Paper sx={{ p: 2 }}>
        <Stack direction="row" spacing={4} sx={{ flexWrap: "wrap" }} useFlexGap>
          <Stat label="Vendor" value={robot.vendor} />
          <Stat label="Model" value={robot.model ?? NO_HONEST_VALUE} />
          <Stat label="Site" value={robot.siteId} />
          <Stat label="Battery" value={selectBatteryDisplay(robot, isStreamConnected)} />
          <Stat label="Position" value={selectPositionDisplay(robot, isStreamConnected)} />
          <Stat label="Last reported" value={robot.lastSeenAt ?? NO_HONEST_VALUE} />
        </Stack>
      </Paper>

      {panels.length > 0 && (
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }} useFlexGap>
          {panels.map((name) => (
            <CapabilityPanel key={name} robot={robot} name={name} />
          ))}
        </Stack>
      )}

      <FormControlLabel
        control={
          <Switch
            checked={showDiagnostics}
            onChange={(event) => {
              setShowDiagnostics(event.target.checked);
            }}
          />
        }
        label="Technician diagnostics"
      />

      {showDiagnostics && robot.diagnostics !== null && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h2" sx={{ mb: 2 }}>
            Diagnostics
          </Typography>
          <Stack direction="row" spacing={4} sx={{ flexWrap: "wrap" }} useFlexGap>
            <Stat label="Adapter" value={robot.diagnostics.adapterId} />
            <Stat label="Adapter version" value={robot.diagnostics.adapterVersion} />
            <Stat label="Schema" value={robot.diagnostics.schemaVersion} />
            <Stat
              label="Sequence"
              value={
                robot.diagnostics.sequence === null
                  ? "Not reported"
                  : String(robot.diagnostics.sequence)
              }
            />
            <Stat label="Gaps" value={selectSequenceDisplay(robot, "gaps")} />
            <Stat label="Duplicates" value={selectSequenceDisplay(robot, "duplicates")} />
            <Stat label="Clock delta" value={selectClockDeltaDisplay(robot)} />
          </Stack>

          {robot.rawPayload !== null && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" sx={{ color: "var(--text-muted)" }}>
                Raw vendor payload, as received
              </Typography>
              <pre className="raw-payload">{JSON.stringify(robot.rawPayload, null, 2)}</pre>
            </Box>
          )}
        </Paper>
      )}
    </Stack>
  );
}
