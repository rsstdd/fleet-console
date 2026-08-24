import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { BrowserRouter } from "react-router";

import "./styles/global.css";
import "./styles/tokens.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-mono/400.css";

import { AppRouter } from "@/app/appRouter";
import { applyTenantTheme, buildMuiTheme } from "@/app/theme";
import { TENANT } from "@/config/tenant";

// Theme is applied before first paint rather than in an effect: the token layer
// switches on `data-theme`, and setting it after mount would render one frame of
// the wrong palette (01_APP_SHELL.md section 2 — "set from config.tenant.theme at boot").
applyTenantTheme(TENANT.theme);

const container = document.getElementById("root");
if (!container) {
  throw new Error("main.tsx: #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider theme={buildMuiTheme(TENANT.theme)}>
      <CssBaseline />
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
