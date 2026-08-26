import { randomUUID } from "node:crypto";
import { createAdapterRegistry } from "./adapters/registry.ts";
import type { RuntimeEndpoints, ServerConfiguration } from "./config.ts";
import { DeltaFanOut } from "./fanout.ts";
import { FreshnessSweep } from "./freshness.ts";
import { createHttpApp } from "./http/app.ts";
import { encodeFleetSnapshot, encodeHealthResponse, encodeRobotDetail } from "./http/encode.ts";
import { startListener } from "./http/listener.ts";
import { createHealthCounters, ingestTelemetry } from "./ingest.ts";
import type { Clock, Logger } from "./runtime.ts";
import { CurrentStateStore } from "./store.ts";

export interface StartServerOptions {
  readonly endpoints: RuntimeEndpoints;
  readonly configuration: ServerConfiguration;
  readonly logger: Logger;
  readonly clock: Clock;
}

export interface RunningServer {
  readonly port: number;
  readonly serverSessionId: string;
  readonly store: CurrentStateStore;
  readonly sweep: FreshnessSweep;
  readonly deltas: DeltaFanOut;
  stop(): Promise<void>;
}

export async function startServer(options: StartServerOptions): Promise<RunningServer> {
  const { endpoints, configuration, logger, clock } = options;
  const store = new CurrentStateStore(configuration.manifest.robots);
  const serverSessionId = randomUUID();
  const deltas = new DeltaFanOut({ clock, serverSessionId });
  const health = createHealthCounters();
  const registry = createAdapterRegistry();

  const sweep = new FreshnessSweep({
    clock,
    store,
    deltas,
    policy: configuration.freshness,
    onLateTick: (latenessMs) => {
      health.noteLateFreshnessTick(latenessMs);
      logger.log("warn", "freshness.tick_late", { latenessMs });
    },
  });

  const listener = await startListener({
    host: endpoints.host,
    port: endpoints.port,
    streams: {
      open: (client) => {
        deltas.add(client);
      },
      close: (client) => {
        deltas.remove(client);
      },
    },
    onStreamError: (error) => {
      logger.log("warn", "stream.socket_error", { name: error.name, message: error.message });
    },
    app: createHttpApp({
      allowedOrigins: endpoints.allowedOrigins,
      readFleet: () =>
        encodeFleetSnapshot({
          sites: configuration.manifest.sites,
          robots: store.list(),
          capturedAt: clock.now(),
          serverSessionId,
          flushSequence: deltas.flushSequence,
        }),
      readRobot: (robotId) => {
        const state = store.get(robotId);
        return state === undefined
          ? null
          : encodeRobotDetail({
              state,
              rawPayload: store.rawPayload(robotId),
              sequenceHealth: store.sequenceHealth(robotId),
            });
      },
      readHealth: () =>
        encodeHealthResponse({
          counters: health.snapshot(),
          unknownFields: registry.unknownFields(),
          sequenceByVendor: store.sequenceByVendor(),
          capturedAt: clock.now(),
        }),
      ingest: {
        apply: (vendor, raw) => {
          const outcome = ingestTelemetry(
            { registry, store, deltas, health, logger, clock, policy: configuration.freshness },
            vendor,
            raw,
          );
          return outcome.ok ? { ok: true } : { ok: false, response: outcome.response };
        },
        noteUnsupportedVendor: () => {
          health.noteUnsupportedVendor();
        },
        noteMalformedBody: () => {
          health.noteMalformedIngest();
        },
      },
    }),
  });

  sweep.start();
  deltas.start();

  logger.log("info", "server.listening", {
    host: endpoints.host,
    port: listener.port,
    serverSessionId,
    robots: configuration.manifest.robots.length,
  });

  return {
    port: listener.port,
    serverSessionId,
    store,
    sweep,
    deltas,
    async stop() {
      sweep.stop();
      deltas.stop();
      await listener.close();
      logger.log("info", "server.stopped", { port: listener.port });
    },
  };
}
