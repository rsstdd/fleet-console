import type { ReactElement } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";

import { DataPlate } from "@/components/dataPlate";
import { SectionLabel } from "@/components/sectionLabel";
import { formatTimeUtc } from "@/utils/time";

import { GALLERY_LAST_EVENT_AT_ISO } from "./galleryFixtures";

export function DataPlateSection(): ReactElement {
  return (
    <Paper component="section" aria-labelledby="gallery-data-plate-heading" sx={{ p: 3 }}>
      <SectionLabel>08 — DataPlate</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-data-plate-heading" sx={{ mt: 1 }}>
        DataPlate semantic elements
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        The same metadata treatment supports its default div, a page footer, or a figure caption.
        Children may contain any React content.
      </Typography>
      <Stack spacing={2}>
        <DataPlate>Default div · fleet snapshot · source: fleet-api</DataPlate>
        <DataPlate as="footer">
          Footer · generated at {formatTimeUtc(GALLERY_LAST_EVENT_AT_ISO)}
        </DataPlate>
        <Box component="figure" sx={{ m: 0 }}>
          <DataPlate as="figcaption">Figcaption · telemetry history · UTC</DataPlate>
        </Box>
      </Stack>
    </Paper>
  );
}
