import { useCallback, useSyncExternalStore } from "react";

import type { FleetSite } from "@fleet/contracts";

import { useFleetStore } from "./fleetStoreContext";
import type { FleetResourceState } from "./fleetStore";
import type { Robot } from "./model";

/**
 * The fleet resource, read from the store the transport fills.
 *
 * **No freshness timer, here or anywhere.** `freshness` is whatever the server's sweep
 * computed and sent (ADR 3). A client that aged robots locally would be a second authority
 * that can disagree with the first, and the disagreement would be invisible.
 */

/**
 * Subscribes to the fleet resource and re-renders when a transition or frame changes it.
 *
 * Returns the complete state union rather than bare rows (Principle 5): the
 * fleet page owes the operator loading, retained-rows-during-error, recoverable
 * retry, and terminal contract failure, and a hook that returned `Robot[]`
 * made every one of those states unrepresentable.
 *
 * `getState` returns a cached object by identity, which is what makes this safe:
 * `useSyncExternalStore` compares snapshots by reference, and a store that built a new
 * object per call would loop forever rather than merely re-render often.
 */
export function useFleetRobots(): FleetResourceState {
  const store = useFleetStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

/**
 * Subscribes to one robot's fleet row by id, for the live half of robot detail.
 *
 * Stable under unrelated traffic: the store replaces only the robots a frame
 * names, so this snapshot keeps its identity — and this component skips its
 * re-render — while deltas stream for other robots. Coupling:
 * `reconcileDetailWithRow` in `fromEnvelope.ts` is what merges the returned
 * row into a fetched detail without refetching diagnostics or history.
 */
export function useFleetRobot(robotId: string): Robot | undefined {
  const store = useFleetStore();
  const read = useCallback(() => store.getRobot(robotId), [store, robotId]);
  return useSyncExternalStore(store.subscribe, read);
}

/** Stable before the first snapshot and across error states, so a consumer with no directory yet renders identifiers, not crashes. */
const NO_SITES: readonly FleetSite[] = [];

/**
 * Subscribes to the snapshot's site directory alone (ADR 34).
 *
 * Stable under telemetry: the directory's identity changes only when a new
 * snapshot lands, so a component that needs labels — robot detail's header —
 * does not re-render for every fleet delta the way a full resource
 * subscription would.
 */
export function useFleetSites(): readonly FleetSite[] {
  const store = useFleetStore();
  const read = useCallback(() => {
    const state = store.getState();
    return "data" in state && state.data !== null ? state.data.sites : NO_SITES;
  }, [store]);
  return useSyncExternalStore(store.subscribe, read);
}
