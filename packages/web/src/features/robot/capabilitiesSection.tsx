import type { ReactNode } from "react";
import { Box } from "@mui/material";

import type { RobotDetail } from "@/types/robot";
import { selectPanelCapabilities } from "@/utils/robotSelectors";

import { TENANT } from "@/config/tenant";

import { CapabilityPanel } from "./capabilityPanels";
import { Section } from "./detailSection";
import { disabledPanelsFor } from "./panelVisibility";

/**
 * Declared non-core capabilities only. An empty declaration renders nothing at
 * all — no heading, no empty grid, no disabled placeholder (spec §10).
 *
 * A panel appears when the robot declared the capability **and** this tenant
 * enables it (ADR 17). Both conditions are resolved before rendering: there is
 * no tenant name in this file and no flag read inside a panel body, which is
 * what Principle 13 asks for structurally rather than by review.
 */
export function CapabilitiesSection({ robot }: { readonly robot: RobotDetail }): ReactNode {
  const capabilities = selectPanelCapabilities(robot, disabledPanelsFor(TENANT.flags));
  if (capabilities.length === 0) {
    return null;
  }

  return (
    <Section index="03" title="Capabilities">
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: "repeat(auto-fill, minmax(var(--panel-min-width), 1fr))",
        }}
      >
        {capabilities.map((name) => (
          // Keyed by capability name so a changed declaration patches the grid
          // rather than remounting every panel in it (spec §7).
          <CapabilityPanel key={name} name={name} capabilities={robot.capabilities} />
        ))}
      </Box>
    </Section>
  );
}
