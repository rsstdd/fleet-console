import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";

import { SectionLabel } from "@/shared/ui/sectionLabel";

/** Monospace tabular styling shared by the identity heading, field values, and the raw-payload block. */
export const MONO = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
} as const;

/** One labelled value in a definition list. */
export function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactNode {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
      <Typography variant="body2" component="dt" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="body2" component="dd" sx={{ m: 0, ...MONO }}>
        {value}
      </Typography>
    </Stack>
  );
}

/**
 * Section index plus the real `h2` it introduces. `SectionLabel` is not a
 * heading (component spec 03), so every section pairs the two and the page
 * has a heading outline rather than one `h1` and four decorative strings
 * (spec §9, Principle 6).
 */
export function Section({
  index,
  title,
  children,
}: {
  readonly index: string;
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  const id = `section-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <Box component="section" aria-labelledby={id} sx={{ mt: 4 }}>
      <SectionLabel>
        {index} — {title}
      </SectionLabel>
      <Typography id={id} variant="h2" component="h2" sx={{ mt: 1, mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}
