import { useMemo } from "react";
import { Link as RouterLink } from "react-router";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { AppRouter } from "@/app/appRouter";
import type { ColorScheme } from "@/app/theme";
import { ConnectionBanner } from "@/components/connectionBanner";
import { readTenantConfig } from "@/config/endpoints";
import { FleetProvider } from "@/context/fleetContext";
import { useFleetTransport } from "@/hooks/useFleetTransport";

interface AppShellProps {
  readonly scheme: ColorScheme;
  readonly onToggleScheme: () => void;
}

/** Owns the chrome and the one transport every route reads from. */
export function AppShell({ scheme, onToggleScheme }: AppShellProps) {
  const fleet = useFleetTransport();
  const tenant = useMemo(() => readTenantConfig(), []);

  return (
    <FleetProvider value={fleet}>
      <AppBar position="static" color="default">
        <Toolbar>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{ color: "inherit", textDecoration: "none" }}
          >
            {tenant.name}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            onClick={onToggleScheme}
            aria-label={scheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {scheme === "dark" ? "☀" : "☾"}
          </IconButton>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <ConnectionBanner connection={fleet.connection} />
        <Box component="main">
          <AppRouter />
        </Box>
      </Container>
    </FleetProvider>
  );
}
