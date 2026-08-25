import { useState, type ReactElement } from "react";
import { Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";

import { EmptyState } from "@/components/emptyState";
import { SectionLabel } from "@/components/sectionLabel";

export function EmptyStateSection(): ReactElement {
  const [isFiltered, setIsFiltered] = useState(false);

  const handleApplyFilter = (): void => {
    setIsFiltered(true);
  };

  const handleClearFilter = (): void => {
    setIsFiltered(false);
  };

  return (
    <Paper component="section" aria-labelledby="gallery-empty-state-heading" sx={{ p: 3 }}>
      <SectionLabel>07 — EmptyState</SectionLabel>
      <Typography
        variant="h3"
        component="h2"
        id="gallery-empty-state-heading"
        sx={{ mt: 1, mb: 2 }}
      >
        EmptyState optional content
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
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
      <Divider sx={{ my: 3, borderColor: "var(--line)" }} />
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Box sx={{ flex: 1, border: "var(--border-width) solid var(--line)", borderRadius: 1 }}>
          <EmptyState title="Title only" />
        </Box>
        <Box sx={{ flex: 1, border: "var(--border-width) solid var(--line)", borderRadius: 1 }}>
          <EmptyState title="With description" description="Optional supporting copy." />
        </Box>
      </Stack>
    </Paper>
  );
}
