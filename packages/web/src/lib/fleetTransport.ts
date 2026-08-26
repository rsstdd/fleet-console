import {
  type ContractIssue,
  type FleetSnapshot,
  type ReconciliationEpoch,
  reconcileDeltaWithSnapshot,
  type TelemetryBatch,
} from "@fleet/contracts";
import {
  decodeFrameText,
  fetchFleetSnapshot,
  type FetchLike,
  type RequestFailure,
} from "@/lib/transportDecoding";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";
export type TerminalCause = "handshake-exhausted" | "contract" | "session-mismatch";

export interface StreamState {
  readonly phase: "idle" | "connecting" | "connected" | "reconnecting" | "failed";
  readonly attempt: number;
  readonly lastConnectedAt: number | null;
  readonly terminalCause: TerminalCause | null;
}

export const INITIAL_STREAM_STATE: StreamState = {
  phase: "idle",
  attempt: 0,
  lastConnectedAt: null,
  terminalCause: null,
};

export function publishedConnectionState(state: StreamState): ConnectionState {
  switch (state.phase) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    default:
      return "disconnected";
  }
}

export const INITIAL_PROBE_ATTEMPT_LIMIT = 3;
export const COLD_START_BUFFER_LIMIT = 1000;
const RETRY_BASE_DELAY_MS = 1000;
const RETRY_DELAY_CEILING_MS = 30_000;

/** Full jitter prevents clients from retrying a restarted server in lockstep. */
export function computeRetryDelayMs(failedAttempts: number, random: () => number): number {
  const exponent = Math.min(Math.max(failedAttempts, 1) - 1, 15);
  return random() * Math.min(RETRY_DELAY_CEILING_MS, RETRY_BASE_DELAY_MS * 2 ** exponent);
}

export interface SocketHandle {
  close(): void;
}
export interface SocketHandlers {
  readonly onOpen: () => void;
  readonly onMessage: (frameText: string) => void;
  readonly onClose: () => void;
}
export type OpenSocket = (url: string, handlers: SocketHandlers) => SocketHandle;

export interface FleetTransportOptions {
  readonly endpoints: { readonly snapshotUrl: string; readonly streamUrl: string };
  readonly openSocket: OpenSocket;
  readonly fetchLike: FetchLike;
  readonly handlers: {
    readonly onSnapshot: (snapshot: FleetSnapshot) => void;
    readonly onBatch: (batch: TelemetryBatch) => void;
    readonly onConnectionState: (published: ConnectionState, state: StreamState) => void;
    readonly onTerminalError: (issues: readonly ContractIssue[]) => void;
    readonly onFrameRejected: () => void;
  };
  readonly timer?: {
    set(onElapsed: () => void, delayMs: number): number;
    clear(handle: number): void;
  };
  readonly random?: () => number;
}

export interface FleetTransport {
  connect(): void;
  disconnect(): void;
  readonly state: StreamState;
}

interface Attempt {
  readonly generation: number;
  buffered: TelemetryBatch[];
  join:
    | { readonly status: "buffering" }
    | { readonly status: "joined"; readonly epoch: ReconciliationEpoch };
  handshake: "opening" | "open";
}

/** Open and buffer before fetching; reversing this order loses in-flight deltas. */
export function createFleetTransport(options: FleetTransportOptions): FleetTransport {
  const {
    endpoints,
    openSocket,
    fetchLike,
    handlers,
    timer = {
      set: (onElapsed, delayMs) => setTimeout(onElapsed, delayMs) as unknown as number,
      clear: (handle) => {
        clearTimeout(handle);
      },
    },
    random = Math.random,
  } = options;

  let streamState = INITIAL_STREAM_STATE;
  let attempt: Attempt | null = null;
  let socket: SocketHandle | null = null;
  let generation = 0;
  let retryHandle: number | null = null;
  let handshakeEverSucceeded = false;
  let probeFailures = 0;
  let consecutiveFailures = 0;

  function setState(next: StreamState): void {
    const changed =
      next.phase !== streamState.phase ||
      next.attempt !== streamState.attempt ||
      next.lastConnectedAt !== streamState.lastConnectedAt ||
      next.terminalCause !== streamState.terminalCause;
    streamState = next;
    if (changed) {
      handlers.onConnectionState(publishedConnectionState(next), next);
    }
  }

  const pendingPhase = (): "connecting" | "reconnecting" =>
    streamState.lastConnectedAt === null ? "connecting" : "reconnecting";

  function cancelRetry(): void {
    if (retryHandle !== null) {
      timer.clear(retryHandle);
      retryHandle = null;
    }
  }

  function supersede(): void {
    generation += 1;
    socket?.close();
    socket = null;
    attempt = null;
  }

  const isSuperseded = (candidate: Attempt): boolean => candidate.generation !== generation;

  function enterTerminal(cause: TerminalCause): void {
    cancelRetry();
    supersede();
    setState({ ...streamState, phase: "failed", terminalCause: cause });
  }

  function failAttempt(): void {
    supersede();
    consecutiveFailures += 1;
    setState({ ...streamState, phase: pendingPhase(), terminalCause: null });
    if (!handshakeEverSucceeded) {
      probeFailures += 1;
      if (probeFailures >= INITIAL_PROBE_ATTEMPT_LIMIT) {
        enterTerminal("handshake-exhausted");
        return;
      }
    }
    cancelRetry();
    retryHandle = timer.set(
      () => {
        retryHandle = null;
        start();
      },
      computeRetryDelayMs(consecutiveFailures, random),
    );
  }

  function start(): void {
    supersede();
    const current: Attempt = {
      generation,
      buffered: [],
      join: { status: "buffering" },
      handshake: "opening",
    };
    attempt = current;
    setState({
      ...streamState,
      phase: pendingPhase(),
      attempt: streamState.attempt + 1,
      terminalCause: null,
    });

    const handle = openSocket(endpoints.streamUrl, {
      onOpen: () => {
        if (isSuperseded(current)) {
          return;
        }
        current.handshake = "open";
        handshakeEverSucceeded = true;
        probeFailures = 0;
        setState({
          ...streamState,
          phase: "connected",
          lastConnectedAt: Date.now(),
          terminalCause: null,
        });
        void join(current);
      },
      onMessage: (frameText) => {
        if (isSuperseded(current)) {
          return;
        }
        const frame = decodeFrameText(frameText);
        if (!frame.ok) {
          handlers.onFrameRejected();
          return;
        }
        route(current, frame.batch);
      },
      onClose: () => {
        if (isSuperseded(current)) {
          return;
        }
        socket = null;
        attempt = null;
        if (current.join.status !== "joined") {
          failAttempt();
          return;
        }
        setState({ ...streamState, phase: pendingPhase(), terminalCause: null });
        start();
      },
    });

    if (isSuperseded(current)) {
      handle.close();
      return;
    }
    socket = handle;
  }

  async function join(current: Attempt): Promise<void> {
    const outcome = await fetchFleetSnapshot(fetchLike, endpoints.snapshotUrl);
    if (isSuperseded(current)) {
      return;
    }
    if (!outcome.ok) {
      handleSnapshotFailure(outcome.failure);
      return;
    }

    const snapshot = outcome.value;
    const epoch: ReconciliationEpoch = {
      serverSessionId: snapshot.serverSessionId,
      flushSequence: snapshot.flushSequence,
    };
    current.join = { status: "joined", epoch };
    handlers.onSnapshot(snapshot);

    let mismatched = 0;
    for (const batch of current.buffered) {
      switch (reconcileDeltaWithSnapshot(snapshot, batch)) {
        case "apply":
          handlers.onBatch(batch);
          break;
        case "session-mismatch":
          mismatched += 1;
          break;
        case "covered":
          break;
      }
    }
    current.buffered = [];

    if (mismatched > 0) {
      enterTerminal("session-mismatch");
      return;
    }
    consecutiveFailures = 0;
    setState({ ...streamState, attempt: 0 });
  }

  function handleSnapshotFailure(failure: RequestFailure): void {
    if (failure.kind === "contract") {
      handlers.onTerminalError(failure.issues);
      enterTerminal("contract");
      return;
    }
    failAttempt();
  }

  function route(current: Attempt, batch: TelemetryBatch): void {
    const { join: joinState } = current;
    if (joinState.status === "buffering") {
      if (current.buffered.length >= COLD_START_BUFFER_LIMIT) {
        failAttempt();
        return;
      }
      current.buffered.push(batch);
      return;
    }
    switch (reconcileDeltaWithSnapshot(joinState.epoch, batch)) {
      case "apply":
        current.join = {
          status: "joined",
          epoch: {
            serverSessionId: joinState.epoch.serverSessionId,
            flushSequence: batch.flushSequence,
          },
        };
        handlers.onBatch(batch);
        return;
      case "session-mismatch":
        enterTerminal("session-mismatch");
        return;
      case "covered":
        return;
    }
  }

  return {
    get state(): StreamState {
      return streamState;
    },
    connect(): void {
      if (attempt?.handshake === "open") {
        return;
      }
      cancelRetry();
      probeFailures = 0;
      start();
    },
    disconnect(): void {
      cancelRetry();
      supersede();
      consecutiveFailures = 0;
      probeFailures = 0;
      setState({ ...streamState, phase: "idle", attempt: 0, terminalCause: null });
    },
  };
}
