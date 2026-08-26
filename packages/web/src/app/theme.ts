import { createTheme, type Theme } from "@mui/material/styles";
import type { FreshnessState } from "@fleet/contracts";

/** Freshness owns a colour role of its own; status never borrows it. */
export const FRESHNESS_COLOR: Record<FreshnessState, string> = {
  live: "var(--live)",
  stale: "var(--stale)",
  unreachable: "var(--unreachable)",
  unknown: "var(--unknown)",
};

export type ColorScheme = "light" | "dark";

const PALETTE = {
  light: {
    bg: "#f4f2ec",
    surface: "#ffffff",
    text: "#1a1d1b",
    muted: "#6b6860",
    accent: "#a67c3a",
  },
  dark: { bg: "#141816", surface: "#1c211e", text: "#e8e6e1", muted: "#8e8b82", accent: "#c2a671" },
} as const;

export function createAppTheme(scheme: ColorScheme): Theme {
  const palette = PALETTE[scheme];
  return createTheme({
    palette: {
      mode: scheme,
      primary: { main: palette.accent },
      background: { default: palette.bg, paper: palette.surface },
      text: { primary: palette.text, secondary: palette.muted },
      divider: scheme === "dark" ? "#2e3430" : "#d9d4c8",
    },
    shape: { borderRadius: 6 },
    typography: {
      fontFamily:
        '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      h1: { fontSize: "1.5rem", fontWeight: 600 },
      h2: { fontSize: "1.125rem", fontWeight: 600 },
    },
    components: {
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { border: "1px solid var(--border)" } },
      },
      MuiTableCell: { styleOverrides: { root: { borderColor: "var(--border)" } } },
    },
  });
}
