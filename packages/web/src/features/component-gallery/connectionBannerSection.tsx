import { useState, type MouseEvent, type ReactElement } from "react";
import { Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

import {
  ConnectionBanner,
  type ConnectionBannerProps,
  type ConnectionState,
  type ConnectionTerminalCause,
} from "@/components/connectionBanner";
import { SectionLabel } from "@/components/sectionLabel";

import { GALLERY_LAST_EVENT_AT_ISO } from "./galleryFixtures";

type TerminalCauseSelection = ConnectionTerminalCause | "default";

const RESPONSIVE_TOGGLE_GROUP_SX = {
  alignItems: "stretch",
  flexDirection: { xs: "column", sm: "row" },
} as const;

function isConnectionState(value: unknown): value is ConnectionState {
  return (
    value === "connecting" ||
    value === "connected" ||
    value === "reconnecting" ||
    value === "disconnected"
  );
}

function isTerminalCauseSelection(value: unknown): value is TerminalCauseSelection {
  return (
    value === "default" ||
    value === "handshake-exhausted" ||
    value === "contract" ||
    value === "session-mismatch"
  );
}

export function ConnectionBannerSection(): ReactElement {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connected");
  const [reconnectAttempt, setReconnectAttempt] = useState(1);
  const [terminalCause, setTerminalCause] = useState<ConnectionTerminalCause | null>(null);

  const handleConnectionStateChange = (
    _event: MouseEvent<HTMLElement>,
    nextState: unknown,
  ): void => {
    if (isConnectionState(nextState)) {
      setConnectionState(nextState);
      if (nextState === "reconnecting") {
        setReconnectAttempt(1);
      }
    }
  };

  const handleTerminalCauseChange = (_event: MouseEvent<HTMLElement>, nextCause: unknown): void => {
    if (isTerminalCauseSelection(nextCause)) {
      setTerminalCause(nextCause === "default" ? null : nextCause);
    }
  };

  const handleRetry = (): void => {
    setReconnectAttempt((attempt) => attempt + 1);
  };

  const connectionBannerProps = {
    state: connectionState,
    ...(connectionState === "reconnecting"
      ? { attempt: reconnectAttempt, lastEventAt: GALLERY_LAST_EVENT_AT_ISO }
      : {}),
    ...(connectionState === "disconnected" ? { terminalCause } : {}),
    ...(connectionState === "connected" ? {} : { onRetry: handleRetry }),
  } satisfies ConnectionBannerProps;

  return (
    <Paper component="section" aria-labelledby="gallery-connection-banner-heading" sx={{ p: 3 }}>
      <SectionLabel>05 — ConnectionBanner</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-connection-banner-heading" sx={{ mt: 1 }}>
        ConnectionBanner states and retry
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        The live region remains mounted while connected. Reconnecting shows attempt and last event
        metadata; retry increments the visible attempt. Disconnected demonstrates every terminal
        cause.
      </Typography>
      <Stack spacing={2} sx={{ mb: 2 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={connectionState}
          onChange={handleConnectionStateChange}
          aria-label="Connection banner state"
          sx={RESPONSIVE_TOGGLE_GROUP_SX}
        >
          <ToggleButton value="connecting">Connecting</ToggleButton>
          <ToggleButton value="connected">Connected</ToggleButton>
          <ToggleButton value="reconnecting">Reconnecting</ToggleButton>
          <ToggleButton value="disconnected">Disconnected</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={terminalCause ?? "default"}
          onChange={handleTerminalCauseChange}
          aria-label="Terminal cause"
          disabled={connectionState !== "disconnected"}
          sx={RESPONSIVE_TOGGLE_GROUP_SX}
        >
          <ToggleButton value="default">Default</ToggleButton>
          <ToggleButton value="handshake-exhausted">Handshake exhausted</ToggleButton>
          <ToggleButton value="contract">Contract error</ToggleButton>
          <ToggleButton value="session-mismatch">Session mismatch</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <ConnectionBanner {...connectionBannerProps} />
    </Paper>
  );
}
