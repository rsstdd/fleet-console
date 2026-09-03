import type { ReactNode } from "react";
import { Paper, Stack, Typography } from "@mui/material";

import type { CapabilitySet, PanelCapabilityName } from "@/entities/robot/model";

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

/** One labelled value inside a panel. Em dash for a field the vendor omitted. */
function PanelRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
      <Typography variant="body2" component="dt" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="dd"
        sx={{
          m: 0,
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

/**
 * The registry. Keyed by `PanelCapabilityName`, so a capability added to the
 * canonical model either gets a panel here or is explicitly carved out as
 * diagnostic-only in `entities/robot` — it cannot be forgotten silently.
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
          <PanelRow label="Docked" value={dock.docked ? "Yes" : "No"} />
          <PanelRow label="Dock id" value={dock.dockId ?? "—"} />
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
          <PanelRow label="Severity" value={lidar.severity} />
          <PanelRow
            label="Rotation"
            value={lidar.rpm === null ? "—" : `${String(lidar.rpm)} rpm`}
          />
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
        <PanelRow
          label="Level"
          value={water.percent === null ? "—" : `${String(water.percent)}%`}
        />
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
    <Paper component="section" aria-labelledby={`capability-${name}`} sx={{ p: 2 }}>
      <Typography id={`capability-${name}`} variant="h3" component="h3" sx={{ mb: 1 }}>
        {entry.title}
      </Typography>
      <Stack component="dl" spacing={1} sx={{ m: 0 }}>
        {entry.render(capabilities)}
      </Stack>
    </Paper>
  );
}
