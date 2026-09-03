import type { StreamConnectionState } from "./connectionContext";

/**
 * The stream's complete state, its retry schedule, and the vocabulary the console
 * publishes (ADR 31, register **D22**).
 *
 * Principle 5 requires every asynchronous surface to define its states before it is
 * implemented, and the transport has more states than the banner shows: it can be starting
 * for the first time, recovering after a success, and terminally stopped for three
 * distinct reasons. Those are different operator situations, and a client that cannot
 * tell them apart will say the wrong one.
 *
 * The published vocabulary is the four values ADR 31 fixed: `connecting` is distinct from
 * `reconnecting` because a console that has never received anything and one that is
 * recovering earned different copy, and *why* a console stopped travels as
 * `terminalCause` metadata rather than as more phases — the three causes share every
 * transition and differ only in what the banner should say.
 *
 * A reducer plus pure schedule functions rather than a class: the whole point is that the
 * transitions and delays are inspectable without a socket or a real timer, and pure
 * functions are what make the state matrix and the jitter bounds tests rather than
 * walkthroughs. `fleetTransport` owns the timers and calls these.
 */

/** Every state the transport can actually be in. */
export type StreamPhase =
  /** Nothing has been attempted; the console has not asked for a connection yet. */
  | "idle"
  /** An attempt is in flight or pending and nothing has ever been received. */
  | "connecting"
  | "connected"
  /** Was connected at least once, is not now, and an attempt is in flight or pending. */
  | "reconnecting"
  /** Not retrying. Only an explicit retry leaves this state. */
  | "failed";

/**
 * Why the transport stopped retrying (ADR 31). Metadata beside the phase, not more
 * phases: the three causes transition identically and differ only in operator copy.
 */
export type StreamTerminalCause =
  /** Three initial-probe attempts and the socket never opened once. */
  | "handshake-exhausted"
  /** The server sent a body this console cannot decode; retrying returns the same bytes. */
  | "contract"
  /** The snapshot and the stream came from different server runtimes (ADR 31). */
  | "session-mismatch";

/** The transport's state, including what the banner needs to show its retry control. */
export interface StreamState {
  readonly phase: StreamPhase;
  /** Attempts since the last completed join; zero only after a snapshot reconciles. */
  readonly attempt: number;
  /** When the stream last opened, so "last event" copy has something true to say. */
  readonly lastConnectedAt: number | null;
  /** Why the transport gave up; null in every phase except `failed`. */
  readonly terminalCause: StreamTerminalCause | null;
}

/** What can happen to a stream. */
export type StreamEvent =
  /** An attempt starts: the first, a scheduled retry, or the banner's manual retry. */
  | { readonly kind: "connect" }
  | { readonly kind: "open"; readonly at: number }
  /**
   * The socket opened *and* the snapshot reconciled against it (ADR 31). This — not
   * `open` — is what resets the attempt count, because a socket that opens onto a
   * snapshot fetch that fails has not delivered a fleet.
   */
  | { readonly kind: "joined" }
  /** The socket closed or errored; the client intends to try again. */
  | { readonly kind: "close" }
  /** The client has stopped trying, for the stated cause. Only manual retry leaves it. */
  | { readonly kind: "give-up"; readonly cause: StreamTerminalCause };

/** The state before anything has been attempted. */
export const INITIAL_STREAM_STATE: StreamState = {
  phase: "idle",
  attempt: 0,
  lastConnectedAt: null,
  terminalCause: null,
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
      // it is the first attempt; from `connecting`/`reconnecting` it is a scheduled retry
      // firing. All are an attempt, so all count as one — and starting one clears the
      // terminal cause, because "why we stopped" is false the moment we are trying again.
      return state.phase === "connected"
        ? state
        : {
            ...state,
            phase: state.lastConnectedAt === null ? "connecting" : "reconnecting",
            attempt: state.attempt + 1,
            terminalCause: null,
          };

    case "open":
      // The attempt count survives: it resets on `joined`, not here, so a socket that
      // opens onto a failing snapshot fetch keeps counting (ADR 31).
      return { ...state, phase: "connected", lastConnectedAt: event.at };

    case "joined":
      return { ...state, attempt: 0 };

    case "close":
      return {
        ...state,
        // Never connected means never reconnecting, however many attempts have failed.
        phase: state.lastConnectedAt === null ? "connecting" : "reconnecting",
      };

    case "give-up":
      return { ...state, phase: "failed", terminalCause: event.cause };
  }
}

/**
 * Projects the transport's state onto the four values the console publishes (ADR 23 as
 * amended by ADR 31).
 *
 * Everything that is not `connected` collapses to a state that suppresses per-robot
 * freshness labels, which is the property ADR 3 depends on: while the stream is not
 * delivering, no per-robot label can be trusted and the banner carries the
 * connection-level state instead. Getting the projection wrong in the permissive
 * direction is what makes a console assert currency it cannot support, so `idle` maps to
 * `disconnected` rather than to anything optimistic — the same reasoning that made
 * `disconnected` the context default.
 */
export function publishedConnectionState(state: StreamState): StreamConnectionState {
  switch (state.phase) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "idle":
    case "failed":
      return "disconnected";
  }
}

/**
 * Attempts per operator-initiated initial probe cycle before the transport gives up
 * (ADR 31). Applies only while no socket has ever opened; manual retry grants a new
 * cycle, and after one successful open automatic retries are uncapped.
 */
export const INITIAL_PROBE_ATTEMPT_LIMIT = 3;

/** The backoff ceiling ADR 31 fixes: no scheduled delay reaches 30 seconds. */
export const RETRY_DELAY_CEILING_MS = 30_000;

/** The base of the exponential schedule: the first retry draws from [0, 1s). */
export const RETRY_BASE_DELAY_MS = 1_000;

/**
 * The delay before the next attempt, after `failedAttempts` consecutive failures:
 * full jitter over an exponential cap, `0 ≤ delay < min(30s, 1s × 2^(failedAttempts−1))`
 * (ADR 31).
 *
 * Full jitter rather than a fixed schedule because every console reconnecting after a
 * server restart reconnects at the same moment, and jitter is what keeps that from being
 * one synchronized stampede. The ceiling keeps recovery time bounded for an operator
 * watching the banner; the absence of an attempt cap is deliberate and separate — see
 * `INITIAL_PROBE_ATTEMPT_LIMIT` for the one bounded case.
 *
 * `random` is injected so the bounds are a test rather than a distribution argument.
 */
export function retryDelayMs(failedAttempts: number, random: () => number): number {
  const exponent = Math.max(failedAttempts, 1) - 1;
  // Beyond 2^15 the cap exceeds the ceiling forever; clamping the exponent keeps the
  // arithmetic exact instead of drifting through Infinity on a long outage.
  const cap = Math.min(RETRY_DELAY_CEILING_MS, RETRY_BASE_DELAY_MS * 2 ** Math.min(exponent, 15));
  return random() * cap;
}
