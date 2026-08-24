import { reconcileDeltaWithSnapshot } from "@fleet/contracts";
import type { ContractIssue, FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { createColdStart } from "./coldStart";
import type { StreamConnectionState } from "@/context/connectionContext";
import {
  INITIAL_PROBE_ATTEMPT_LIMIT,
  INITIAL_STREAM_STATE,
  nextStreamState,
  computeRetryDelayMs,
  selectPublishedConnectionState,
  type StreamState,
  type StreamTerminalCause,
} from "./streamLifecycle";
import { decodeFrameText, fetchFleetSnapshot, type FetchLike } from "./transportDecoding";

/**
 * The stream client: socket first, snapshot second, reconcile, recover (ADR 31).
 *
 * It composes the units that were each decided and tested on their own — `coldStart` for
 * the joining order, `streamLifecycle` for the state matrix and retry schedule,
 * `transportDecoding` for the boundary, and the published projection — and adds the
 * sequencing and the timers between them. Everything that could be tested without a
 * socket or a clock already was; this module is deliberately only the part that cannot.
 *
 * **The order is the contract.** Open, buffer, fetch, discard what the snapshot covers,
 * replay the rest. Fetching first loses every delta emitted in the gap, and the symptom is
 * a row that quietly stops updating rather than an error (ADR 18, ADR 31).
 *
 * **Recovery is automatic and bounded by policy, not by attempts** (ADR 31): an immediate
 * first attempt, then full-jitter exponential delays under a 30-second ceiling. Only the
 * initial probe is capped — three attempts in which the socket never opened end in a
 * terminal state with a manual retry — because a server that has answered once is worth
 * waiting for and one that has never answered may not exist. A restart is detected by the
 * server session on the new snapshot; the old epoch is discarded wholesale rather than
 * compared, which is what lets sequence numbers restart at zero without rows silently
 * freezing.
 *
 * It emits decoded values and never touches a store: `lib` may not import `stores`
 * (ADR 4), and that rule is what keeps domain application in the layer that owns the
 * domain. The caller wires the callbacks to `createFleetStore`.
 */

/** A live socket, reduced to the one thing the transport does to it. */
export interface SocketHandle {
  close(): void;
}

/** Opens one socket; injected so the whole client is testable without a browser. */
export type OpenSocket = (
  url: string,
  handlers: {
    onOpen: () => void;
    onMessage: (data: string) => void;
    onClose: () => void;
  },
) => SocketHandle;

/**
 * The timer the retry schedule runs on; injected so every delay in the policy is
 * testable with fake time rather than by waiting (ADR 31).
 */
export interface RetryTimer {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

/** The browser's own timer, used when the caller injects nothing. */
const REAL_TIMER: RetryTimer = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/** Everything the transport reports outward. */
export interface FleetTransportHandlers {
  /** The initial fleet, already reconciled; replaces whatever the caller held. */
  onSnapshot: (snapshot: FleetSnapshot) => void;
  /** One decoded frame, in order, including buffered ones replayed after the snapshot. */
  onBatch: (batch: TelemetryBatch) => void;
  /**
   * Reports every lifecycle transition, with both vocabularies.
   *
   * `published` is what `ConnectionContext` carries (ADR 23); `state` is the transport's
   * full phase, attempt count, and terminal cause, which the banner needs to show a retry
   * counter that is actually counting and copy that names why retrying stopped. Fired on
   * every transition rather than only on a published change, because an attempt can
   * increment without the published value moving.
   */
  onConnectionState: (published: StreamConnectionState, state: StreamState) => void;
  /** A body this console cannot read. Terminal: retrying returns the same bytes (ADR 20). */
  onTerminalError: (issues: readonly ContractIssue[]) => void;
  /** One frame dropped. Counted for a diagnostics surface, never for the fleet table. */
  onFrameRejected: () => void;
}

/** Where to reach the server, from `TENANT.endpoints` and never from a literal (ADR 21). */
export interface FleetTransportEndpoints {
  readonly snapshotUrl: string;
  readonly streamUrl: string;
}

/** A running transport. */
export interface FleetTransport {
  /**
   * Starts a connection attempt immediately: the first, or the banner's manual retry.
   *
   * Manual semantics per ADR 31: cancels any scheduled retry, closes any half-open
   * socket, clears the terminal cause, and grants a fresh three-attempt initial probe
   * cycle. A no-op while connected.
   */
  connect(): void;
  /** Closes the socket and cancels the schedule without reporting a failure. */
  disconnect(): void;
  /** The transport's full state, which is richer than what it publishes. */
  readonly state: StreamState;
}

/** Composes the joining sequence and the recovery schedule over injected ports. */
export function createFleetTransport(options: {
  readonly endpoints: FleetTransportEndpoints;
  readonly openSocket: OpenSocket;
  readonly fetchLike: FetchLike;
  readonly handlers: FleetTransportHandlers;
  /** Defaults to real `setTimeout`; tests inject fake time. */
  readonly timer?: RetryTimer;
  /** Defaults to `Math.random`; tests inject determinism (ADR 31 full jitter). */
  readonly random?: () => number;
}): FleetTransport {
  const { endpoints, openSocket, fetchLike, handlers } = options;
  const timer = options.timer ?? REAL_TIMER;
  const random = options.random ?? Math.random;

  let state = INITIAL_STREAM_STATE;
  let socket: SocketHandle | null = null;
  let coldStart = createColdStart();
  /**
   * Guards every asynchronous callback: a socket event or snapshot landing after its
   * attempt was superseded, closed, or given up belongs to a dead world and must not
   * advance the live one. Every intentional close bumps it.
   */
  let generation = 0;
  /** The scheduled next attempt, if one is pending. */
  let pendingRetry: unknown = null;
  /** Whether any socket has ever opened; the probe cap applies only before this. */
  let everOpened = false;
  /** Never-opened attempts in the current operator-initiated probe cycle (ADR 31). */
  let probeFailures = 0;
  /** Consecutive failed attempts since the last completed join; drives the backoff. */
  let failedAttempts = 0;
  /** The settled snapshot's identity, against which every live frame is reconciled. */
  let epoch: { serverSessionId: string; flushSequence: number } | null = null;

  function advance(event: Parameters<typeof nextStreamState>[1]): void {
    const previous = state;
    state = nextStreamState(state, event);
    if (state !== previous) {
      handlers.onConnectionState(selectPublishedConnectionState(state), state);
    }
  }

  function cancelPendingRetry(): void {
    if (pendingRetry !== null) {
      timer.clear(pendingRetry);
      pendingRetry = null;
    }
  }

  /** Closes the current socket, if any, without letting its close event count as a failure. */
  function closeSocketSilently(): void {
    generation += 1;
    socket?.close();
    socket = null;
  }

  /** Stops for good, for the stated cause; only the banner's manual retry leaves this. */
  function giveUp(cause: StreamTerminalCause): void {
    cancelPendingRetry();
    closeSocketSilently();
    advance({ kind: "give-up", cause });
  }

  /**
   * One attempt failed. Counts it against both schedules, gives up when the initial
   * probe is exhausted, and otherwise schedules the next attempt under full jitter.
   */
  function handleAttemptFailure(): void {
    // The failed attempt may still have a snapshot fetch in flight; a bump makes its
    // landing stale rather than a joined state with no socket under it.
    generation += 1;
    failedAttempts += 1;
    advance({ kind: "close" });
    if (!everOpened) {
      probeFailures += 1;
      if (probeFailures >= INITIAL_PROBE_ATTEMPT_LIMIT) {
        giveUp("handshake-exhausted");
        return;
      }
    }
    pendingRetry = timer.set(
      () => {
        pendingRetry = null;
        startAttempt();
      },
      computeRetryDelayMs(failedAttempts, random),
    );
  }

  async function loadSnapshot(attempt: number): Promise<void> {
    const outcome = await fetchFleetSnapshot(fetchLike, endpoints.snapshotUrl);
    // The socket closed or reconnected while this was in flight, so this snapshot describes
    // a fleet the buffer no longer matches. Dropping it is correct; the live attempt
    // fetches its own.
    if (attempt !== generation) return;

    if (!outcome.ok) {
      if (outcome.failure.kind === "contract") {
        // Terminal by decision, not policy failure: retrying returns the same bytes.
        handlers.onTerminalError(outcome.failure.issues);
        giveUp("contract");
        return;
      }
      // An unreachable snapshot closes the whole attempt: a socket without a snapshot has
      // not joined, and ADR 31 counts the pair as one attempt so the retry policy — not
      // an open-but-fleetless socket — decides what happens next.
      closeSocketSilently();
      handleAttemptFailure();
      return;
    }

    const settled = coldStart.settle(outcome.snapshot);
    epoch = {
      serverSessionId: settled.snapshot.serverSessionId,
      flushSequence: settled.snapshot.flushSequence,
    };
    // The snapshot is authoritative either way: even when the stream disagrees with it,
    // last-known rows beat no rows, and the banner says why they may be stale (ADR 31).
    handlers.onSnapshot(settled.snapshot);
    for (const batch of settled.replay) handlers.onBatch(batch);

    if (settled.mismatched > 0) {
      // Buffered frames from a different runtime mean this socket and this snapshot are
      // not describing the same server. That is a deployment-integrity failure, not a
      // race to retry through (ADR 31).
      giveUp("session-mismatch");
      return;
    }

    failedAttempts = 0;
    advance({ kind: "joined" });
  }

  function startAttempt(): void {
    // One socket, ever: superseding bumps the generation so the old socket's callbacks
    // are stale, and closing it here means no two sockets coexist even across rapid
    // manual retries.
    closeSocketSilently();
    const attempt = generation;
    coldStart = createColdStart();
    epoch = null;
    advance({ kind: "connect" });

    socket = openSocket(endpoints.streamUrl, {
      onOpen: () => {
        if (attempt !== generation) return;
        // The handshake succeeded: the probe question — does this server exist — is
        // answered for good, so only the uncapped post-open schedule applies from here.
        everOpened = true;
        probeFailures = 0;
        advance({ kind: "open", at: Date.now() });
        // Only now, so nothing flushed between the upgrade and this point is lost.
        void loadSnapshot(attempt);
      },

      onMessage: (data) => {
        if (attempt !== generation) return;
        const decoded = decodeFrameText(data);
        if (!decoded.ok) {
          handlers.onFrameRejected();
          return;
        }
        if (coldStart.receive(decoded.batch) === "buffered") return;
        if (epoch === null) return;
        switch (reconcileDeltaWithSnapshot(epoch, decoded.batch)) {
          case "apply":
            handlers.onBatch(decoded.batch);
            return;
          case "covered":
            // Redundant, not malformed: the snapshot already reflects it.
            return;
          case "session-mismatch":
            // The server behind this socket is not the one the snapshot described.
            // Retaining last-known rows and stopping is the honest response (ADR 31).
            giveUp("session-mismatch");
            return;
        }
      },

      onClose: () => {
        if (attempt !== generation) return;
        socket = null;
        if (epoch !== null) {
          // An established stream dropped, not an attempt failing: recovery gets its own
          // immediate first attempt, and only *its* failures back off (ADR 31).
          generation += 1;
          advance({ kind: "close" });
          startAttempt();
          return;
        }
        handleAttemptFailure();
      },
    });
  }

  return {
    get state(): StreamState {
      return state;
    },

    connect(): void {
      if (state.phase === "connected") return;
      cancelPendingRetry();
      // A fresh operator-initiated cycle: the three-attempt initial probe budget renews
      // on every manual retry (ADR 31).
      probeFailures = 0;
      startAttempt();
    },

    disconnect(): void {
      cancelPendingRetry();
      closeSocketSilently();
    },
  };
}
