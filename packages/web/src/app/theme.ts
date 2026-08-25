// The shell's theme bridge.
// - tokens.ts owns the authored values; its generated CSS switches them on the
// `data-theme` attribute
// - MUI consumes the same source as a theme object
//
// This module does NOT write custom properties inline.
import { createTheme } from "@mui/material";
import { toggleButtonClasses } from "@mui/material/ToggleButton";
import type { Theme } from "@mui/material/styles";

import type { TenantTheme } from "@/config/tenantTheme";
import { MUI_SHAPE_BORDER_RADIUS, TENANT_PALETTE } from "@/styles/tokens";

/**
 * Points the token layer at a tenant by setting `data-theme` on the document element.
 *
 * The timing belongs to the caller, not to this function: `main.tsx` calls it before the
 * first render, because setting the attribute after mount paints one frame of the other
 * tenant's palette. The dev gallery calls it again to swap themes and restores
 * `TENANT.theme` on unmount.
 */
export function applyTenantTheme(mode: TenantTheme): void {
  document.documentElement.setAttribute("data-theme", mode);
}

/**
 * Builds MUI from the same authored tokens that generate the CSS custom properties.
 */
export function buildMuiTheme(mode: TenantTheme): Theme {
  const palette = TENANT_PALETTE[mode];

  return createTheme({
    palette: {
      mode,
      background: { default: palette.bg, paper: palette.surface },
      text: {
        primary: palette.ink,
        secondary: palette.inkSoft,
        disabled: palette.inkMuted,
      },
      primary: {
        main: palette.accent,
        dark: palette.accentHover,
        contrastText: palette.onAccent,
      },
      divider: palette.line,
    },
    /*
     * Every variant the app actually renders is mapped, not just some of them. An
     * unmapped variant is not inert: MUI substitutes its own default, so `variant="h2"`
     * rendered at 3.75rem/300 — MUI's, not this design system's — while `--text-h2`
     * (1.25rem) went unread, and `body2`, the most used variant in the package, sat at
     * MUI's 0.875rem instead of the `--text-small` step. global.css states the same
     * treatment for the bare `h2` element, but `.MuiTypography-h2` is a class and beats
     * an element selector, so the stylesheet never corrected it. Adding a variant to the
     * scale means adding it here as well as to tokens.css.
     */
    typography: {
      fontFamily: "var(--font-sans)",
      h1: { fontSize: "var(--text-h1)", lineHeight: "var(--leading-tight)", fontWeight: 500 },
      h2: { fontSize: "var(--text-h2)", lineHeight: "var(--leading-snug)", fontWeight: 500 },
      h3: { fontSize: "var(--text-h3)", lineHeight: "var(--leading-snug)", fontWeight: 500 },
      body1: { fontSize: "var(--text-body)", lineHeight: "var(--leading-normal)" },
      body2: { fontSize: "var(--text-small)", lineHeight: "var(--leading-normal)" },
      caption: { fontSize: "var(--text-caption)", fontFamily: "var(--font-mono)" },
      overline: {
        fontSize: "var(--text-overline)",
        fontFamily: "var(--font-mono)",
        letterSpacing: "var(--tracking-overline)",
        textTransform: "uppercase",
      },
    },
    shape: { borderRadius: MUI_SHAPE_BORDER_RADIUS },
    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { backgroundColor: "var(--bg)", color: "var(--ink)" } },
      },
      MuiPaper: {
        defaultProps: { variant: "outlined" },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: "var(--border-width) solid var(--line)",
            borderRadius: "var(--radius)",
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: "var(--line)",
            fontSize: "var(--text-small)",
            padding: "var(--space-3) var(--space-4)",
          },
          head: {
            backgroundColor: "var(--surface-sunken)",
            color: "var(--ink-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--text-overline)",
            textTransform: "uppercase",
            letterSpacing: "var(--tracking-overline)",
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            borderColor: "var(--line)",
            color: "var(--ink-soft)",
            [`&.${toggleButtonClasses.selected}`]: {
              backgroundColor: "var(--accent)",
              color: "var(--on-accent)",
              borderColor: "var(--accent)",
              "&:hover": { backgroundColor: "var(--accent-hover)" },
            },
          },
        },
      },
    },
  });
}
