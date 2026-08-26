import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { OperatorCapabilityName } from "@fleet/contracts";
import { Stat } from "@/components/stat";
import { NO_HONEST_VALUE, SEVERITY_LABEL } from "@/utils/robotSelectors";
import type { Robot } from "@/types/robot";

const TITLE: Record<OperatorCapabilityName, string> = {
  dock: "Dock",
  lidarHealth: "Lidar",
  waterLevel: "Water",
};

export function CapabilityPanel({
  robot,
  name,
}: {
  readonly robot: Robot;
  readonly name: OperatorCapabilityName;
}) {
  return (
    <Paper sx={{ p: 2, minWidth: 200 }}>
      <Typography variant="h2" sx={{ fontSize: "0.9rem", mb: 1 }}>
        {TITLE[name]}
      </Typography>
      <Stack spacing={1}>{renderBody(robot, name)}</Stack>
    </Paper>
  );
}

function renderBody(robot: Robot, name: OperatorCapabilityName) {
  switch (name) {
    case "dock": {
      const dock = robot.capabilities.dock;
      return dock === undefined ? null : (
        <>
          <Stat label="Docked" value={dock.docked ? "Yes" : "No"} />
          <Stat label="Dock" value={dock.dockId ?? NO_HONEST_VALUE} />
        </>
      );
    }
    case "lidarHealth": {
      const lidar = robot.capabilities.lidarHealth;
      return lidar === undefined ? null : (
        <>
          <Stat label="Severity" value={SEVERITY_LABEL[lidar.severity]} />
          <Stat
            label="RPM"
            value={lidar.rpm === null ? NO_HONEST_VALUE : String(Math.round(lidar.rpm))}
          />
        </>
      );
    }
    case "waterLevel": {
      const water = robot.capabilities.waterLevel;
      return water === undefined ? null : (
        <Stat
          label="Level"
          value={water.percent === null ? NO_HONEST_VALUE : `${String(Math.round(water.percent))}%`}
        />
      );
    }
  }
}
