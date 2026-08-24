import { useEffect, useMemo, useState } from "react";
import {
  Box,
  CssBaseline,
  Stack,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";

import { type ConnectionState } from "@/components/connectionBanner";
import { type Persona } from "@/components/personaToggle";
import { type TenantTheme } from "@/config/tenantTheme";
import { applyTenantTheme, buildMuiTheme } from "@/app/theme";
import { TENANT } from "@/config/tenant";

import {
  ConnectionBannerSection,
  EmptyStateSection,
  PersonaToggleSection,
} from "./galleryInteractiveSections";
import {
  CombinedFleetTableSection,
  DataPlateSection,
  FreshnessLabelSection,
  PropsIndexSection,
  SectionLabelSection,
  StatSection,
  StatusChipSection,
} from "./galleryStaticSections";

/** Keeps comparison tables readable on wide displays; no product layout depends on it. */
const GALLERY_CONTENT_MAX_WIDTH = 1200;

/**
 * Dev-only gallery of the `components` primitives, mounted at /dev/ui and excluded
 * from production builds by an import.meta.env.DEV guard on the route (app-shell spec § 3).
 *
 * It is a preview of the design system, not the application. It keeps its own
 * ThemeProvider and tenant switch so the two tenant themes can be compared side by
 * side without changing the tenant the rest of the console is running as. All demo
 * state lives here; the section components render it and hand changes back up.
 */
export function ComponentGallery() {
  const [tenant, setTenant] = useState<TenantTheme>("dark");
  const [isFiltered, setIsFiltered] = useState(false);
  const [persona, setPersona] = useState<Persona>("operator");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connected");
  const [reconnectAttempt, setReconnectAttempt] = useState(1);
  const theme = useMemo(() => buildMuiTheme(tenant), [tenant]);

  const handleTenantChange = (_event: unknown, nextTenant: TenantTheme | null): void => {
    if (nextTenant !== null) setTenant(nextTenant);
  };

  const handlePersonaChange = (nextPersona: Persona): void => {
    setPersona(nextPersona);
  };

  const handleConnectionStateChange = (nextConnectionState: ConnectionState): void => {
    setConnectionState(nextConnectionState);
    if (nextConnectionState === "reconnecting") setReconnectAttempt(1);
  };

  const handleRetry = (): void => {
    setReconnectAttempt((attempt) => attempt + 1);
  };

  const handleFilteredChange = (nextIsFiltered: boolean): void => {
    setIsFiltered(nextIsFiltered);
  };

  // Synchronizes an external DOM boundary React does not own — the `data-theme`
  // attribute on `documentElement`, which the token layer switches on — with this
  // gallery's local tenant selection. Cleanup restores the deployment's own theme:
  // the gallery is mounted inside the running console, so an attribute left switched
  // would repaint every other route in whichever tenant was last previewed here.
  useEffect(() => {
    applyTenantTheme(tenant);
    return () => {
      applyTenantTheme(TENANT.theme);
    };
  }, [tenant]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          color: "text.primary",
          px: { xs: 2, md: 4 },
          py: 4,
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ mb: 4, alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography
              variant="overline"
              sx={{ color: "primary.main", display: "block", mb: 0.5 }}
            >
              components
            </Typography>
            <Typography variant="h1" component="h1">
              Component demo
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              ConnectionBanner · DataPlate · EmptyState · FreshnessLabel · PersonaToggle ·
              SectionLabel · Stat · StatusChip
            </Typography>
          </Box>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={tenant}
            onChange={handleTenantChange}
            aria-label="Tenant theme"
          >
            <ToggleButton value="dark">Tenant A · dark</ToggleButton>
            <ToggleButton value="light">Tenant B · light</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack spacing={3} sx={{ maxWidth: GALLERY_CONTENT_MAX_WIDTH }}>
          <PropsIndexSection />
          <StatusChipSection />
          <FreshnessLabelSection />
          <StatSection />
          <PersonaToggleSection persona={persona} onPersonaChange={handlePersonaChange} />
          <ConnectionBannerSection
            connectionState={connectionState}
            reconnectAttempt={reconnectAttempt}
            onStateChange={handleConnectionStateChange}
            onRetry={handleRetry}
          />
          <CombinedFleetTableSection />
          <EmptyStateSection isFiltered={isFiltered} onFilteredChange={handleFilteredChange} />
          <DataPlateSection />
          <SectionLabelSection />

          <Typography variant="caption" color="text.disabled">
            Tokens only · no hex · freshness never uses --accent · asOf is a required prop and is
            null only for a robot that has never reported · status has six variants, matched to what
            the canonical model can actually produce · PersonaToggle never uses a filled accent
            selected state.
          </Typography>
        </Stack>
      </Box>
    </ThemeProvider>
  );
}
