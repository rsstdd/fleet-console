import { useState, type ReactElement } from "react";
import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";

import { EmptyState } from "@/components/emptyState";
import { SectionLabel } from "@/components/sectionLabel";

const SECTION_SX = { p: 3 } as const;
const HEADING_SX = { mt: 1, mb: 2 } as const;
const FILTER_CONTROLS_SX = { mb: 2 } as const;
const DIVIDER_SX = { my: 3, borderColor: "var(--line)" } as const;
const EXAMPLES_DIRECTION = { xs: "column", md: "row" } as const;
const EXAMPLE_SX = {
  flex: 1,
  border: "var(--border-width) solid var(--line)",
  borderRadius: 1,
} as const;

export function EmptyStateSection(): ReactElement {
  const [isFiltered, setIsFiltered] = useState(false);

  const handleApplyFilter = (): void => {
    setIsFiltered(true);
  };

  const handleClearFilter = (): void => {
    setIsFiltered(false);
  };

  return (
    <Paper component="section" aria-labelledby="gallery-empty-state-heading" sx={SECTION_SX}>
      <SectionLabel>07 — EmptyState</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-empty-state-heading" sx={HEADING_SX}>
        EmptyState optional content
      </Typography>
      <Stack direction="row" spacing={2} sx={FILTER_CONTROLS_SX}>
        <Button
          size="small"
          variant={isFiltered ? "contained" : "outlined"}
          onClick={handleApplyFilter}
        >
          Apply an impossible filter
        </Button>
        <Button
          size="small"
          variant={!isFiltered ? "contained" : "outlined"}
          onClick={handleClearFilter}
        >
          Clear
        </Button>
      </Stack>
      {isFiltered ? (
        <EmptyState
          title="No robots match these filters"
          description="Clear filters or change site."
          action={
            <Button size="small" variant="outlined" onClick={handleClearFilter}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <Typography variant="body2" color="text.secondary">
          (Filters currently match all rows — nothing to show here.)
        </Typography>
      )}
      <Divider sx={DIVIDER_SX} />
      <Stack direction={EXAMPLES_DIRECTION} spacing={2}>
        <Box sx={EXAMPLE_SX}>
          <EmptyState title="Title only" />
        </Box>
        <Box sx={EXAMPLE_SX}>
          <EmptyState title="With description" description="Optional supporting copy." />
        </Box>
      </Stack>
    </Paper>
  );
}
