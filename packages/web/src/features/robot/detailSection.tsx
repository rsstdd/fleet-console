import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";

import { SectionLabel } from "@/components/sectionLabel";

import { MONO } from "./detailStyles";

/*
 * Hoisted to name the three row roles and avoid rebuilding their values in JSX.
 * `styled()` is not the alternative it looks like here:
 * a styled MUI component loses the `component` prop's polymorphic typing, and the `as`
 * prop emotion offers instead replaces the MUI component with a bare tag, dropping its
 * variant and surface styles.
 */
const ROW_SX = { justifyContent: "space-between" } as const;
const TERM_SX = { color: "text.secondary" } as const;
const VALUE_SX = { m: 0, ...MONO } as const;

/**
 * Keeps every detail label/value row semantic, including the capability-panel rows
 * `capabilityPanels.tsx` composes from it.
 */
export function Field({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactNode {
  return (
    <Stack direction="row" spacing={2} sx={ROW_SX}>
      <Typography variant="body2" component="dt" sx={TERM_SX}>
        {label}
      </Typography>
      <Typography variant="body2" component="dd" sx={VALUE_SX}>
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
