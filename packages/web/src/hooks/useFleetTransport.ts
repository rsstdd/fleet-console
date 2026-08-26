import { useEffect, useMemo, useState } from "react";
import { readEndpoints } from "@/config/endpoints";
import type { FleetContextValue } from "@/context/fleetContext";
import { type ConnectionState, createFleetTransport, type OpenSocket } from "@/lib/fleetTransport";
import { createFleetStore } from "@/stores/fleetStore";

const browserSocket: OpenSocket = (url, handlers) => {
  const socket = new WebSocket(url);
  socket.addEventListener("open", handlers.onOpen);
  socket.addEventListener("close", handlers.onClose);
  socket.addEventListener("message", (event: MessageEvent<string>) => {
    handlers.onMessage(event.data);
  });
  return {
    close: () => {
      socket.close();
    },
  };
};

/** Owns the app's single transport; views read the store it feeds. */
export function useFleetTransport(openSocket: OpenSocket = browserSocket): FleetContextValue {
  const [store] = useState(createFleetStore);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [rejectedFrames, setRejectedFrames] = useState(0);
  const endpoints = useMemo(() => readEndpoints(), []);

  useEffect(() => {
    const transport = createFleetTransport({
      endpoints,
      openSocket,
      fetchLike: (url) => fetch(url),
      handlers: {
        onSnapshot: (snapshot) => {
          store.applySnapshot(snapshot);
        },
        onBatch: (batch) => {
          store.applyBatch(batch);
        },
        onConnectionState: (published, state) => {
          setConnection(published);
          if (state.phase === "failed") {
            store.recoverableFailure(state.terminalCause ?? "disconnected");
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
    transport.connect();
    return () => {
      transport.disconnect();
    };
  }, [endpoints, openSocket, store]);

  return useMemo(
    () => ({ store, connection, rejectedFrames }),
    [store, connection, rejectedFrames],
  );
}
