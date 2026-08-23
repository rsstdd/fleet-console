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

import { type ConnectionState } from "@/shared/ui/connectionBanner";
import { type Persona } from "@/shared/ui/personaToggle";
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

/**
 * Dev-only gallery of the `shared/ui` primitives, mounted at /dev/ui and excluded
 * from production builds by an import.meta.env.DEV guard on the route (app-shell spec § 3).
 *
 * It is a preview of the design system, not the application. It keeps its own
 * ThemeProvider and tenant switch so the two tenant themes can be compared side by
 * side without changing the tenant the rest of the console is running as. All demo
 * state lives here; the section components render it and hand changes back up.
 */
export function ComponentGallery() {
  const [tenant, setTenant] = useState<TenantTheme>("dark");
  const [filtered, setFiltered] = useState(false);
  const [persona, setPersona] = useState<Persona>("operator");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connected");
  const [reconnectAttempt, setReconnectAttempt] = useState(1);
  const theme = useMemo(() => buildMuiTheme(tenant), [tenant]);

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
              shared/ui
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
            onChange={(_, next: TenantTheme | null) => {
              if (next) setTenant(next);
            }}
            aria-label="Tenant theme"
          >
            <ToggleButton value="dark">Tenant A · dark</ToggleButton>
            <ToggleButton value="light">Tenant B · light</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack spacing={3} sx={{ maxWidth: 1200 }}>
          <PropsIndexSection />
          <StatusChipSection />
          <FreshnessLabelSection />
          <StatSection />
          <PersonaToggleSection persona={persona} onPersonaChange={setPersona} />
          <ConnectionBannerSection
            connectionState={connectionState}
            reconnectAttempt={reconnectAttempt}
            onStateChange={(next) => {
              setConnectionState(next);
              if (next === "reconnecting") setReconnectAttempt(1);
            }}
            onRetry={() => {
              setReconnectAttempt((attempt) => attempt + 1);
            }}
          />
          <CombinedFleetTableSection />
          <EmptyStateSection filtered={filtered} onFilteredChange={setFiltered} />
          <DataPlateSection />
          <SectionLabelSection />

          <Typography variant="caption" color="text.disabled">
            Tokens only · no hex · freshness never uses --accent · asOf is required · status has six
            variants, matched to what the canonical model can actually produce · PersonaToggle never
            uses a filled accent selected state.
          </Typography>
        </Stack>
      </Box>
    </ThemeProvider>
  );
}
