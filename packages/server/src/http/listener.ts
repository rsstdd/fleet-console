import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { WebSocketServer } from "ws";

import type { FanOutClient } from "../fanout/deltaFanOut.ts";

/**
 * The process's one listener: HTTP and WebSocket on a single port, with a shutdown
 * that closes them in the order that does not drop frames.
 *
 * One port because two is two things to configure, document and get wrong in a
 * one-command local start (ADR 8 § Constraints). `@hono/node-server` exists precisely to
 * expose the underlying `http.Server`, and `ws` attaches to its `upgrade` event — that
 * adapter layer is the honest price ADR 8 names for choosing a Web-standard router on a
 * runtime whose server is not Web-standard.
 *
 * Separate from the composition root. This module takes an already-built app and an
 * already-validated host and port, so the lifecycle is testable against a real socket
 * without a process, a signal handler, or a configuration file.
 */

/** The stream path clients upgrade on. */
// Fixed by the console's tenant profile (`endpoints.streamUrl`) and by the `ws: true`
// entry in its Vite proxy; changing it is a two-package change (ADR 21 § Implications).
const STREAM_PATH = "/ws";

/** What the listener needs to bind. */
export interface ListenerOptions {
  /** The router to serve; `createHttpApp` builds it. */
  readonly app: Hono;
  /** Bind address from `RuntimeEndpoints.host` — never a literal (ADR 21). */
  readonly host: string;
  /**
   * Port from `RuntimeEndpoints.port`.
   *
   * `0` is accepted here and refused by `parseRuntimeEndpoints`. That is not an
   * inconsistency: the configuration refuses it because a *deployer* who asks for any free
   * port leaves the console and the simulator unable to address the server, while a caller
   * that reads `port` back off the returned value — which is what the tests do — has no
   * such problem.
   */
  readonly port: number;
  /**
   * Registers and forgets a console as its stream opens and closes.
   *
   * A pair of callbacks rather than the fan-out itself, so this module keeps knowing
   * nothing about deltas: it turns an upgrade into a `send`/`close` pair and hands it
   * over. Absent in tests that only exercise HTTP.
   */
  readonly streams?: {
    readonly open: (client: FanOutClient) => void;
    readonly close: (client: FanOutClient) => void;
  };
}

/** A bound listener, and the only supported way to unbind it. */
export interface RunningListener {
  /** The port actually bound, which differs from the requested one only when `0` was asked for. */
  readonly port: number;
  /** Connected stream clients currently registered with fan-out. */
  readonly streamClientCount: number;
  /** Closes stream clients, then the server, resolving when the port is free. */
  close(): Promise<void>;
}

/**
 * Binds the port and resolves once the socket is accepting connections.
 *
 * Upgrades are handled with `noServer: true` and an explicit path check rather than by
 * handing `ws` the whole server, so a request to any other path is destroyed instead of
 * being upgraded into a stream that no code reads. A permissive upgrade is a connection
 * the fan-out never writes to and the client waits on forever.
 *
 * **The upgrade is not origin-checked.** CORS does not apply to a WebSocket handshake and
 * `ws` checks nothing itself, so `/ws` is reachable from any origin while `/api` is
 * governed by `evaluateOriginPolicy`. That gap is deliberate and unresolved — see the
 * WebSocket-origin item in `packages/server/TODO.md`. It requires an explicit transport
 * policy; copying the HTTP CORS middleware here would neither authenticate the peer nor
 * settle whether the same allow-list should govern both surfaces.
 */
export async function startListener(options: ListenerOptions): Promise<RunningListener> {
  const streams = new WebSocketServer({ noServer: true });

  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const started = serve(
      { fetch: options.app.fetch, hostname: options.host, port: options.port },
      () => {
        resolve(started);
      },
    );
  });

  // The parameters are annotated because `ServerType` is a union of Node's HTTP and HTTP/2
  // servers, whose `on` overload widens an unrecognized event's arguments to `any` —
  // which this package's lint rules reject rather than let through as a silent cast.
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const path = new URL(request.url ?? "/", `http://${options.host}`).pathname;
    if (path !== STREAM_PATH) {
      socket.destroy();
      return;
    }
    streams.handleUpgrade(request, socket, head, (socketClient) => {
      streams.emit("connection", socketClient, request);

      const client: FanOutClient = {
        send: (frame) => {
          socketClient.send(frame);
        },
        close: () => {
          socketClient.close();
        },
      };
      options.streams?.open(client);
      socketClient.on("close", () => {
        options.streams?.close(client);
      });
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    port,
    get streamClientCount(): number {
      return streams.clients.size;
    },
    close: async () => {
      // Clients first. ADR 8 § Implications: the HTTP server and the socket share a
      // lifecycle, and closing the server out from under an open client drops whatever
      // frame was in flight on a listener that no longer exists.
      for (const client of streams.clients) {
        client.close();
      }
      await new Promise<void>((resolve) => {
        streams.close(() => {
          resolve();
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
