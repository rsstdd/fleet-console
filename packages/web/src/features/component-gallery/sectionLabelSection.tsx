import type { ReactElement } from "react";
import { Paper, Typography } from "@mui/material";

import { SectionLabel } from "@/components/sectionLabel";

const SECTION_SX = { p: 3 } as const;
const HEADING_SX = { mt: 1 } as const;
const DESCRIPTION_SX = { mt: 0.5, mb: 2 } as const;

export function SectionLabelSection(): ReactElement {
  return (
    <Paper component="section" aria-labelledby="gallery-section-label-heading" sx={SECTION_SX}>
      <SectionLabel>09 — SectionLabel</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-section-label-heading" sx={HEADING_SX}>
        SectionLabel composition
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={DESCRIPTION_SX}>
        This is a visual index, never a heading. The caller supplies the real heading immediately
        after it.
      </Typography>
      <SectionLabel className="gallery-section-label">03 — Capabilities</SectionLabel>
      <Typography variant="h3" component="h3" sx={HEADING_SX}>
        Capabilities
      </Typography>
    </Paper>
  );
}
