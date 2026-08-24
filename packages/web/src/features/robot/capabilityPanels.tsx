import type { ReactNode } from "react";
import { Paper, Stack, Typography } from "@mui/material";

import type { CapabilitySet, PanelCapabilityName } from "@/types/robot";

// Capability values reuse robot detail's one label/value row implementation.
import { Field } from "./detailSection";

/**
 * Capability panels for robot detail, resolved through a registry rather than
 * a chain of conditionals (spec §7). Adding a capability is one entry here
 * plus the contracts change — never an `if`, and never a vendor branch: a
 * vendor's difference reaches this file only as which keys its adapter
 * declared (Principle 3).
 *
 * Each `render` receives the capability set alone, never the robot. Core
 * fields — battery, position, status, health — are therefore not reachable
 * from a panel by construction, which is what spec §6 asks for structurally
 * instead of by review.
 */
export interface CapabilityPanelEntry {
  /** Rendered as the panel's `h3`, under the Capabilities `h2` (spec §9). */
  readonly title: string;
  readonly render: (capabilities: CapabilitySet) => ReactNode;
}

// Named once because every capability panel uses the same three layout decisions.
const PANEL_SX = { p: 2 } as const;
const PANEL_TITLE_SX = { mb: 1 } as const;
const PANEL_VALUES_SX = { m: 0 } as const;

/**
 * The registry. Keyed by `PanelCapabilityName`, so a capability added to the
 * canonical model either gets a panel here or is explicitly carved out as
 * diagnostic-only in `utils/robotSelectors` — it cannot be forgotten silently.
 *
 * Module-private: callers reach it only through `CapabilityPanel`, so no
 * caller can iterate it and render a panel for a capability a robot never
 * declared.
 */
const CAPABILITY_PANELS: Readonly<Record<PanelCapabilityName, CapabilityPanelEntry>> = {
  dock: {
    title: "Dock",
    render: (capabilities) => {
      const dock = capabilities.dock;
      if (dock === undefined) {
        return null;
      }
      return (
        <>
          <Field label="Docked" value={dock.docked ? "Yes" : "No"} />
          <Field label="Dock id" value={dock.dockId ?? "—"} />
        </>
      );
    },
  },
  lidarHealth: {
    title: "Lidar",
    render: (capabilities) => {
      const lidar = capabilities.lidarHealth;
      if (lidar === undefined) {
        return null;
      }
      return (
        <>
          {/* Severity is a word, never a colour alone (spec §9). */}
          <Field label="Severity" value={lidar.severity} />
          <Field label="Rotation" value={lidar.rpm === null ? "—" : `${String(lidar.rpm)} rpm`} />
        </>
      );
    },
  },
  waterLevel: {
    title: "Water level",
    render: (capabilities) => {
      const water = capabilities.waterLevel;
      if (water === undefined) {
        return null;
      }
      return (
        <Field label="Level" value={water.percent === null ? "—" : `${String(water.percent)}%`} />
      );
    },
  },
};

/**
 * Renders one registered panel. Keyed by capability name at the call site so a
 * robot whose declaration changes patches the grid rather than remounting it
 * (spec §7).
 */
export function CapabilityPanel({
  name,
  capabilities,
}: {
  readonly name: PanelCapabilityName;
  readonly capabilities: CapabilitySet;
}): ReactNode {
  const entry = CAPABILITY_PANELS[name];

  return (
    <Paper component="section" aria-labelledby={`capability-${name}`} sx={PANEL_SX}>
      <Typography id={`capability-${name}`} variant="h3" component="h3" sx={PANEL_TITLE_SX}>
        {entry.title}
      </Typography>
      <Stack component="dl" spacing={1} sx={PANEL_VALUES_SX}>
        {entry.render(capabilities)}
      </Stack>
    </Paper>
  );
}
