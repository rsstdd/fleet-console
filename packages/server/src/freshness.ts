import { type CanonicalEnvelope, deriveFreshness } from "@fleet/contracts";
import type { FreshnessPolicy } from "./config.ts";
import type { DeltaSink } from "./fanout.ts";
import type { Clock } from "./runtime.ts";
import type { CurrentStateStore } from "./store.ts";

export interface FreshnessSweepOptions {
  readonly clock: Clock;
  readonly store: CurrentStateStore;
  readonly deltas: DeltaSink;
  readonly policy: FreshnessPolicy;
  readonly onLateTick?: (latenessMs: number) => void;
}

/** Recurring sweeps let silence degrade freshness without another message. */
export class FreshnessSweep {
  readonly #options: FreshnessSweepOptions;
  #timer: ReturnType<typeof setInterval> | null = null;
  #lastTickAt: number | null = null;

  constructor(options: FreshnessSweepOptions) {
    this.#options = options;
  }

  get isRunning(): boolean {
    return this.#timer !== null;
  }

  tick(): void {
    const { clock, store, deltas, policy, onLateTick } = this.#options;
    const now = clock.now();

    if (this.#lastTickAt !== null) {
      const lateness = now - this.#lastTickAt - policy.sweepIntervalMs;
      if (lateness > policy.lateTickToleranceMs) {
        onLateTick?.(lateness);
      }
    }
    this.#lastTickAt = now;

    for (const envelope of store.observed()) {
      const freshness = deriveFreshness({ receivedAt: envelope.receivedAt, now, policy });
      const changed: CanonicalEnvelope | null = store.setFreshness(envelope.robotId, freshness);
      if (changed !== null) {
        deltas.mark(envelope.robotId, changed);
      }
    }
  }

  start(): void {
    this.#timer ??= setInterval(() => {
      this.tick();
    }, this.#options.policy.sweepIntervalMs);
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
    }
    this.#timer = null;
    this.#lastTickAt = null;
  }
}
