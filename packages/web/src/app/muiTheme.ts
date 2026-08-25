import { createTheme } from "@mui/material";
import { toggleButtonClasses } from "@mui/material/ToggleButton";
import type { Theme } from "@mui/material/styles";

import type { TenantTheme } from "@/config/tenantTheme";
import { MUI_SHAPE_BORDER_RADIUS, TENANT_PALETTE } from "@/styles/tokens";

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
     * Every variant the app renders must be mapped. An unmapped variant is not inert: MUI
     * substitutes its own default, and `.MuiTypography-*` is a class that beats global.css's
     * element selector, so the stylesheet cannot correct it. A new variant on the scale goes
     * here as well as in tokens.css.
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
