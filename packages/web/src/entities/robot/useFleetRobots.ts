import { useSyncExternalStore } from "react";

import { useFleetStore } from "./fleetStoreContext";
import type { Robot } from "./model";

/**
 * The fleet, read from the store the transport fills.
 *
 * The exported signature is unchanged from the fixture version this replaced, which was
 * the point of writing it that way: `features/fleet` was built and reviewed against the
 * real component contract while the server did not exist, and the swap touched no
 * component.
 *
 * **No freshness timer, here or anywhere.** `freshness` is whatever the server's sweep
 * computed and sent (ADR 3). A client that aged robots locally would be a second authority
 * that can disagree with the first, and the disagreement would be invisible.
 */

/**
 * Subscribes to the fleet and re-renders when a frame changes it.
 *
 * `getRobots` returns a cached array by identity, which is what makes this safe:
 * `useSyncExternalStore` compares snapshots by reference, and a store that built a new
 * array per call would loop forever rather than merely re-render often.
 */
export function useFleetRobots(): readonly Robot[] {
  const store = useFleetStore();
  return useSyncExternalStore(store.subscribe, store.getRobots);
}
