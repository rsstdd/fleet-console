import type { ReactElement } from "react";
import { Paper, Stack, Typography } from "@mui/material";

import { SectionLabel } from "@/components/sectionLabel";
import { StatusChip } from "@/components/statusChip";

import { STATUS_VARIANTS } from "./galleryFixtures";

export function StatusChipSection(): ReactElement {
  return (
    <Paper component="section" aria-labelledby="gallery-status-chip-heading" sx={{ p: 3 }}>
      <SectionLabel>01 — StatusChip</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-status-chip-heading" sx={{ mt: 1 }}>
        StatusChip variants
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Five map to the canonical status enum; degraded maps to health severity. There is no seventh
        variant — no token exists for a state no adapter can produce.
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
        {STATUS_VARIANTS.map(({ variant, label }) => (
          <StatusChip key={variant} variant={variant} label={label} isCurrent />
        ))}
      </Stack>

      <Stack component="section" aria-labelledby="gallery-status-currency-heading">
        <Typography variant="h3" component="h3" id="gallery-status-currency-heading" sx={{ mt: 3 }}>
          Current vs. last known
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          Same variant, rendered twice. Filled and solid means current. Outline and hollow means the
          robot stopped reporting and this is the last thing it said — the caller supplies the
          wording.
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap>
          <StatusChip variant="active" label="Busy" isCurrent />
          <StatusChip variant="active" label="Busy (last known)" isCurrent={false} />
        </Stack>
      </Stack>

      <Stack component="section" aria-labelledby="gallery-status-sizes-heading">
        <Typography variant="h3" component="h3" id="gallery-status-sizes-heading" sx={{ mt: 3 }}>
          Sizes
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          The default medium size is for general surfaces; small is the table-density variant.
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center" }}>
          <StatusChip variant="neutral" label="Medium" isCurrent size="medium" />
          <StatusChip variant="neutral" label="Small" isCurrent size="small" />
        </Stack>
      </Stack>
    </Paper>
  );
}
