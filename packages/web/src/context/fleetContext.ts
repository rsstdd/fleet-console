import { createContext, useContext } from "react";
import type { ConnectionState } from "@/lib/fleetTransport";
import type { FleetStore } from "@/stores/fleetStore";

/** The one transport's output, shared by every view. */
export interface FleetContextValue {
  readonly store: FleetStore;
  readonly connection: ConnectionState;
  readonly rejectedFrames: number;
}

const FleetContext = createContext<FleetContextValue | null>(null);

export const FleetProvider = FleetContext.Provider;

export function useFleetContext(): FleetContextValue {
  const value = useContext(FleetContext);
  if (value === null) {
    throw new Error("useFleetContext must be used inside <FleetProvider>.");
  }
  return value;
}
