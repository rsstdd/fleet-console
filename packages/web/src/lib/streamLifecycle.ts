import type { StreamConnectionState } from "@/context/connectionContext";

/**
 * The stream's complete state, its retry schedule, and the vocabulary the console
 * publishes (ADR 31, register **D22**). `fleetTransport` owns the timers and calls these.
 */

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
 *
 * Coupling: `components/connectionBanner.tsx` mirrors this union because `components`
 * cannot import `lib`; component spec 07 § API owns the shared vocabulary.
 */
export type StreamTerminalCause =
  /** Three initial-probe attempts and the socket never opened once. */
  | "handshake-exhausted"
  /** The server sent a body this console cannot decode; retrying returns the same bytes. */
  | "contract"
  /** The snapshot and the stream came from different server runtimes (ADR 31). */
  | "session-mismatch";

interface StreamStateFields {
  /** Attempts since the last completed join; zero only after a snapshot reconciles. */
  readonly attempt: number;
  /** Null until the first open: the absence separates a first connect from a recovery. */
  readonly lastConnectedAt: number | null;
}

/**
 * The transport's state, including what the banner needs to show its retry control.
 *
 * A cause exists exactly while the phase is `failed`. ADR 31 keeps the three causes as
 * metadata rather than as more phases; pairing them here costs no phase and spares every
 * consumer a null check the phase has already answered.
 */
export type StreamState =
  | (StreamStateFields & {
      readonly phase: Exclude<StreamPhase, "failed">;
      readonly terminalCause: null;
    })
  | (StreamStateFields & {
      readonly phase: "failed";
      readonly terminalCause: StreamTerminalCause;
    });

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
  /** The console ended the session itself. Nothing is pending and nothing failed. */
  | { readonly kind: "disconnect" }
  /** The client has stopped trying, for the stated cause. Only manual retry leaves it. */
  | { readonly kind: "give-up"; readonly cause: StreamTerminalCause };

export const INITIAL_STREAM_STATE: StreamState = {
  phase: "idle",
  attempt: 0,
  lastConnectedAt: null,
  terminalCause: null,
};

/**
 * @returns The next state, or `state` itself whenever the event leaves every field equal.
 *   `fleetTransport` compares by identity to decide whether a transition happened, so
 *   returning the same reference suppresses a spurious report rather than merely saving an
 *   allocation.
 */
export function nextStreamState(state: StreamState, event: StreamEvent): StreamState {
  const next = reduceStreamState(state, event);
  return isSameStreamState(state, next) ? state : next;
}

function reduceStreamState(state: StreamState, event: StreamEvent): StreamState {
  switch (event.kind) {
    case "connect":
      if (state.phase === "connected") return state;
      // Starting an attempt clears the cause: "why we stopped" is false the moment we are
      // trying again.
      return {
        ...state,
        phase: pendingAttemptPhase(state),
        attempt: state.attempt + 1,
        terminalCause: null,
      };

    case "open":
      // No `attempt: 0` here: it resets on `joined`, so a socket that opens onto a failing
      // snapshot fetch keeps counting (ADR 31).
      return { ...state, phase: "connected", lastConnectedAt: event.at, terminalCause: null };

    case "joined":
      return { ...state, attempt: 0 };

    case "close":
      return { ...state, phase: pendingAttemptPhase(state), terminalCause: null };

    case "disconnect":
      return { ...state, phase: "idle", attempt: 0, terminalCause: null };

    case "give-up":
      return { ...state, phase: "failed", terminalCause: event.cause };
  }
}

/** Never connected means never reconnecting, however many attempts have failed. */
function pendingAttemptPhase(state: StreamState): "connecting" | "reconnecting" {
  return state.lastConnectedAt === null ? "connecting" : "reconnecting";
}

/**
 * `satisfies` is the enforcement: a field added to `StreamState` fails to compile until it
 * appears here, so no change can quietly leave a transition unreported.
 */
const STREAM_STATE_FIELDS = {
  phase: (state: StreamState) => state.phase,
  attempt: (state: StreamState) => state.attempt,
  lastConnectedAt: (state: StreamState) => state.lastConnectedAt,
  terminalCause: (state: StreamState) => state.terminalCause,
} satisfies Record<keyof StreamState, (state: StreamState) => unknown>;

function isSameStreamState(state: StreamState, next: StreamState): boolean {
  return Object.values(STREAM_STATE_FIELDS).every((read) => read(state) === read(next));
}

/**
 * Projects the transport's state onto the four values the console publishes (ADR 23 as
 * amended by ADR 31).
 *
 * Everything that is not `connected` suppresses per-robot freshness labels, which is the
 * property ADR 3 depends on. Being wrong in the permissive direction is what makes a
 * console assert currency it cannot support, so `idle` maps to `disconnected` rather than
 * to anything optimistic.
 */
export function selectPublishedConnectionState(state: StreamState): StreamConnectionState {
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
 * Attempts per operator-initiated initial probe cycle before the transport stops retrying
 * (ADR 31). Applies only while no socket has ever opened; manual retry grants a new
 * cycle, and after one successful open automatic retries are uncapped.
 *
 * Coupling: `components/connectionBanner.tsx` states this number in the
 * `handshake-exhausted` copy; component spec 07 §5 requires both to change together.
 */
export const INITIAL_PROBE_ATTEMPT_LIMIT = 3;

/** The backoff ceiling ADR 31 fixes: no scheduled delay reaches 30 seconds. */
export const RETRY_DELAY_CEILING_MS = 30_000;

/** The base of the exponential schedule: the first retry draws from [0, 1s). */
export const RETRY_BASE_DELAY_MS = 1_000;

/**
 * Past this exponent the cap exceeds the ceiling forever, so clamping keeps the arithmetic
 * exact instead of drifting through Infinity on a long outage.
 */
const RETRY_EXPONENT_LIMIT = 15;

/**
 * The delay before the next attempt, after `consecutiveFailedAttempts` failures: full
 * jitter over an exponential cap,
 * `0 ≤ delay < min(30s, 1s × 2^(consecutiveFailedAttempts−1))` (ADR 31).
 *
 * @param consecutiveFailedAttempts - Failures since the last completed join. Anything
 *   below 1 is treated as 1, so the first retry draws from the full base window.
 * @param random - Uniform source over [0, 1).
 * @returns Milliseconds to wait. It genuinely reaches zero; a floor would re-synchronize
 *   every console that lost the same server at the same moment, which is the stampede
 *   jitter exists to break.
 */
export function computeRetryDelayMs(
  consecutiveFailedAttempts: number,
  random: () => number,
): number {
  const exponent = Math.min(Math.max(consecutiveFailedAttempts, 1) - 1, RETRY_EXPONENT_LIMIT);
  const delayCapMs = Math.min(RETRY_DELAY_CEILING_MS, RETRY_BASE_DELAY_MS * 2 ** exponent);
  return random() * delayCapMs;
}
