import type { ReactNode } from "react";
import { Link } from "react-router";
import { Stack, Typography } from "@mui/material";

import { FreshnessLabel } from "@/components/freshnessLabel";
import { StatusChip } from "@/components/statusChip";

import type { Robot } from "@/entities/robot/model";
import { selectStatusPresentation } from "@/entities/robot/selectors";

/**
 * One row per robot with the id link as the sole activation path
 * (page spec 04 § 2); the `unpositioned` group accounts for robots that never
 * reported (Principle 4). Composed only by `mapPage.tsx`.
 */
export function RobotList({
  robots,
  streamConnected,
  unpositioned = false,
}: {
  readonly robots: readonly Robot[];
  readonly streamConnected: boolean;
  readonly unpositioned?: boolean;
}): ReactNode {
  const listed = unpositioned ? robots : robots.filter((robot) => robot.position !== null);
  return (
    <Stack component="ul" spacing={1} sx={{ m: 0, p: 0, listStyle: "none" }}>
      {listed.map((robot) => {
        const presentation = selectStatusPresentation(robot);
        return (
          <Stack
            key={robot.id}
            component="li"
            direction="row"
            spacing={2}
            sx={{ alignItems: "center" }}
          >
            <Link
              to={`/robots/${robot.id}`}
              style={{
                fontFamily: "var(--font-mono)",
                fontVariantNumeric: "tabular-nums",
                color: "inherit",
                textDecoration: "none",
              }}
            >
              {robot.id}
            </Link>
            <StatusChip
              variant={presentation.variant}
              label={presentation.label}
              current={presentation.current}
              size="small"
            />
            {/* Suppressed, not substituted, while the stream is down (ADR 3). */}
            {streamConnected ? (
              <FreshnessLabel state={robot.freshness} asOf={robot.lastSeenAt} compact />
            ) : null}
            {unpositioned ? (
              <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
                —
              </Typography>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
}
