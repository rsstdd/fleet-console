// The shell's theme bridge. Two separate jobs, deliberately not merged:
// tokens.css owns the CSS custom properties for both themes and switches on the
// `data-theme` attribute; MUI needs the same palette as a JS theme object.
//
// This module does NOT write custom properties inline. An earlier version set ten
// of them on documentElement, which beat tokens.css on specificity and left the
// other twenty-six at their dark values on a light background — the light theme
// was broken precisely because this file tried to help. Setting the attribute is
// the whole job (01_APP_SHELL.md section 2, "Theme").
import { createTheme } from "@mui/material";

import { TENANT_PALETTE, type TenantTheme } from "@/config/tenantTheme";

/** Points the token layer at a tenant's theme by setting `data-theme` on the document element. */
export function applyTenantTheme(mode: TenantTheme): void {
  document.documentElement.setAttribute("data-theme", mode);
}

/** Builds the MUI theme for a tenant, reading the same palette the token layer uses. */
export function buildMuiTheme(mode: TenantTheme) {
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
    typography: {
      fontFamily: "var(--font-sans)",
      h1: { fontSize: "var(--text-h1)", lineHeight: "var(--leading-tight)", fontWeight: 500 },
      h3: { fontSize: "var(--text-h3)", lineHeight: "var(--leading-snug)", fontWeight: 500 },
      body1: { fontSize: "var(--text-body)", lineHeight: "var(--leading-normal)" },
      caption: { fontSize: "var(--text-caption)", fontFamily: "var(--font-mono)" },
      overline: {
        fontSize: "var(--text-overline)",
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      },
    },
    shape: { borderRadius: 6 },
    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { backgroundColor: "var(--bg)", color: "var(--ink)" } },
      },
      MuiPaper: {
        defaultProps: { variant: "outlined" },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            border: "1px solid var(--line)",
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
            letterSpacing: "0.06em",
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: "none",
            borderColor: "var(--line)",
            color: "var(--ink-soft)",
            "&.Mui-selected": {
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
