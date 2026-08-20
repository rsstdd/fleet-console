import type { StreamConnectionState } from "./connectionContext";

/**
 * The stream's complete state, and the smaller vocabulary the console publishes.
 *
 * Principle 5 requires every asynchronous surface to define its states before it is
 * implemented, and the transport has states the banner does not: it can be starting for
 * the first time, and it can have stopped trying. Those are different operator situations
 * from "the connection dropped", and a client that cannot tell them apart will say the
 * wrong one.
 *
 * **The published vocabulary is deliberately not widened here.** ADR 23 fixes
 * `StreamConnectionState` at three values, `shared/ui` holds a structurally identical
 * union it cannot import, and the banner's operator copy is a component-spec decision.
 * So this module keeps the richer set internally and projects onto the three — and the
 * projection is where the loss is visible and arguable, rather than spread through a
 * socket handler. What is lost, and whether it should be, is recorded in
 * `packages/web/src/features/fleet/TODO.md` **A3**.
 *
 * A reducer rather than a class: the whole point is that the transitions are inspectable
 * without a socket, and a pure function is what makes the state matrix a test rather than
 * a walkthrough.
 */

/** Every state the transport can actually be in. */
export type StreamPhase =
  /** Nothing has been attempted; the console has not asked for a connection yet. */
  | "idle"
  /** The **first** attempt is in flight. Nothing has ever been received. */
  | "connecting"
  | "connected"
  /** Was connected at least once, is not now, and an attempt is in flight or pending. */
  | "reconnecting"
  /** Not retrying. Only an explicit retry leaves this state. */
  | "failed";

/** The transport's state, including what the banner needs to show its retry control. */
export interface StreamState {
  readonly phase: StreamPhase;
  /** Attempts since the last successful open; zero while connected. */
  readonly attempt: number;
  /** When the stream last opened, so "last event" copy has something true to say. */
  readonly lastConnectedAt: number | null;
}

/** What can happen to a stream. */
export type StreamEvent =
  /** The console asked for a connection, or is retrying after `give-up`. */
  | { readonly kind: "connect" }
  | { readonly kind: "open"; readonly at: number }
  /** The socket closed or errored; the client intends to try again. */
  | { readonly kind: "close" }
  /**
   * The client has stopped trying.
   *
   * Raised by the caller rather than counted here, because *when* to stop — an attempt
   * cap, a backoff schedule, a refused upgrade — is not decided (fleet TODO **A3**).
   * A machine that invented a cap would make that decision silently.
   */
  | { readonly kind: "give-up" };

/** The state before anything has been attempted. */
export const INITIAL_STREAM_STATE: StreamState = {
  phase: "idle",
  attempt: 0,
  lastConnectedAt: null,
};

/**
 * Applies one event.
 *
 * `close` from `connected` goes to `reconnecting` rather than `disconnected`-shaped
 * silence, because the client does intend to try again and the banner's retry copy is
 * only honest while that is true. `close` before the first success stays in `connecting`:
 * a failed first attempt is not a reconnection, and telling an operator the connection was
 * lost when it never existed sends them looking for a fault that is not there.
 */
export function nextStreamState(state: StreamState, event: StreamEvent): StreamState {
  switch (event.kind) {
    case "connect":
      // From `failed` this is the manual retry the banner's control performs; from `idle`
      // it is the first attempt. Both are an attempt, so both count as one.
      return state.phase === "connected"
        ? state
        : {
            ...state,
            phase: state.lastConnectedAt === null ? "connecting" : "reconnecting",
            attempt: state.attempt + 1,
          };

    case "open":
      return { phase: "connected", attempt: 0, lastConnectedAt: event.at };

    case "close":
      return {
        ...state,
        // Never connected means never reconnecting, however many attempts have failed.
        phase: state.lastConnectedAt === null ? "connecting" : "reconnecting",
      };

    case "give-up":
      return { ...state, phase: "failed" };
  }
}

/**
 * Projects the transport's state onto the three values the console publishes (ADR 23).
 *
 * Everything that is not `connected` collapses to a state that suppresses per-robot
 * freshness labels, which is the property ADR 3 depends on: while the stream is not
 * delivering, no per-robot label can be trusted and the banner carries the connection-level
 * state instead. Getting the projection wrong in the permissive direction is what makes a
 * console assert currency it cannot support, so `idle` maps to `disconnected` rather than
 * to anything optimistic — the same reasoning that made `disconnected` the context default.
 */
export function publishedConnectionState(state: StreamState): StreamConnectionState {
  switch (state.phase) {
    case "connected":
      return "connected";
    case "connecting":
    case "reconnecting":
      return "reconnecting";
    case "idle":
    case "failed":
      return "disconnected";
  }
}
