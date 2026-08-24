import type { ReactNode } from "react";
import { Link } from "react-router";
import { Stack, styled } from "@mui/material";

import { FreshnessLabel } from "@/components/freshnessLabel";
import { StatusChip } from "@/components/statusChip";

import type { Robot } from "@/types/robot";
import { selectStatusPresentation } from "@/utils/robotSelectors";

/*
 * Styled at module scope, not `sx` in the row callback. On a list that repaints
 * with the stream, an `sx` object built per row is re-allocated and re-serialized
 * on every frame; these serialize once, at import (ADR 24 discipline).
 */
const RobotRow = styled("li")(({ theme }) => ({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: theme.spacing(2),
}));

const RowLink = styled(Link)({
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  color: "inherit",
  textDecoration: "none",
});

/* `theme.typography.body2` rather than a repeated font stack: one source for the scale. */
const UnpositionedMark = styled("span")(({ theme }) => ({
  ...theme.typography.body2,
  color: theme.palette.text.secondary,
}));

/**
 * One row per robot with the id link as the sole activation path
 * (page spec 04 § 2); the `isUnpositioned` group accounts for robots that never
 * reported (Principle 4). Composed only by `mapPage.tsx`.
 */
export function RobotList({
  robots,
  isStreamConnected,
  isUnpositioned = false,
}: {
  readonly robots: readonly Robot[];
  readonly isStreamConnected: boolean;
  readonly isUnpositioned?: boolean;
}): ReactNode {
  const listed = isUnpositioned ? robots : robots.filter((robot) => robot.position !== null);
  return (
    <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: "none" }}>
      {listed.map((robot) => {
        const presentation = selectStatusPresentation(robot);
        return (
          <RobotRow key={robot.id}>
            <RowLink to={`/robots/${robot.id}`}>{robot.id}</RowLink>
            <StatusChip
              variant={presentation.variant}
              label={presentation.label}
              isCurrent={presentation.isCurrent}
              size="small"
            />
            {/* Suppressed, not substituted, while the stream is down (ADR 3). */}
            {isStreamConnected ? (
              <FreshnessLabel state={robot.freshness} asOf={robot.lastSeenAt} isCompact />
            ) : null}
            {isUnpositioned ? (
              <UnpositionedMark>—</UnpositionedMark>
            ) : null}
          </RobotRow>
        );
      })}
    </Stack>
  );
}
