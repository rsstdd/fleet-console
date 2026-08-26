import { useSyncExternalStore } from "react";
import { useFleetContext } from "@/context/fleetContext";
import type { FleetState } from "@/stores/fleetStore";

export function useFleetState(): FleetState {
  const { store } = useFleetContext();
  return useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getState(),
  );
}
