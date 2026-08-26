import { useMemo } from "react";
import { BrowserRouter } from "react-router";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { AppShell } from "@/app/appShell";
import { createAppTheme } from "@/app/theme";
import { useColorScheme } from "@/hooks/useColorScheme";

/** Composition root: the providers the shell and every route below it assume. */
export function App() {
  const { scheme, toggle } = useColorScheme();
  const theme = useMemo(() => createAppTheme(scheme), [scheme]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AppShell scheme={scheme} onToggleScheme={toggle} />
      </BrowserRouter>
    </ThemeProvider>
  );
}
