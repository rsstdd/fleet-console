import { type CanonicalEnvelope, encodeCanonicalEnvelope, SCHEMA_VERSION } from "@fleet/contracts";
import type { Clock } from "./runtime.ts";

export interface FanOutClient {
  send(frame: string): void;
  close(): void;
}

export interface DeltaSink {
  mark(robotId: string, state: CanonicalEnvelope): void;
}

const DEFAULT_FLUSH_INTERVAL_MS = 100;

/** Coalesces each client's state by robot and increments once per nonempty flush. */
export class DeltaFanOut implements DeltaSink {
  readonly #clients = new Map<FanOutClient, Map<string, CanonicalEnvelope>>();
  readonly #clock: Clock;
  readonly #serverSessionId: string;
  readonly #intervalMs: number;
  #flushSequence = 0;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: {
    readonly clock: Clock;
    readonly serverSessionId: string;
    readonly flushIntervalMs?: number;
  }) {
    this.#clock = options.clock;
    this.#serverSessionId = options.serverSessionId;
    this.#intervalMs = Math.max(options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS, 10);
  }

  get clientCount(): number {
    return this.#clients.size;
  }

  get flushSequence(): number {
    return this.#flushSequence;
  }

  add(client: FanOutClient): void {
    this.#clients.set(client, new Map());
  }

  remove(client: FanOutClient): void {
    this.#clients.delete(client);
  }

  mark(robotId: string, state: CanonicalEnvelope): void {
    for (const pending of this.#clients.values()) {
      pending.set(robotId, state);
    }
  }

  flush(): void {
    const sending = [...this.#clients].filter(([, pending]) => pending.size > 0);
    if (sending.length === 0) {
      return;
    }
    this.#flushSequence += 1;
    const sentAt = this.#clock.now();
    for (const [client, pending] of sending) {
      const robots = [...pending.values()].map(encodeCanonicalEnvelope);
      pending.clear();
      client.send(
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          serverSessionId: this.#serverSessionId,
          flushSequence: this.#flushSequence,
          sentAt,
          robots,
        }),
      );
    }
  }

  start(): void {
    this.#timer ??= setInterval(() => {
      this.flush();
    }, this.#intervalMs);
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    for (const client of this.#clients.keys()) {
      client.close();
    }
    this.#clients.clear();
  }
}
