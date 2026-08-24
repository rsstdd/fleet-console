import type { ReactNode } from "react";
import { Link } from "react-router";
import { Box, Stack, Typography } from "@mui/material";

import { isStreamConnected, useConnectionState } from "@/context/connectionContext";
import { FreshnessLabel } from "@/components/freshnessLabel";
import { PersonaToggle, type Persona } from "@/components/personaToggle";
import { StatusChip } from "@/components/statusChip";

import type { RobotDetail } from "@/types/robot";
import { selectStatusPresentation } from "@/utils/robotSelectors";
import { useFleetSites } from "@/hooks/useFleetRobots";
import { selectSiteLabel } from "@/utils/siteLabel";

import { MONO } from "./detailStyles";

/** Back to the fleet, per spec §2. A link, not a history-popping button. */
export function BackToFleet(): ReactNode {
  return (
    <Typography component={Link} to="/" variant="body2" sx={{ color: "var(--accent-text)" }}>
      ← Fleet
    </Typography>
  );
}

/**
 * Identity row: id, status, freshness, site, vendor and model, with the
 * persona toggle opposite. Freshness is present on every render of this row,
 * because a value without its age is the failure Principle 4 exists to
 * prevent.
 */
export function DetailHeader({
  robot,
  persona,
  onPersonaChange,
}: {
  readonly robot: RobotDetail;
  readonly persona: Persona;
  readonly onPersonaChange: (next: Persona) => void;
}): ReactNode {
  const presentation = selectStatusPresentation(robot);
  /* One fact about the console's socket, not about this robot (Principle 11, ADR 23). */
  const isFleetStreamConnected = isStreamConnected(useConnectionState());
  /* The snapshot's directory, the only source of a site label (ADR 34). */
  const sites = useFleetSites();

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", md: "center" },
      }}
    >
      <Box>
        <Typography id="robot-heading" variant="h1" component="h1" sx={MONO}>
          Robot {robot.id}
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap", alignItems: "center", mt: 1 }}
        >
          <StatusChip
            variant={presentation.variant}
            label={presentation.label}
            isCurrent={presentation.isCurrent}
            size="small"
          />
          {/*
            Suppressed while the stream is down, in favour of the shell's banner
            (robot detail spec § 8, ADR 3). The values below freeze at last known;
            what must not survive is the claim about how current they are.
          */}
          {isFleetStreamConnected ? (
            <FreshnessLabel
              state={robot.freshness}
              asOf={robot.lastSeenAt}
              receivedAt={robot.diagnostics?.receivedAt ?? undefined}
              isCompact
            />
          ) : null}
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {selectSiteLabel(robot.siteId, sites)} · Vendor {robot.vendor} · {robot.model ?? "—"}
          </Typography>
        </Stack>
      </Box>
      <PersonaToggle value={persona} onChange={onPersonaChange} />
    </Stack>
  );
}
