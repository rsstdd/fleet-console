import type { ReactElement } from "react";
import { Box, Container, Stack, Typography } from "@mui/material";
import { NavLink, Outlet } from "react-router";

import { TenantConfigContext } from "@/app/tenantConfigContext";
import { TENANT } from "@/config/tenant";
import { ConnectionContext } from "@/shared/lib/connectionContext";
import {
  ConnectionBanner,
  type ConnectionBannerProps,
  type ConnectionState,
} from "@/shared/ui/connectionBanner";

/** Connection snapshot displayed by the shell without owning transport policy. */
export interface AppShellProps {
  /**
   * The stream's connection state, published to the features through
   * `ConnectionContext` as well as rendered in the banner (ADR 23).
   *
   * Defaults to `disconnected`, not `connected`. Until a transport client exists nothing
   * supplies this prop, and an optimistic default would make every row assert a currency
   * no socket is delivering — the defect `packages/README.md` recorded against the old
   * default. Failing closed shows the banner and suppresses the labels instead.
   */
  readonly connectionState?: ConnectionState;
  readonly lastEventAt?: ConnectionBannerProps["lastEventAt"];
  readonly attempt?: number;
  /** Why retrying stopped, forwarded to the banner's terminal copy (ADR 31). */
  readonly terminalCause?: ConnectionBannerProps["terminalCause"];
  readonly onRetry?: () => void;
}

const CONNECTION_LABEL: Readonly<Record<ConnectionState, string>> = {
  connecting: "Stream connecting",
  connected: "Stream connected",
  reconnecting: "Stream reconnecting",
  disconnected: "Stream disconnected",
};

const CONNECTION_COLOR: Readonly<Record<ConnectionState, string>> = {
  connecting: "var(--warning)",
  connected: "var(--success)",
  reconnecting: "var(--warning)",
  disconnected: "var(--error)",
};

/**
 * Renders the operational frame around every route and reflects connection state
 * supplied by the app transport boundary without subscribing to robot telemetry.
 *
 * Also the single provider of `ConnectionContext`, which is how the routes below `Outlet`
 * learn the same fact this shell renders in its banner. They cannot import it from here —
 * `features` may not import `app` (ADR 4) — so `shared/lib` carries it instead (ADR 23).
 */
export function AppShell({
  connectionState = "disconnected",
  lastEventAt,
  attempt,
  terminalCause,
  onRetry,
}: AppShellProps): ReactElement {
  return (
    <TenantConfigContext.Provider value={TENANT}>
      <ConnectionContext.Provider value={connectionState}>
        <Box sx={{ minHeight: "100vh", bgcolor: "background.default", color: "text.primary" }}>
          {/* First focusable control, per 01_APP_SHELL.md section 2. Visible on focus only. */}
          <Box
            component="a"
            href="#main"
            sx={{
              position: "absolute",
              left: -9999,
              top: 0,
              zIndex: 10,
              p: 2,
              bgcolor: "background.paper",
              color: "text.primary",
              "&:focus": { left: 0 },
            }}
          >
            Skip to main content
          </Box>

          <Box
            component="header"
            sx={{
              position: "sticky",
              top: 0,
              zIndex: 5,
              bgcolor: "var(--header-bg)",
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            <Container maxWidth="xl" sx={{ py: 2 }}>
              <Stack
                direction="row"
                spacing={3}
                sx={{ alignItems: "center", justifyContent: "space-between" }}
              >
                <Typography
                  component={NavLink}
                  to="/"
                  variant="overline"
                  sx={{ color: "primary.main", textDecoration: "none" }}
                >
                  {TENANT.wordmark}
                </Typography>
                <Stack
                  component="nav"
                  aria-label="Primary"
                  direction="row"
                  spacing={3}
                  sx={{ alignItems: "center" }}
                >
                  <Typography
                    component={NavLink}
                    to="/"
                    end
                    sx={{ color: "text.primary", textDecoration: "none" }}
                  >
                    Fleet
                  </Typography>
                  {/* The second primary destination (app-shell spec § 2 revision 5, page spec 04). */}
                  <Typography
                    component={NavLink}
                    to="/map"
                    sx={{ color: "text.primary", textDecoration: "none" }}
                  >
                    Map
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ color: CONNECTION_COLOR[connectionState], whiteSpace: "nowrap" }}
                  >
                    {CONNECTION_LABEL[connectionState]}
                  </Typography>
                </Stack>
              </Stack>
            </Container>
          </Box>

          <Container maxWidth="xl">
            <ConnectionBanner
              state={connectionState}
              lastEventAt={lastEventAt}
              attempt={attempt}
              terminalCause={terminalCause}
              onRetry={onRetry}
            />
          </Container>

          <Container component="main" id="main" tabIndex={-1} maxWidth="xl" sx={{ py: 4 }}>
            <Outlet />
          </Container>
        </Box>
      </ConnectionContext.Provider>
    </TenantConfigContext.Provider>
  );
}
