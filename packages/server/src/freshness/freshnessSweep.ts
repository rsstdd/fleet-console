import { deriveFreshness, type CanonicalEnvelope } from "@fleet/contracts";

import type { FreshnessPolicy } from "../config/freshnessPolicy.ts";
import type { PendingDeltaSet } from "../fanout/pendingDeltas.ts";
import type { Clock } from "../runtime/clock.ts";
import type { CurrentStateStore } from "../state/currentStateStore.ts";

/** Dependencies and policy for the server-owned recurring freshness sweep. */
export interface FreshnessSweepOptions {
  readonly clock: Clock;
  readonly store: CurrentStateStore;
  readonly deltas: PendingDeltaSet<CanonicalEnvelope>;
  readonly policy: FreshnessPolicy;
  readonly onLateTick?: (latenessMs: number) => void;
}

/** Runs the server half of ADR 3 and marks freshness-only changes for fan-out. */
export class FreshnessSweep {
  readonly #options: FreshnessSweepOptions;
  #timer: ReturnType<typeof setInterval> | null = null;
  #lastTickAt: number | null = null;

  /** Creates a stopped sweep; callers explicitly own lifecycle. */
  constructor(options: FreshnessSweepOptions) {
    this.#options = options;
  }

  /** Whether the recurring interval is active. */
  get isRunning(): boolean {
    return this.#timer !== null;
  }

  /** Executes one deterministic sweep tick. */
  tick(): void {
    const now = this.#options.clock.now();
    if (this.#lastTickAt !== null) {
      const lateness = now - this.#lastTickAt - this.#options.policy.sweepIntervalMs;
      if (lateness > this.#options.policy.lateTickToleranceMs) {
        this.#options.onLateTick?.(lateness);
      }
    }
    this.#lastTickAt = now;

    for (const envelope of this.#options.store.observed()) {
      const freshness = deriveFreshness({
        receivedAt: envelope.receivedAt,
        now,
        policy: this.#options.policy,
      });
      const changed = this.#options.store.setFreshness(envelope.robotId, freshness);
      if (changed !== null) this.#options.deltas.mark(envelope.robotId, changed);
    }
  }

  /** Starts the recurring interval once. */
  start(): void {
    if (this.#timer !== null) return;
    this.#timer = setInterval(() => {
      this.tick();
    }, this.#options.policy.sweepIntervalMs);
  }

  /** Stops the interval and resets lateness tracking for a future start. */
  stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    this.#lastTickAt = null;
  }
}
