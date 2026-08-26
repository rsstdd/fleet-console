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

/** Keeps connection truth and fleet data separate while publishing both from one boundary. */
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
 * Resolves tenant stream addresses against the page origin and maps HTTP schemes to their
 * WebSocket equivalents. Coupling: `config/tenant.ts` admits exactly these four schemes.
 */
export function resolveStreamUrl(path: string, origin: string): string {
  const resolved = new URL(path, origin);
  if (resolved.protocol === "http:") {
    resolved.protocol = "ws:";
  } else if (resolved.protocol === "https:") {
    resolved.protocol = "wss:";
  }
  return resolved.toString();
}

/**
 * Owns one transport and store per mount. Injected ports are captured on the first render;
 * replacing them would discard the active socket.
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
  // Store identity is fixed for this mount; replacement is not a supported transition.
  const [store] = useState(() => createFleetStore());
  // Published connection state and attempt count must transition together.
  const [streamState, setStreamState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const [rejectedFrames, setRejectedFrames] = useState(0);

  // Transport identity is fixed so renders cannot restart the joining sequence.
  const [transport] = useState<FleetTransport>(() => {
    // The deferred retry closure needs the transport being constructed here.
    const created: FleetTransport = createFleetTransport({
      endpoints: {
        snapshotUrl: `${TENANT.endpoints.apiBaseUrl}/fleet`,
        streamUrl: resolveStreamUrl(TENANT.endpoints.streamUrl, window.location.origin),
      },
      openSocket: ports.openSocket ?? openBrowserSocket,
      fetchLike: ports.fetchLike ?? ((url) => fetch(url)),
      ...(ports.timer === undefined ? {} : { timer: ports.timer }),
      ...(ports.random === undefined ? {} : { random: ports.random }),
      handlers: {
        onSnapshot: (snapshot) => {
          store.applySnapshot(snapshot);
        },
        onBatch: (batch) => {
          store.applyBatch(batch);
        },
        onConnectionState: (_published, next) => {
          setStreamState(next);
          // Contract failures arrive through onTerminalError; only other terminal causes retry.
          if (next.phase === "connecting" || next.phase === "reconnecting") {
            store.snapshotStart();
          }
          if (next.phase === "failed" && next.terminalCause !== "contract") {
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

  // transport is mount-stable; cleanup prevents WebSocket replay or teardown duplication.
  useEffect(() => {
    transport.connect();
    return () => {
      transport.disconnect();
    };
  }, [transport]);

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
