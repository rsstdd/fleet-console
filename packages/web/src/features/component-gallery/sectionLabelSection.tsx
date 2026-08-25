import type { ReactElement } from "react";
import { Paper, Typography } from "@mui/material";

import { SectionLabel } from "@/components/sectionLabel";

export function SectionLabelSection(): ReactElement {
  return (
    <Paper component="section" aria-labelledby="gallery-section-label-heading" sx={{ p: 3 }}>
      <SectionLabel>09 — SectionLabel</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-section-label-heading" sx={{ mt: 1 }}>
        SectionLabel composition
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        This is a visual index, never a heading. The caller supplies the real heading immediately
        after it.
      </Typography>
      <SectionLabel className="gallery-section-label">03 — Capabilities</SectionLabel>
      <Typography variant="h3" component="h3" sx={{ mt: 1 }}>
        Capabilities
      </Typography>
    </Paper>
  );
}
