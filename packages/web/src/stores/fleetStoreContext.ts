import { createContext, use } from "react";

import { createFleetStore, type FleetStore } from "./fleetStore";

/**
 * How the fleet store reaches the hooks that read it.
 *
 * The store is created by the transport boundary in `app`, and the hooks that read it live
 * here in `stores`. `features` may not import `app` (ADR 4), so the value cannot travel
 * down the import graph — the same constraint that put connection state in a context
 * (ADR 23), applied to the other half of what the transport produces.
 *
 * Scoped to the fleet store and nothing else, for the reason ADR 23 states about its own
 * module: a context every layer can reach is where an application store grows by
 * accretion. View state belongs to the feature that owns it, and deployment values to
 * `config`.
 */

/**
 * The default: an empty store, not a fixture set.
 *
 * A console with no provider knows about no robots, and that is the truth about it. A
 * fixture default would make a missing provider invisible — the same asymmetry that made
 * `disconnected` the connection default (ADR 23): being wrong towards emptiness shows on
 * the screen, being wrong towards content does not.
 */
const EMPTY_STORE = createFleetStore();

/** Carries the fleet store from the transport boundary to the hooks that read it. */
export const FleetStoreContext = createContext<FleetStore>(EMPTY_STORE);

/** Returns the fleet store this console is reading. */
export function useFleetStore(): FleetStore {
  return use(FleetStoreContext);
}
