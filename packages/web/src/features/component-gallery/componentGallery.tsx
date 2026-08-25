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

import { TENANT_THEME_PREVIEWS, type TenantThemePreview } from "@/config/tenant";
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

const GALLERY_SX = {
  minHeight: "100vh",
  bgcolor: "background.default",
  color: "text.primary",
  px: { xs: 2, md: 4 },
  py: 4,
} as const;

const GALLERY_HEADER_DIRECTION = { xs: "column", sm: "row" } as const;
const GALLERY_HEADER_SX = {
  mb: 4,
  alignItems: { sm: "center" },
  justifyContent: "space-between",
} as const;
const COMPONENTS_LABEL_SX = { color: "primary.main", display: "block", mb: 0.5 } as const;
const INTRODUCTION_SX = { mt: 1 } as const;
const GALLERY_CONTENT_SX = {
  maxWidth: "var(--gallery-content-max-width)",
  minWidth: 0,
} as const;

export function ComponentGallery({ buildTheme }: ComponentGalleryProps): ReactElement {
  const [tenantPreview, setTenantPreview] = useState<TenantThemePreview>(TENANT_THEME_PREVIEWS[0]);
  const theme = useMemo(() => buildTheme(tenantPreview.mode), [buildTheme, tenantPreview.mode]);

  const handleTenantChange = (_event: MouseEvent<HTMLElement>, nextMode: unknown): void => {
    const nextPreview = TENANT_THEME_PREVIEWS.find(({ mode }) => mode === nextMode);
    if (nextPreview) {
      setTenantPreview(nextPreview);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <Box
        component="article"
        aria-labelledby="component-gallery-heading"
        data-theme={tenantPreview.mode}
        sx={GALLERY_SX}
      >
        <Stack direction={GALLERY_HEADER_DIRECTION} spacing={2} sx={GALLERY_HEADER_SX}>
          <Box>
            <Typography variant="overline" sx={COMPONENTS_LABEL_SX}>
              components
            </Typography>
            <Typography variant="h1" component="h1" id="component-gallery-heading">
              Component demo
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={INTRODUCTION_SX}>
              ConnectionBanner · DataPlate · EmptyState · FreshnessLabel · PersonaToggle ·
              SectionLabel · Stat · StatusChip
            </Typography>
          </Box>

          <ToggleButtonGroup
            exclusive
            size="small"
            value={tenantPreview.mode}
            onChange={handleTenantChange}
            aria-label="Tenant theme"
          >
            {TENANT_THEME_PREVIEWS.map(({ mode, label }) => (
              <ToggleButton key={mode} value={mode}>
                {label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>

        <Stack spacing={3} sx={GALLERY_CONTENT_SX}>
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
