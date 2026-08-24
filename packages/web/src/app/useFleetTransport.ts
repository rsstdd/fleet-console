import { useCallback, useEffect, useState } from "react";

import { TENANT } from "@/config/tenant";
import { createFleetStore, type FleetStore } from "@/stores/fleetStore";
import {
  createFleetTransport,
  type FleetTransport,
  type OpenSocket,
  type RetryTimer,
} from "@/lib/fleetTransport";
import type { StreamConnectionState } from "@/context/connectionContext";
import {
  INITIAL_STREAM_STATE,
  selectPublishedConnectionState,
  type StreamState,
  type StreamTerminalCause,
} from "@/lib/streamLifecycle";
import type { FetchLike } from "@/lib/transportDecoding";

/**
 * The transport boundary: the one place the console owns a socket.
 *
 * `app` owns transport lifecycle (ADR 23), which is why this hook lives here rather than
 * in a feature — and why the connection state it produces travels back down through
 * `ConnectionContext` instead of through props on every route.
 *
 * This is also where the fleet store receives its explicit resource
 * transitions — snapshot-start, snapshot-success, recoverable-failure,
 * terminal-failure, and batches. The transport reports what happened; the
 * fleet store decides what that means for the fleet surface, and no
 * other layer writes to it (Principle 11).
 *
 * The ports are injectable because a hook that constructed a real `WebSocket` could only
 * be tested in a browser, and every rule worth asserting here — that the socket opens
 * before the snapshot is fetched, that a terminal decode does not retry, that unmounting
 * closes the socket — is about sequencing rather than about the network.
 */

/** What the shell needs to render the banner and what the fleet needs to render rows. */
export interface FleetTransportState {
  readonly store: FleetStore;
  readonly connectionState: StreamConnectionState;
  /** When the stream last opened, for the banner's "last event" copy. Null before then. */
  readonly lastEventAt: number | null;
  /** Attempts since the last completed join, so the retry control is visibly working. */
  readonly attempt: number;
  /** Why the transport stopped retrying, for the banner's terminal copy (ADR 31). */
  readonly terminalCause: StreamTerminalCause | null;
  /**
   * Frames dropped for failing to decode this session, across all robots.
   * Published to technician diagnostics through `StreamDiagnosticsContext`,
   * never to the fleet table.
   */
  readonly rejectedFrames: number;
  /** Forces a connection attempt. The banner's control calls this. */
  readonly retry: () => void;
}

/** Opens a real browser socket. The default port; tests pass their own. */
const openBrowserSocket: OpenSocket = (url, handlers) => {
  const socket = new WebSocket(url, []);
  socket.addEventListener("open", () => {
    handlers.onOpen();
  });
  socket.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (typeof event.data === "string") handlers.onMessage(event.data);
  });
  // `close` covers the error case too: a socket that errors always closes, and treating
  // them as one event keeps the lifecycle from needing a state for "errored but open".
  socket.addEventListener("close", () => {
    handlers.onClose();
  });
  return {
    close: () => {
      socket.close();
    },
  };
};

/**
 * Builds an absolute stream URL from the tenant's same-origin path.
 *
 * `TENANT.endpoints.streamUrl` ships as `/ws`, which `WebSocket` cannot take — it needs a
 * scheme. The origin comes from the page, never from configuration: the console learning
 * the server's real address is what would make its requests cross-origin, and ADR 21's dev
 * proxy exists precisely so it never has to.
 *
 * @param path - `TENANT.endpoints.streamUrl`. An absolute `ws://` or `wss://` value is
 *   returned unchanged; anything else is resolved as a reference against `origin`, which
 *   is how the shipped `/ws` becomes a same-origin socket address.
 * @param origin - The page's own origin, whose `http` scheme is rewritten to `ws`. Pass
 *   `window.location.origin`, never a configured host — see above.
 * @returns An absolute `ws://` or `wss://` URL, the only form `WebSocket` accepts.
 */
export function resolveStreamUrl(path: string, origin: string): string {
  if (path.startsWith("ws://") || path.startsWith("wss://")) return path;
  return new URL(path, origin.replace(/^http/, "ws")).toString();
}

/**
 * Connects on mount, disconnects on unmount, and publishes what the shell renders.
 *
 * @param ports - Replaceable boundaries, each defaulted to the real browser one.
 *   Supplying any is a test affordance, and they are read once when the transport is
 *   built: changing them after mount has no effect, deliberately, because rebuilding
 *   the transport would drop the open socket.
 * @returns The published transport state, rebuilt on every lifecycle transition.
 *   `store` and `retry` hold their identity for the whole mount so subscribers and the
 *   banner's control do not churn; the connection fields move with the socket.
 */
export function useFleetTransport(
  ports: {
    readonly openSocket?: OpenSocket;
    readonly fetchLike?: FetchLike;
    /** Injected by tests so the ADR 31 retry schedule runs on fake time. */
    readonly timer?: RetryTimer;
    readonly random?: () => number;
  } = {},
): FleetTransportState {
  // Lazy state owns this identity-critical resource for the lifetime of the mount.
  // Its setter is intentionally unavailable: replacing the store is not a supported
  // transition, and the scoped state convention documents that narrow exception.
  const [store] = useState(() => createFleetStore());
  // One piece of state, because the published value and the attempt count are two views
  // of one fact and holding them separately is how they come to disagree.
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const [rejectedFrames, setRejectedFrames] = useState(0);

  // Built once per mount, capturing the first render's ports. Rebuilding on a state
  // change would drop the open socket and restart the joining sequence on every frame,
  // so — as with `store` above — the setter is intentionally unavailable.
  const [transport] = useState<FleetTransport>(() => {
    // Named before creation so the retry closure handed to the store can call
    // back into the transport it belongs to; the closure only runs on a
    // banner click, long after this factory has returned.
    const created: FleetTransport = createFleetTransport({
      endpoints: {
        snapshotUrl: `${TENANT.endpoints.apiBaseUrl}/fleet`,
        streamUrl: resolveStreamUrl(TENANT.endpoints.streamUrl, window.location.origin),
      },
      openSocket: ports.openSocket ?? openBrowserSocket,
      fetchLike: ports.fetchLike ?? ((url) => fetch(url)),
      timer: ports.timer,
      random: ports.random,
      handlers: {
        onSnapshot: (snapshot) => {
          store.applySnapshot(snapshot);
        },
        onBatch: (batch) => {
          store.applyBatch(batch);
        },
        onConnectionState: (_published, next) => {
          setStreamState(next);
          // The explicit resource transitions, derived once at this boundary.
          // An attempt in flight is a pending snapshot; a terminal phase with
          // a retryable cause is the recoverable resource error. The contract
          // cause is excluded because `onTerminalError` below already carried
          // its issues to the store.
          if (next.phase === "connecting" || next.phase === "reconnecting") {
            store.snapshotStart();
          }
          if (
            next.phase === "failed" &&
            next.terminalCause !== null &&
            next.terminalCause !== "contract"
          ) {
            store.recoverableFailure({ cause: next.terminalCause }, () => {
              created.connect();
            });
          }
        },
        onTerminalError: (issues) => {
          store.terminalFailure(issues);
        },
        onFrameRejected: () => {
          setRejectedFrames((count) => count + 1);
        },
      },
    });
    return created;
  });

  // Binds the external WebSocket's lifecycle to this mount's. `transport` never changes
  // identity, so this runs exactly once; cleanup disconnects, which is what stops a
  // StrictMode double-mount, a route teardown, or a hot reload from leaving a second
  // socket streaming into a store nothing renders any more.
  useEffect(() => {
    transport.connect();
    return () => {
      transport.disconnect();
    };
  }, [transport]);

  // Stable per mount (transport never changes identity), so the banner's retry
  // control does not re-render on every stream-state change.
  const retry = useCallback(() => {
    transport.connect();
  }, [transport]);

  return {
    store,
    connectionState: selectPublishedConnectionState(streamState),
    lastEventAt: streamState.lastConnectedAt,
    attempt: streamState.attempt,
    terminalCause: streamState.terminalCause,
    rejectedFrames,
    retry,
  };
}
