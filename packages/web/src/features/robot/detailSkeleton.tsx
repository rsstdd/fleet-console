import type { ReactNode } from "react";
import { Box, Skeleton, Typography } from "@mui/material";

/**
 * Header skeleton for the first load. Deliberately not an empty Summary: a
 * Summary rendered with placeholder values and then repopulated shows the
 * operator numbers that were never true (spec §10).
 */
export function DetailSkeleton(): ReactNode {
  return (
    <Box aria-busy="true" aria-live="polite">
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Loading robot…
      </Typography>
      <Skeleton variant="text" width="40%" height="var(--skeleton-line-height)" />
      <Skeleton variant="text" width="60%" />
    </Box>
  );
}
