import type { ReactNode } from "react";
import { Paper, Stack } from "@mui/material";

import type { Robot, RobotHealth } from "@/types/robot";
import {
  selectBatteryDisplay,
  selectPositionDisplay,
  selectStatusPresentation,
} from "@/utils/robotSelectors";
import { formatTimeUtc } from "@/utils/time";

import { Field, Section } from "./detailSection";

/**
 * Health as one string: severity, plus the vendor's prose when there is any.
 * A robot that has never reported has no health to state, and says so rather
 * than borrowing `nominal` from the severity vocabulary (Principle 4).
 */
function formatHealth(health: RobotHealth | null): string {
  if (health === null) {
    return "Not reported";
  }
  return health.description === undefined
    ? health.severity
    : `${health.severity} — ${health.description}`;
}

/** Core fields only. Capability payloads never appear here, and vice versa. */
export function SummarySection({ robot }: { readonly robot: Robot }): ReactNode {
  const presentation = selectStatusPresentation(robot);

  return (
    <Section index="01" title="Summary">
      <Paper sx={{ p: 3 }}>
        <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
          <Field label="Battery" value={selectBatteryDisplay(robot)} />
          <Field label="Position" value={selectPositionDisplay(robot)} />
          <Field label="Status" value={presentation.label} />
          {/*
            Health is its own field, not text appended to status: a degraded
            robot that is idle is two facts, and collapsing them loses one
            (spec §6).
          */}
          <Field label="Health" value={formatHealth(robot.health)} />
          <Field
            label="Connectivity"
            value={robot.connectivity === null ? "Not reported" : robot.connectivity}
          />
          <Field label="Last seen" value={formatTimeUtc(robot.lastSeenAt)} />
        </Stack>
      </Paper>
    </Section>
  );
}
