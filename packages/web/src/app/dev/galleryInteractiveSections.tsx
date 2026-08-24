import type { ReactNode } from "react";
import {
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import { ConnectionBanner, type ConnectionState } from "@/components/connectionBanner";
import { EmptyState } from "@/components/emptyState";
import { PersonaToggle, type Persona } from "@/components/personaToggle";
import { SectionLabel } from "@/components/sectionLabel";

/**
 * Puts the persona toggle under the tenant switch in the gallery header: the same MUI
 * component with a deliberately different selected-state treatment, which is only
 * checkable with both on screen at once (component spec 08 §6).
 */
export function PersonaToggleSection({
  persona,
  onPersonaChange,
}: {
  readonly persona: Persona;
  readonly onPersonaChange: (next: Persona) => void;
}): ReactNode {
  const handleDisabledPersonaChange = (): void => {};

  return (
    <Paper sx={{ p: 3 }}>
      <SectionLabel>04 — PersonaToggle</SectionLabel>
      <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
        PersonaToggle states
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Compare the selected-state treatment here against the tenant switch above: same underlying
        MUI component, deliberately different appearance. The global theme gives{" "}
        <Box component="code" sx={{ fontFamily: "var(--font-mono)" }}>
          .Mui-selected
        </Box>{" "}
        a filled accent background — correct for the tenant switch, wrong for persona, which is
        identity rather than a primary action. PersonaToggle styles its own buttons with{" "}
        <code>styled()</code>, which composes after the theme and renders a subtle outline instead.
      </Typography>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <PersonaToggle value={persona} onChange={onPersonaChange} />
          <Typography variant="body2" color="text.secondary">
            Selected: {persona}
          </Typography>
        </Stack>

        <Box
          sx={{
            p: 2,
            border: "var(--border-width) solid var(--line)",
            borderRadius: "var(--radius)",
          }}
        >
          {persona === "operator" ? (
            <Typography variant="body2">
              Operator view: summary block plus declared-capability panels only.
            </Typography>
          ) : (
            <Typography variant="body2">
              Technician view: adds diagnostics and the raw payload, additive to the operator
              content — not a second layout.
            </Typography>
          )}
        </Box>

        <Typography variant="overline" sx={{ color: "text.disabled" }}>
          Disabled state
        </Typography>
        <PersonaToggle value="operator" onChange={handleDisabledPersonaChange} isDisabled />
      </Stack>
    </Paper>
  );
}

/**
 * Drives the banner through every state with a live retry. Two of its guarantees are
 * invisible in a static render — the connected state's mounted-but-empty live region,
 * and an attempt counter that actually counts — and both are what ADR 23 leans on.
 */
export function ConnectionBannerSection({
  connectionState,
  reconnectAttempt,
  onStateChange,
  onRetry,
}: {
  readonly connectionState: ConnectionState;
  readonly reconnectAttempt: number;
  readonly onStateChange: (next: ConnectionState) => void;
  readonly onRetry: () => void;
}): ReactNode {
  const handleConnectionStateChange = (
    _event: unknown,
    nextState: ConnectionState | null,
  ): void => {
    if (nextState !== null) onStateChange(nextState);
  };

  return (
    <Paper sx={{ p: 3 }} data-testid="connection-banner-gallery">
      <SectionLabel>05 — ConnectionBanner</SectionLabel>
      <Typography variant="h3" component="h2" sx={{ mt: 1 }}>
        ConnectionBanner states and retry
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        The live region remains mounted while connected. Reconnecting shows attempt and last event
        metadata; retry increments the visible attempt. Disconnected uses fixed last-known copy.
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={connectionState}
        onChange={handleConnectionStateChange}
        aria-label="Connection banner state"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="connecting">Connecting</ToggleButton>
        <ToggleButton value="connected">Connected</ToggleButton>
        <ToggleButton value="reconnecting">Reconnecting</ToggleButton>
        <ToggleButton value="disconnected">Disconnected</ToggleButton>
      </ToggleButtonGroup>
      <ConnectionBanner
        state={connectionState}
        attempt={connectionState === "reconnecting" ? reconnectAttempt : undefined}
        lastEventAt={connectionState === "reconnecting" ? "2026-08-19T09:41:02.000Z" : undefined}
        onRetry={connectionState === "connected" ? undefined : onRetry}
      />
    </Paper>
  );
}

/**
 * Reaches the filtered empty state through a real filter rather than a prop, because the
 * state that matters is the one an operator can undo, and shows the title-only and
 * with-description forms beside it.
 */
export function EmptyStateSection({
  isFiltered,
  onFilteredChange,
}: {
  readonly isFiltered: boolean;
  readonly onFilteredChange: (nextIsFiltered: boolean) => void;
}): ReactNode {
  const handleApplyFilter = (): void => {
    onFilteredChange(true);
  };

  const handleClearFilter = (): void => {
    onFilteredChange(false);
  };

  return (
    <Paper sx={{ p: 3 }}>
      <SectionLabel>07 — EmptyState</SectionLabel>
      <Typography variant="h3" component="h2" sx={{ mt: 1, mb: 2 }}>
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
      <StaticEmptyStateForms />
    </Paper>
  );
}

function StaticEmptyStateForms(): ReactNode {
  return (
    <>
      <Divider sx={{ my: 3, borderColor: "var(--line)" }} />
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Box sx={{ flex: 1, border: "var(--border-width) solid var(--line)", borderRadius: 1 }}>
          <EmptyState title="Title only" />
        </Box>
        <Box sx={{ flex: 1, border: "var(--border-width) solid var(--line)", borderRadius: 1 }}>
          <EmptyState title="With description" description="Optional supporting copy." />
        </Box>
      </Stack>
    </>
  );
}
