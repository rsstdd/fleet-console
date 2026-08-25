import { createContext, use } from "react";

/**
 * Holds the browser's observation of its own socket, and nothing else. This is not robot
 * state and must never be merged with it: a dead socket here is the console's blindness,
 * never a per-robot "unreachable" that blames the machines for it (Principle 11, ADR 3).
 * Anything that is not "can this browser see the server" belongs to another module.
 */

/**
 * Restated rather than imported from `components/connectionBanner`, which declares a
 * structurally identical union that this layer may not import (ADR 4). Structural typing
 * keeps values of the two interchangeable; `connectionContext.test.ts` is the check that
 * they still are. `docs/02_component-specs/07_CONNECTION_BANNER.md` § API owns the vocabulary.
 */
export type StreamConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * Fails closed. The two ways to be wrong about a missing provider are not symmetric:
 * `connected` would make every row assert a currency nothing supplies (Principle 4), while
 * `disconnected` suppresses the labels and shows the banner, so the mistake is on screen.
 */
export const DEFAULT_CONNECTION_STATE: StreamConnectionState = "disconnected";

export const ConnectionContext = createContext<StreamConnectionState>(DEFAULT_CONNECTION_STATE);

export function useConnectionState(): StreamConnectionState {
  return use(ConnectionContext);
}

/**
 * True only while a per-robot freshness label can be trusted. `connecting` and
 * `reconnecting` count as not delivering: nothing updates freshness during an attempt, so
 * the last value ages silently, which is the same lie as a dead socket (ADR 3, ADR 31).
 *
 * Not named `isStreamLive`, because `live` is a freshness state in ADR 3's vocabulary and
 * the collision would invite the conflation Principle 11 forbids.
 */
export function isStreamConnected(state: StreamConnectionState): boolean {
  return state === "connected";
}
