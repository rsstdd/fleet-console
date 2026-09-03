import { createContext, use } from "react";

/**
 * The stream's connection state, shared with the feature layer.
 *
 * This module exists because of a dependency-rule problem with one legal answer
 * (ADR 23, register **D15**). The fact is produced in `app`, which owns the transport
 * lifecycle; it is needed in `features/fleet` and `features/robot`, which must stop
 * rendering per-robot freshness while the stream is down (ADR 3). `features` may not
 * import `app` (ADR 4), so the value cannot travel down the import graph — and
 * `shared/lib` is the only layer both `app` and `features` are allowed to import.
 *
 * **Scoped to connection state and nothing else, deliberately.** The risk this module
 * carries is not that it is wrong; it is that it becomes the place a general application
 * store grows, because it is the one stateful thing every layer can reach. It exports the
 * stream's connection state, a predicate over that state, and nothing more. Anything that
 * is not "can this browser see the server" belongs elsewhere: robot state is
 * `entities/robot`, deployment configuration is `config`, and view state belongs to the
 * feature that owns it (Principle 11).
 *
 * **This is not robot state and must never be merged with it.** Principle 11 separates
 * state by authority, lifetime and transition model, and these two disagree on all three:
 * connection state is the browser's own observation of its socket, changing on connect and
 * disconnect, while robot state is the server's observation of a machine, changing on every
 * flush. Collapsing them is the specific failure that principle names — and it is why the
 * console must not fall back to a per-robot "unreachable" when its own socket dies, which
 * would blame the machines for the console's blindness (ADR 3).
 */

/**
 * Connection states the console distinguishes.
 *
 * Declared here rather than imported from `shared/ui/connectionBanner`, which holds a
 * structurally identical union. `shared/lib` and `shared/ui` are siblings and neither may
 * import the other (ADR 4), so the two are restated and TypeScript's structural typing
 * makes a value of either assignable to the other with no adapter. The same reasoning is
 * already written on `StatusPresentationVariant` in `entities/robot/selectors.ts`.
 *
 * Coupling: `docs/02_component-specs/07_CONNECTION_BANNER.md` § API is the authority for
 * this vocabulary. Adding a state is a change in three places — that spec, the banner, and
 * here — and the test in `connectionContext.test.ts` names the banner explicitly.
 */
export type StreamConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * The value a consumer sees when no provider is above it.
 *
 * `disconnected`, never `connected`. A missing provider is a programming error, and the
 * two ways to be wrong about it are not symmetric: defaulting to `connected` makes every
 * row assert a currency nothing is supplying, which is precisely what Principle 4 forbids
 * and what `AppShell`'s old `connectionState = "connected"` prop default did. Defaulting to
 * `disconnected` fails closed — labels are suppressed and the banner reports an outage, so
 * the mistake is visible to whoever is looking at the screen rather than invisible.
 */
export const DEFAULT_CONNECTION_STATE: StreamConnectionState = "disconnected";

/**
 * Carries the stream's connection state from `app` to the features that must suppress
 * per-robot freshness while it is down.
 *
 * Provided in `app/appShell.tsx`. Consumed through `useConnectionState`.
 */
export const ConnectionContext = createContext<StreamConnectionState>(DEFAULT_CONNECTION_STATE);

/** Reads the stream's connection state; `disconnected` when no provider is above the caller. */
export function useConnectionState(): StreamConnectionState {
  return use(ConnectionContext);
}

/**
 * Whether the stream is currently delivering, and therefore whether a per-robot freshness
 * label can be trusted.
 *
 * Here rather than in each feature so the suppression rule has one authority. `features`
 * may not import each other, so a rule written inline in `fleetPage` and again in
 * `robotDetailPage` is two rules that can disagree — and the way they would disagree is
 * one page suppressing while the other does not, which is the state ADR 3 exists to
 * prevent (Principle 1).
 *
 * `connecting` and `reconnecting` count as not delivering. Nothing is updating freshness
 * while an attempt is in flight, so any last value is ageing silently, which is the same
 * lie as a dead socket (ADR 31 keeps all non-connected states suppressing).
 *
 * Deliberately **not** named `isStreamLive`: `live` is a freshness state in ADR 3's
 * vocabulary, and a helper whose name collides with it invites exactly the conflation of
 * connection state and robot state that Principle 11 forbids.
 */
export function isStreamConnected(state: StreamConnectionState): boolean {
  return state === "connected";
}
