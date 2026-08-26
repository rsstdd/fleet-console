import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { WebSocketServer } from "ws";
import type { FanOutClient } from "../fanout.ts";

const STREAM_PATH = "/ws";

export interface ListenerOptions {
  readonly app: Hono;
  readonly host: string;
  readonly port: number;
  readonly streams?: {
    readonly open: (client: FanOutClient) => void;
    readonly close: (client: FanOutClient) => void;
  };
  readonly onStreamError?: (error: Error) => void;
}

export interface RunningListener {
  readonly port: number;
  readonly streamClientCount: number;
  close(): Promise<void>;
}

export async function startListener(options: ListenerOptions): Promise<RunningListener> {
  const streams = new WebSocketServer({ noServer: true });
  streams.on("error", (error: Error) => options.onStreamError?.(error));

  const server = await new Promise<ReturnType<typeof serve>>((resolve) => {
    const started = serve(
      { fetch: options.app.fetch, hostname: options.host, port: options.port },
      () => {
        resolve(started);
      },
    );
  });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(request.url ?? "/", `http://${options.host}`).pathname !== STREAM_PATH) {
      socket.destroy();
      return;
    }
    streams.handleUpgrade(request, socket, head, (socketClient) => {
      const client: FanOutClient = {
        send: (frame) => {
          socketClient.send(frame);
        },
        close: () => {
          socketClient.close();
        },
      };
      options.streams?.open(client);
      socketClient.on("error", (error: Error) => options.onStreamError?.(error));
      socketClient.on("close", () => options.streams?.close(client));
    });
  });

  const address = server.address();
  return {
    port: typeof address === "object" && address !== null ? address.port : options.port,
    get streamClientCount(): number {
      return streams.clients.size;
    },
    async close() {
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
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
