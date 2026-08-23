import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";

import { Stat } from "@/components/stat";

import type { FreshnessSummary } from "@/utils/robotSelectors";

/**
 * The fleet-wide freshness strip. The counts stay on screen during an outage
 * because a frozen tally is still operationally useful — but only under a
 * heading that says what it is. One shared qualification for the whole group,
 * from the same connection fact that suppresses the row labels below (ADR 23);
 * a per-metric tag would imply the four numbers can differ in currency, and a
 * client-derived "as of" timestamp would be invented provenance (Principle 4).
 * No aria-live: the shell banner already announces the outage, and a second
 * announcement of the same event is noise, not access.
 */
export function FleetSummary({
  streamConnected,
  summary,
  total,
}: {
  readonly streamConnected: boolean;
  readonly summary: FreshnessSummary;
  readonly total: number;
}): ReactNode {
  return (
    <Box component="section" aria-labelledby="fleet-summary-heading" sx={{ mb: 3 }}>
      <Typography id="fleet-summary-heading" variant="h2" component="h2" sx={{ mb: 2 }}>
        {streamConnected ? "Fleet reporting status" : "Fleet reporting status · last known"}
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Stat label="Live" value={summary.live} hint={`of ${String(total)}`} />
        <Stat
          label="Stale"
          value={summary.stale}
          tone={summary.stale > 0 ? "warning" : "default"}
        />
        <Stat
          label="Unreachable"
          value={summary.unreachable}
          tone={summary.unreachable > 0 ? "critical" : "default"}
        />
        <Stat label="Unknown" value={summary.unknown} />
      </Stack>
    </Box>
  );
}
