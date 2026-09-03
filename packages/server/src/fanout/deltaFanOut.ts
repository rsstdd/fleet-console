import { type CanonicalEnvelope, SCHEMA_VERSION, encodeCanonicalEnvelope } from "@fleet/contracts";

import type { Clock } from "../runtime/clock.ts";
import { PendingDeltaSet } from "./pendingDeltas.ts";

/**
 * Delta fan-out: one coalescing set per connected console, flushed on its own schedule.
 *
 * Per client rather than one shared set (ADR 2 § Decision, amended 19 August 2026). A slow
 * client's backlog collapses per robot exactly as a global one would, so its memory is
 * bounded by fleet size rather than by how far behind it is: it receives current state
 * less often, never stale state. A shared set cannot do that — draining it for one client
 * would take the entry away from the others.
 *
 * The scheduler is independent of the 500 ms freshness sweep (**H2**). Conflating them
 * makes the two impossible to tune separately, which is the constraint ADR 3 states.
 *
 * This module owns no socket. Clients arrive as a `send`/`close` pair so the whole of
 * fan-out is testable without a port, in keeping with every other unit in this package.
 */

/** Highest flush rate ADR 2 permits, as the interval between flushes. */
const DEFAULT_FLUSH_INTERVAL_MS = 100;

/** One connected console, reduced to what fan-out does to it. */
export interface FanOutClient {
  /** Sends one serialized frame. */
  send(frame: string): void;
  /** Closes the connection; fan-out calls this only on shutdown today (**H6b** is open). */
  close(): void;
}

/**
 * The process-wide flush counter.
 *
 * **One** source, read by both the fleet snapshot and every frame (**H3a**, ADR 18). Two
 * sources is the exact defect that decision exists to prevent: a client compares the
 * sequence on a delta against the one on its snapshot, and two counters make that
 * comparison meaningless while both look plausible.
 */
export interface FlushSequence {
  /** The flush most recently sent; zero from a server that has never flushed. */
  current(): number;
  /** Advances to the next flush and returns it. */
  next(): number;
}

/** Creates a counter starting before the first flush. */
export function createFlushSequence(): FlushSequence {
  let value = 0;
  return {
    current: () => value,
    next: () => (value += 1),
  };
}

/** What fan-out needs to build and time a frame. */
export interface DeltaFanOutOptions {
  readonly clock: Clock;
  readonly sequence: FlushSequence;
  /**
   * This runtime's identity, minted once in `runServer.ts` and stamped on every
   * frame so a client can tell a restart from a resumed stream (ADR 31). Must be
   * the same value `encodeFleetSnapshot` puts on the snapshot.
   */
  readonly serverSessionId: string;
  /** Milliseconds between flushes; ADR 2 caps the rate at 10 Hz, so this floors at 100. */
  readonly flushIntervalMs?: number;
}

/** Broadcasts coalesced canonical deltas to connected consoles at a bounded rate. */
export class DeltaFanOut {
  readonly #clients = new Map<FanOutClient, PendingDeltaSet<CanonicalEnvelope>>();
  readonly #options: DeltaFanOutOptions;
  readonly #intervalMs: number;
  #timer: ReturnType<typeof setInterval> | null = null;

  /** Creates a stopped fan-out with no clients. */
  constructor(options: DeltaFanOutOptions) {
    this.#options = options;
    this.#intervalMs = Math.max(options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS, 100);
  }

  /** Connected consoles. */
  get clientCount(): number {
    return this.#clients.size;
  }

  /** Whether the flush interval is active. */
  get isRunning(): boolean {
    return this.#timer !== null;
  }

  /**
   * Registers a console, which starts receiving deltas at the next flush.
   *
   * It gets an empty set rather than the current fleet: initial state is the `GET
   * /api/fleet` read, so the socket carries one message shape for its whole lifetime and
   * cold start and reconnect are the same path (ADR 2 § Decision, amended; **H3**).
   */
  add(client: FanOutClient): void {
    this.#clients.set(client, new PendingDeltaSet<CanonicalEnvelope>());
  }

  /** Forgets a console and discards its undelivered set. */
  remove(client: FanOutClient): void {
    this.#clients.delete(client);
  }

  /**
   * Records a changed robot for every connected console.
   *
   * Takes what the caller marked rather than diffing two states, so a freshness-only
   * transition is a real change (ADR 3 § Implications, **F4**). With no console connected
   * this is deliberately a no-op: there is no backlog to keep, because a joining client's
   * picture comes from the snapshot.
   */
  mark(robotId: string, state: CanonicalEnvelope): void {
    for (const pending of this.#clients.values()) {
      pending.mark(robotId, state);
    }
  }

  /**
   * Sends one frame to every console with something pending.
   *
   * The sequence advances once per flush **that sends anything**, not once per tick and
   * not once per client. A counter that ran on empty ticks would climb without describing
   * any state, and a client reconciling against its snapshot would discard deltas it
   * needed. Every frame in one flush carries that same number, which is also the maximum
   * any of them contains — the value **H6a** requires of a coalesced frame.
   */
  flush(): void {
    const sending = [...this.#clients].filter(([, pending]) => !pending.isEmpty);
    if (sending.length === 0) return;

    const flushSequence = this.#options.sequence.next();
    const sentAt = this.#options.clock.now();

    for (const [client, pending] of sending) {
      // Encoded per client because each drains its own set; the capability record becomes
      // the wire array here, which is the form JSON preserves (**H5**, ADR 1).
      const robots = [...pending.drain().values()].map(encodeCanonicalEnvelope);
      client.send(
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          serverSessionId: this.#options.serverSessionId,
          flushSequence,
          sentAt,
          robots,
        }),
      );
    }
  }

  /** Starts the flush interval once. */
  start(): void {
    if (this.#timer !== null) return;
    this.#timer = setInterval(() => {
      this.flush();
    }, this.#intervalMs);
  }

  /** Stops flushing and closes every console, so no frame lands on a dead listener. */
  stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    for (const client of this.#clients.keys()) {
      client.close();
    }
    this.#clients.clear();
  }
}
