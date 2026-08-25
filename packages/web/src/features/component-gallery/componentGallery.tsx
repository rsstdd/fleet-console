import { useMemo, useState, type MouseEvent, type ReactElement } from "react";
import {
  Box,
  Stack,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { Theme } from "@mui/material/styles";

import type { TenantTheme } from "@/config/tenantTheme";

import { CombinedFleetTableSection } from "./combinedFleetTableSection";
import { ConnectionBannerSection } from "./connectionBannerSection";
import { DataPlateSection } from "./dataPlateSection";
import { EmptyStateSection } from "./emptyStateSection";
import { FreshnessLabelSection } from "./freshnessLabelSection";
import { PersonaToggleSection } from "./personaToggleSection";
import { PropsIndexSection } from "./propsIndexSection";
import { SectionLabelSection } from "./sectionLabelSection";
import { StatSection } from "./statSection";
import { StatusChipSection } from "./statusChipSection";

interface ComponentGalleryProps {
  readonly buildTheme: (mode: TenantTheme) => Theme;
}

function isTenantTheme(value: unknown): value is TenantTheme {
  return value === "dark" || value === "light";
}

export function ComponentGallery({ buildTheme }: ComponentGalleryProps): ReactElement {
  const [tenant, setTenant] = useState<TenantTheme>("dark");
  const theme = useMemo(() => buildTheme(tenant), [buildTheme, tenant]);

  const handleTenantChange = (_event: MouseEvent<HTMLElement>, nextTenant: unknown): void => {
    if (isTenantTheme(nextTenant)) {
      setTenant(nextTenant);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Box
        component="article"
        aria-labelledby="component-gallery-heading"
        data-theme={tenant}
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
            <Typography variant="h1" component="h1" id="component-gallery-heading">
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

        <Stack spacing={3} sx={{ maxWidth: "var(--gallery-content-max-width)", minWidth: 0 }}>
          <PropsIndexSection />
          <StatusChipSection />
          <FreshnessLabelSection />
          <StatSection />
          <PersonaToggleSection />
          <ConnectionBannerSection />
          <CombinedFleetTableSection />
          <EmptyStateSection />
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
