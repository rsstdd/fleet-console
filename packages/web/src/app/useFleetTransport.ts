import { useEffect, useMemo, useState } from "react";

import type { ContractIssue } from "@fleet/contracts";

import { TENANT } from "@/config/tenant";
import { createFleetStore, type FleetStore } from "@/entities/robot/fleetStore";
import {
  createFleetTransport,
  type FleetTransport,
  type OpenSocket,
  type RetryTimer,
} from "@/shared/lib/fleetTransport";
import type { StreamConnectionState } from "@/shared/lib/connectionContext";
import {
  INITIAL_STREAM_STATE,
  publishedConnectionState,
  type StreamState,
  type StreamTerminalCause,
} from "@/shared/lib/streamLifecycle";
import type { FetchLike } from "@/shared/lib/transportDecoding";

/**
 * The transport boundary: the one place the console owns a socket.
 *
 * `app` owns transport lifecycle (ADR 23), which is why this hook lives here rather than
 * in a feature — and why the connection state it produces travels back down through
 * `ConnectionContext` instead of through props on every route.
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
  /** Set when the server sent a body this console cannot read. Terminal (**W-6**). */
  readonly contractFailure: readonly ContractIssue[] | null;
  /** Frames dropped for failing to decode; a diagnostics number, never a fleet-table one. */
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
 * proxy exists precisely so it never has to (fleet TODO **A3**).
 */
export function resolveStreamUrl(path: string, origin: string): string {
  if (path.startsWith("ws://") || path.startsWith("wss://")) return path;
  return new URL(path, origin.replace(/^http/, "ws")).toString();
}

/** Connects on mount, disconnects on unmount, and publishes what the shell renders. */
export function useFleetTransport(
  ports: {
    readonly openSocket?: OpenSocket;
    readonly fetchLike?: FetchLike;
    /** Injected by tests so the ADR 31 retry schedule runs on fake time. */
    readonly timer?: RetryTimer;
    readonly random?: () => number;
  } = {},
): FleetTransportState {
  const store = useMemo(() => createFleetStore(), []);
  // One piece of state, because the published value and the attempt count are two views
  // of one fact and holding them separately is how they come to disagree.
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const [contractFailure, setContractFailure] = useState<readonly ContractIssue[] | null>(null);
  const [rejectedFrames, setRejectedFrames] = useState(0);

  const transport = useMemo<FleetTransport>(
    () =>
      createFleetTransport({
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
          },
          onTerminalError: setContractFailure,
          onFrameRejected: () => {
            setRejectedFrames((count) => count + 1);
          },
        },
      }),
    // Built once per mount. Rebuilding on a state change would drop the open socket and
    // restart the joining sequence on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store],
  );

  useEffect(() => {
    transport.connect();
    return () => {
      transport.disconnect();
    };
  }, [transport]);

  return {
    store,
    connectionState: publishedConnectionState(streamState),
    lastEventAt: streamState.lastConnectedAt,
    attempt: streamState.attempt,
    terminalCause: streamState.terminalCause,
    contractFailure,
    rejectedFrames,
    retry: () => {
      // Clearing the terminal failure is what makes the retry honest: leaving it set would
      // show an error banner over a connection that is trying again.
      setContractFailure(null);
      transport.connect();
    },
  };
}
