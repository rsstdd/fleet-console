import Alert from "@mui/material/Alert";
import type { ConnectionState } from "@/lib/fleetTransport";

const MESSAGE: Record<Exclude<ConnectionState, "connected">, string> = {
  connecting: "Connecting to the fleet stream…",
  reconnecting: "Reconnecting to the fleet stream. Values below are last known, not current.",
  disconnected: "Disconnected from the fleet stream. Values below are last known, not current.",
};

export function ConnectionBanner({ connection }: { readonly connection: ConnectionState }) {
  if (connection === "connected") {
    return null;
  }

  return (
    <Alert
      severity={connection === "connecting" ? "info" : "warning"}
      role="status"
      aria-live="polite"
      sx={{ mb: 2 }}
    >
      {MESSAGE[connection]}
    </Alert>
  );
}
