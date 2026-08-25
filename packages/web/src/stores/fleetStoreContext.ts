import { createContext, use } from "react";

import { createFleetStore, type FleetStore } from "./fleetStore";

// A missing provider stays visibly loading instead of silently rendering fixture data.
const DEFAULT_FLEET_STORE = createFleetStore();

/** Scoped to fleet state, so it cannot become a general application store (ADR 23). */
export const FleetStoreContext = createContext<FleetStore>(DEFAULT_FLEET_STORE);

export function useFleetStore(): FleetStore {
  return use(FleetStoreContext);
}
