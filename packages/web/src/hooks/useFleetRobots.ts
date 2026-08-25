import { useCallback, useSyncExternalStore } from "react";

import type { FleetSite } from "@fleet/contracts";

import { useFleetStore } from "@/stores/fleetStoreContext";
import type { FleetResourceState } from "@/stores/fleetStore";
import type { Robot } from "@/types/robot";

export function useFleetRobots(): FleetResourceState {
  const store = useFleetStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** The returned row keeps its identity while frames name only other robots. */
export function useFleetRobot(robotId: string): Robot | undefined {
  const store = useFleetStore();
  const getRobotSnapshot = useCallback(() => store.getRobot(robotId), [store, robotId]);
  return useSyncExternalStore(store.subscribe, getRobotSnapshot);
}

/** The directory keeps its identity across resource transitions that do not reseed it. */
export function useFleetSites(): readonly FleetSite[] {
  const store = useFleetStore();
  const getSiteDirectorySnapshot = useCallback(
    () => selectSiteDirectory(store.getState()),
    [store],
  );
  return useSyncExternalStore(store.subscribe, getSiteDirectorySnapshot);
}

// `useSyncExternalStore` compares snapshots by identity, so a fresh empty array per read
// would re-render forever rather than report a missing directory once.
const EMPTY_SITE_DIRECTORY: readonly FleetSite[] = [];

function selectSiteDirectory(state: FleetResourceState): readonly FleetSite[] {
  switch (state.kind) {
    case "loading":
      return EMPTY_SITE_DIRECTORY;
    case "ready":
    case "refreshing":
      return state.data.sites;
    case "recoverable-error":
    case "terminal-error":
      return state.data?.sites ?? EMPTY_SITE_DIRECTORY;
  }
}
