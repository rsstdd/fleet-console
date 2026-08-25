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

const SECTION_SX = { p: 3 } as const;
const HEADING_SX = { mt: 1 } as const;
const DESCRIPTION_SX = { mt: 0.5, mb: 2 } as const;
const DIVIDER_SX = { borderColor: "var(--line)" } as const;
const STATE_ROW_DIRECTION = { xs: "column", sm: "row" } as const;
const TIMESTAMP_BRANCHES_SX = { mt: 3 } as const;
const STATE_DIVIDER = <Divider sx={DIVIDER_SX} />;

export function FreshnessLabelSection(): ReactElement {
  return (
    <Paper component="section" aria-labelledby="gallery-freshness-label-heading" sx={SECTION_SX}>
      <SectionLabel>02 — FreshnessLabel</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-freshness-label-heading" sx={HEADING_SX}>
        FreshnessLabel states
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={DESCRIPTION_SX}>
        Compact (table cell) beside full (detail / technician). The source time is required as a
        prop but nullable only for a registered robot that has never reported.
      </Typography>
      <Stack divider={STATE_DIVIDER} spacing={2}>
        {FRESHNESS_STATES.map((state) => {
          const row = FLEET_ROWS.find((sample) => sample.freshness === state);
          const asOf = row?.asOf ?? null;
          return (
            <Stack key={state} spacing={2} direction={STATE_ROW_DIRECTION} useFlexGap>
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
        sx={TIMESTAMP_BRANCHES_SX}
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
