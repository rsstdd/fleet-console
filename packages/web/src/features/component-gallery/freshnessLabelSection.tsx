import type { ReactElement } from "react";
import { Box, Divider, Paper, Stack, Typography, styled } from "@mui/material";

import { FreshnessLabel } from "@/components/freshnessLabel";
import { SectionLabel } from "@/components/sectionLabel";

import {
  FLEET_ROWS,
  FRESHNESS_STATES,
  GALLERY_LAST_EVENT_AT_ISO,
  GALLERY_SOURCE_AT_ISO,
} from "./galleryFixtures";

const StateLabel = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.disabled,
  minWidth: theme.spacing(14),
}));

export function FreshnessLabelSection(): ReactElement {
  return (
    <Paper component="section" aria-labelledby="gallery-freshness-label-heading" sx={{ p: 3 }}>
      <SectionLabel>02 — FreshnessLabel</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-freshness-label-heading" sx={{ mt: 1 }}>
        FreshnessLabel states
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Compact (table cell) beside full (detail / technician). The source time is required as a
        prop but nullable only for a registered robot that has never reported.
      </Typography>
      <Stack divider={<Divider sx={{ borderColor: "var(--line)" }} />} spacing={2}>
        {FRESHNESS_STATES.map((state) => {
          const row = FLEET_ROWS.find((sample) => sample.freshness === state);
          const asOf = row?.asOf ?? null;
          return (
            <Stack key={state} spacing={2} direction={{ xs: "column", sm: "row" }} useFlexGap>
              <StateLabel variant="overline">{state}</StateLabel>
              <FreshnessLabel state={state} asOf={asOf} isCompact />
              <FreshnessLabel state={state} asOf={asOf} />
            </Stack>
          );
        })}
      </Stack>
      <Stack
        component="section"
        aria-labelledby="gallery-timestamp-branches-heading"
        spacing={2}
        sx={{ mt: 3 }}
      >
        <Typography variant="h3" component="h3" id="gallery-timestamp-branches-heading">
          Timestamp branches
        </Typography>
        <Box component="section" aria-label="Never observed example">
          <FreshnessLabel state="unknown" asOf={null} />
        </Box>
        <Box component="section" aria-label="Receipt time example">
          <FreshnessLabel
            state="live"
            asOf={GALLERY_SOURCE_AT_ISO}
            receivedAt={GALLERY_LAST_EVENT_AT_ISO}
          />
        </Box>
      </Stack>
    </Paper>
  );
}
