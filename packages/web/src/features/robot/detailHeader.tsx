import type { ReactNode } from "react";
import { Link } from "react-router";
import { Box, Stack, Typography } from "@mui/material";

import { FreshnessLabel } from "@/components/freshnessLabel";
import { PersonaToggle, type Persona } from "@/components/personaToggle";
import { StatusChip } from "@/components/statusChip";
import { isStreamConnected, useConnectionState } from "@/context/connectionContext";
import { useFleetSites } from "@/hooks/useFleetRobots";
import type { Robot } from "@/types/robot";
import { selectStatusPresentation } from "@/utils/robotSelectors";
import { selectSiteLabel } from "@/utils/siteLabel";

import { MONO } from "./detailStyles";

interface DetailHeaderProps {
  readonly robot: Robot;
  /** When the server received the payload behind the fetched detail; null when none was fetched. */
  readonly receivedAt: string | null;
  readonly persona: Persona;
  readonly onPersonaChange: (persona: Persona) => void;
}

export function BackToFleet(): ReactNode {
  return (
    <Typography component={Link} to="/" variant="body2" sx={{ color: "var(--accent-text)" }}>
      ← Fleet
    </Typography>
  );
}

export function DetailHeader({
  robot,
  receivedAt,
  persona,
  onPersonaChange,
}: DetailHeaderProps): ReactNode {
  const status = selectStatusPresentation(robot);
  const streamConnected = isStreamConnected(useConnectionState());
  const sites = useFleetSites();

  const siteLabel = selectSiteLabel(robot.siteId, sites);
  const modelLabel = robot.model ?? "—";

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
        <Typography id="robot-heading" component="h1" variant="h1" sx={MONO}>
          Robot {robot.id}
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            alignItems: "center",
            flexWrap: "wrap",
            mt: 1,
          }}
        >
          <StatusChip
            variant={status.variant}
            label={status.label}
            isCurrent={status.isCurrent}
            size="small"
          />

          {streamConnected && (
            <FreshnessLabel
              state={robot.freshness}
              asOf={robot.lastSeenAt}
              {...(receivedAt === null ? {} : { receivedAt })}
              isCompact
            />
          )}

          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {siteLabel} · Vendor {robot.vendor} · {modelLabel}
          </Typography>
        </Stack>
      </Box>

      <PersonaToggle value={persona} onChange={onPersonaChange} />
    </Stack>
  );
}
