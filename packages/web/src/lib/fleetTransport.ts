import { reconcileDeltaWithSnapshot } from "@fleet/contracts";
import type {
  ContractIssue,
  FleetSnapshot,
  ReconciliationEpoch,
  TelemetryBatch,
} from "@fleet/contracts";

import { createColdStart, type ColdStart } from "./coldStart";
import type { StreamConnectionState } from "@/context/connectionContext";
import {
  INITIAL_PROBE_ATTEMPT_LIMIT,
  INITIAL_STREAM_STATE,
  nextStreamState,
  computeRetryDelayMs,
  selectPublishedConnectionState,
  type StreamEvent,
  type StreamState,
  type StreamTerminalCause,
} from "./streamLifecycle";
import {
  decodeFrameText,
  fetchFleetSnapshot,
  type FetchLike,
  type RequestFailure,
} from "./transportDecoding";

/**
 * The stream client: socket first, snapshot second, reconcile, recover.
 *
 * **The order is the contract.** Open and buffer before fetching; a fetch that goes first
 * loses every delta emitted in the gap, and the symptom is a row that quietly stops
 * updating rather than an error (ADR 18, ADR 31).
 *
 * A new snapshot's session replaces the epoch wholesale rather than being compared against
 * it, which is what lets sequence numbers restart at zero across a server restart without
 * rows silently freezing.
 */

export interface SocketHandle {
  close(): void;
}

export interface SocketHandlers {
  readonly onOpen: () => void;
  readonly onMessage: (frameText: string) => void;
  readonly onClose: () => void;
}

export type OpenSocket = (url: string, handlers: SocketHandlers) => SocketHandle;

export interface RetryTimer {
  readonly set: (onElapsed: () => void, delayMs: number) => number;
  readonly clear: (timerHandle: number) => void;
}

const BROWSER_TIMER: RetryTimer = {
  set: (onElapsed, delayMs) => setTimeout(onElapsed, delayMs),
  clear: (timerHandle) => {
    clearTimeout(timerHandle);
  },
};

export interface FleetTransportHandlers {
  readonly onSnapshot: (snapshot: FleetSnapshot) => void;
  readonly onBatch: (batch: TelemetryBatch) => void;
  readonly onConnectionState: (published: StreamConnectionState, state: StreamState) => void;
  readonly onTerminalError: (issues: readonly ContractIssue[]) => void;
  readonly onFrameRejected: () => void;
}

export interface FleetTransportEndpoints {
  readonly snapshotUrl: string;
  readonly streamUrl: string;
}

export interface FleetTransportOptions {
  readonly endpoints: FleetTransportEndpoints;
  readonly openSocket: OpenSocket;
  readonly fetchLike: FetchLike;
  readonly handlers: FleetTransportHandlers;
  readonly timer?: RetryTimer;
  readonly random?: () => number;
}

export interface FleetTransport {
  connect(): void;
  disconnect(): void;
  readonly state: StreamState;
}

type AttemptJoin =
  | { readonly status: "buffering" }
  | { readonly status: "joined"; readonly epoch: ReconciliationEpoch };

/**
 * One connection attempt: its identity, its buffer, and where its frames currently go.
 * Every socket and fetch callback carries the attempt it was created for, so a callback that
 * outlives its attempt recognises itself and reaches nothing the live attempt owns.
 */
interface Attempt {
  readonly generation: number;
  readonly coldStart: ColdStart;
  join: AttemptJoin;
  handshake: "opening" | "open";
}

/**
 * @param options - `handlers` run synchronously inside the transport's own sequencing. A
 *   throw from a socket callback propagates to whatever dispatched it; a throw while the
 *   snapshot settles rejects a promise nothing awaits, so it surfaces as an unhandled
 *   rejection rather than reaching a caller. `onConnectionState` fires on every transition,
 *   including ones the published value does not reflect.
 * @returns A transport that has opened nothing until `connect()`. Its `state` is a live
 *   getter rather than a snapshot, so a caller polling it after an event sees the result
 *   of that event.
 */
export function createFleetTransport(options: FleetTransportOptions): FleetTransport {
  const {
    endpoints,
    openSocket,
    fetchLike,
    handlers,
    timer = BROWSER_TIMER,
    random = Math.random,
  } = options;

  let streamState = INITIAL_STREAM_STATE;
  let liveAttempt: Attempt | null = null;
  let activeSocketHandle: SocketHandle | null = null;
  let liveAttemptGeneration = 0;
  let pendingRetryHandle: number | null = null;
  let handshakeEverSucceeded = false;
  let initialProbeFailureCount = 0;
  let consecutiveFailedAttemptCount = 0;

  function applyStreamEvent(event: StreamEvent): void {
    const previousStreamState = streamState;
    streamState = nextStreamState(streamState, event);
    if (streamState !== previousStreamState) {
      handlers.onConnectionState(selectPublishedConnectionState(streamState), streamState);
    }
  }

  function cancelPendingRetry(): void {
    if (pendingRetryHandle !== null) {
      timer.clear(pendingRetryHandle);
      pendingRetryHandle = null;
    }
  }

  function supersedeAttempt(): void {
    liveAttemptGeneration += 1;
    activeSocketHandle?.close();
    activeSocketHandle = null;
    liveAttempt = null;
  }

  function isSuperseded(attempt: Attempt): boolean {
    return attempt.generation !== liveAttemptGeneration;
  }

  function enterTerminalState(cause: StreamTerminalCause): void {
    cancelPendingRetry();
    supersedeAttempt();
    applyStreamEvent({ kind: "give-up", cause });
  }

  function handleFailedAttempt(): void {
    supersedeAttempt();
    consecutiveFailedAttemptCount += 1;
    applyStreamEvent({ kind: "close" });
    if (!handshakeEverSucceeded) {
      initialProbeFailureCount += 1;
      if (initialProbeFailureCount >= INITIAL_PROBE_ATTEMPT_LIMIT) {
        enterTerminalState("handshake-exhausted");
        return;
      }
    }
    scheduleRetry();
  }

  function scheduleRetry(): void {
    pendingRetryHandle = timer.set(
      () => {
        pendingRetryHandle = null;
        startAttempt();
      },
      computeRetryDelayMs(consecutiveFailedAttemptCount, random),
    );
  }

  function startAttempt(): void {
    supersedeAttempt();
    const attempt: Attempt = {
      generation: liveAttemptGeneration,
      coldStart: createColdStart(),
      join: { status: "buffering" },
      handshake: "opening",
    };
    liveAttempt = attempt;
    applyStreamEvent({ kind: "connect" });

    const handle = openSocket(endpoints.streamUrl, {
      onOpen: () => {
        handleSocketOpen(attempt);
      },
      onMessage: (frameText) => {
        handleSocketMessage(attempt, frameText);
      },
      onClose: () => {
        handleSocketClose(attempt);
      },
    });
    // A port that opened, joined and failed inside the call above has already superseded
    // this attempt; adopting its handle now would leave a socket nothing closes.
    if (isSuperseded(attempt)) {
      handle.close();
      return;
    }
    activeSocketHandle = handle;
  }

  function handleSocketOpen(attempt: Attempt): void {
    if (isSuperseded(attempt)) return;
    attempt.handshake = "open";
    handshakeEverSucceeded = true;
    initialProbeFailureCount = 0;
    applyStreamEvent({ kind: "open", at: Date.now() });
    void joinWithSnapshot(attempt);
  }

  async function joinWithSnapshot(attempt: Attempt): Promise<void> {
    const snapshotOutcome = await fetchFleetSnapshot(fetchLike, endpoints.snapshotUrl);
    // A snapshot that outlived its attempt describes a fleet this buffer no longer
    // matches; the live attempt fetches its own.
    if (isSuperseded(attempt)) return;

    if (snapshotOutcome.ok) {
      settleIntoJoinedStream(attempt, snapshotOutcome.snapshot);
      return;
    }
    handleSnapshotFailure(snapshotOutcome.failure);
  }

  function settleIntoJoinedStream(attempt: Attempt, snapshot: FleetSnapshot): void {
    const settlement = attempt.coldStart.settle(snapshot);
    attempt.join = { status: "joined", epoch: toReconciliationEpoch(settlement.snapshot) };
    handlers.onSnapshot(settlement.snapshot);
    for (const batch of settlement.replay) {
      handlers.onBatch(batch);
    }

    if (settlement.mismatched > 0) {
      enterTerminalState("session-mismatch");
      return;
    }

    consecutiveFailedAttemptCount = 0;
    applyStreamEvent({ kind: "joined" });
  }

  function handleSnapshotFailure(failure: RequestFailure): void {
    if (failure.kind === "contract") {
      handlers.onTerminalError(failure.issues);
      enterTerminalState("contract");
      return;
    }
    handleFailedAttempt();
  }

  function handleSocketMessage(attempt: Attempt, frameText: string): void {
    if (isSuperseded(attempt)) return;
    const decodedFrame = decodeFrameText(frameText);
    if (!decodedFrame.ok) {
      handlers.onFrameRejected();
      return;
    }
    routeBatchByJoinStatus(attempt, decodedFrame.batch);
  }

  function routeBatchByJoinStatus(attempt: Attempt, batch: TelemetryBatch): void {
    const { join } = attempt;
    switch (join.status) {
      case "buffering":
        bufferUntilSnapshot(attempt, batch);
        return;
      case "joined":
        routeBatchByReconciliation(join.epoch, batch);
        return;
    }
  }

  function bufferUntilSnapshot(attempt: Attempt, batch: TelemetryBatch): void {
    switch (attempt.coldStart.receive(batch)) {
      case "buffered":
        return;
      case "overflowed":
        handleFailedAttempt();
        return;
    }
  }

  function routeBatchByReconciliation(epoch: ReconciliationEpoch, batch: TelemetryBatch): void {
    switch (reconcileDeltaWithSnapshot(epoch, batch)) {
      case "apply":
        handlers.onBatch(batch);
        return;
      case "covered":
        return;
      case "session-mismatch":
        enterTerminalState("session-mismatch");
        return;
    }
  }

  function handleSocketClose(attempt: Attempt): void {
    if (isSuperseded(attempt)) return;
    activeSocketHandle = null;
    liveAttempt = null;
    if (attempt.join.status !== "joined") {
      handleFailedAttempt();
      return;
    }
    applyStreamEvent({ kind: "close" });
    startAttempt();
  }

  return {
    get state(): StreamState {
      return streamState;
    },

    connect(): void {
      if (liveAttempt?.handshake === "open") return;
      cancelPendingRetry();
      initialProbeFailureCount = 0;
      startAttempt();
    },

    disconnect(): void {
      cancelPendingRetry();
      supersedeAttempt();
      consecutiveFailedAttemptCount = 0;
      initialProbeFailureCount = 0;
      applyStreamEvent({ kind: "disconnect" });
    },
  };
}

/** Keeps only what reconciliation reads, so a join does not retain the whole fleet. */
function toReconciliationEpoch(snapshot: FleetSnapshot): ReconciliationEpoch {
  return {
    serverSessionId: snapshot.serverSessionId,
    flushSequence: snapshot.flushSequence,
  };
}
