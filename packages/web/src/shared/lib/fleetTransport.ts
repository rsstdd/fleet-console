import type { ContractIssue, FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { createColdStart } from "./coldStart";
import type { StreamConnectionState } from "./connectionContext";
import {
  INITIAL_STREAM_STATE,
  nextStreamState,
  publishedConnectionState,
  type StreamState,
} from "./streamLifecycle";
import { decodeFrameText, fetchFleetSnapshot, type FetchLike } from "./transportDecoding";

/**
 * The stream client: socket first, snapshot second, reconcile, then apply.
 *
 * It composes four units that were each decided and tested on their own — `coldStart` for
 * the joining order, `streamLifecycle` for the state matrix, `transportDecoding` for the
 * boundary, and the published projection ADR 23 fixes — and adds only the sequencing
 * between them. That split is deliberate: the sequencing is the part with no pure test,
 * so everything that could be tested without a socket already was.
 *
 * **The order is the contract.** Open, buffer, fetch, discard what the snapshot covers,
 * replay the rest. Fetching first loses every delta emitted in the gap, and the symptom is
 * a row that quietly stops updating rather than an error (server TODO **H3b**).
 *
 * It emits decoded values and never touches a store: `shared` may not import `entities`
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

/** Everything the transport reports outward. */
export interface FleetTransportHandlers {
  /** The initial fleet, already reconciled; replaces whatever the caller held. */
  onSnapshot: (snapshot: FleetSnapshot) => void;
  /** One decoded frame, in order, including buffered ones replayed after the snapshot. */
  onBatch: (batch: TelemetryBatch) => void;
  onConnectionState: (state: StreamConnectionState) => void;
  /** A body this console cannot read. Terminal: retrying returns the same bytes (**W-6**). */
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
  /** Opens the socket and begins the joining sequence. */
  connect(): void;
  /** Closes the socket without reporting a failure. */
  disconnect(): void;
  /** The transport's full state, which is richer than what it publishes. */
  readonly state: StreamState;
}

/** Composes the joining sequence over an injected socket and fetch. */
export function createFleetTransport(options: {
  readonly endpoints: FleetTransportEndpoints;
  readonly openSocket: OpenSocket;
  readonly fetchLike: FetchLike;
  readonly handlers: FleetTransportHandlers;
}): FleetTransport {
  const { endpoints, openSocket, fetchLike, handlers } = options;
  let state = INITIAL_STREAM_STATE;
  let socket: SocketHandle | null = null;
  let coldStart = createColdStart();
  /** Guards a snapshot landing after the socket it belongs to has already closed. */
  let generation = 0;

  function advance(event: Parameters<typeof nextStreamState>[1]): void {
    const previous = publishedConnectionState(state);
    state = nextStreamState(state, event);
    const next = publishedConnectionState(state);
    if (next !== previous) handlers.onConnectionState(next);
  }

  async function loadSnapshot(attempt: number): Promise<void> {
    const outcome = await fetchFleetSnapshot(fetchLike, endpoints.snapshotUrl);
    // The socket closed or reconnected while this was in flight, so this snapshot describes
    // a fleet the buffer no longer matches. Dropping it is correct; the new connection
    // fetches its own.
    if (attempt !== generation) return;

    if (!outcome.ok) {
      if (outcome.failure.kind === "contract") {
        handlers.onTerminalError(outcome.failure.issues);
        advance({ kind: "give-up" });
      }
      // An `unreachable` snapshot leaves the socket open and the state unchanged: the
      // stream may still be delivering, and reporting a connection failure for a failed
      // HTTP read would blame the wrong transport. The caller retries.
      return;
    }

    const settled = coldStart.settle(outcome.snapshot);
    handlers.onSnapshot(settled.snapshot);
    for (const batch of settled.replay) handlers.onBatch(batch);
  }

  return {
    get state(): StreamState {
      return state;
    },

    connect(): void {
      if (state.phase === "connected") return;
      generation += 1;
      const attempt = generation;
      coldStart = createColdStart();
      advance({ kind: "connect" });

      socket = openSocket(endpoints.streamUrl, {
        onOpen: () => {
          advance({ kind: "open", at: Date.now() });
          // Only now, so nothing flushed between the upgrade and this point is lost.
          void loadSnapshot(attempt);
        },

        onMessage: (data) => {
          const decoded = decodeFrameText(data);
          if (!decoded.ok) {
            handlers.onFrameRejected();
            return;
          }
          if (coldStart.receive(decoded.batch) === "live") handlers.onBatch(decoded.batch);
        },

        onClose: () => {
          socket = null;
          // Not from `failed`: a socket closing after the client gave up is the
          // consequence, and re-reporting it would move the state backwards.
          if (state.phase !== "failed") advance({ kind: "close" });
        },
      });
    },

    disconnect(): void {
      generation += 1;
      socket?.close();
      socket = null;
    },
  };
}
