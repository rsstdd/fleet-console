import type { ReactElement } from "react";
import { Paper, Stack, Typography } from "@mui/material";

import { SectionLabel } from "@/components/sectionLabel";
import { Stat } from "@/components/stat";

export function StatSection(): ReactElement {
  return (
    <Paper component="section" aria-labelledby="gallery-stat-heading" sx={{ p: 3 }}>
      <SectionLabel>03 — Stat</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-stat-heading" sx={{ mt: 1 }}>
        Stat tones and values
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Freshness counts only — mutually exclusive, totalling the fleet. Status distribution belongs
        in the table and its filters, not duplicated here as a second set of counts.
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Stat label="Live" value={44} hint="of 50" />
        <Stat label="Stale" value={4} tone="warning" />
        <Stat label="Unreachable" value={2} tone="critical" />
        <Stat label="Unknown" value={0} />
        <Stat label="String value" value="—" tone="default" />
      </Stack>
    </Paper>
  );
}
