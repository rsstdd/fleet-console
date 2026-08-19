/**
 * The simulator's readers of ambient time and randomness.
 *
 * Every other module in this package takes these interfaces rather than reading
 * the platform, so a demo run, a test and a load run all observe the same
 * sequence for the same seed (AGENTS.md § Robot and telemetry generation).
 * `eslint.config.js` names this directory as the one place the determinism ban
 * is lifted; move the directory and the exception moves with it.
 *
 * Coupling: `Clock` intentionally mirrors `packages/server/src/runtime/clock.ts`
 * so the two processes talk about wall time in the same units. It is duplicated
 * rather than imported because the ingest endpoint is the only permitted seam
 * between these packages (AGENTS.md § Dependency and ownership boundaries).
 */

/** A source of epoch-millisecond wall-clock readings, used only for payload timestamps. */
export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

/**
 * A strictly non-decreasing elapsed-time source, used only for scheduling and
 * rate measurement. Kept separate from `Clock` because wall time can jump
 * backwards and a scheduler that trusted it would emit a burst or stall.
 */
export interface MonotonicClock {
  /** Milliseconds since an arbitrary fixed origin. */
  elapsed(): number;
}

/** The real system wall clock. Composition roots pass this; tests pass their own. */
export const systemClock: Clock = {
  now(): number {
    return Date.now();
  },
};

/** The real monotonic clock, backed by `performance.now()`. */
export const systemMonotonicClock: MonotonicClock = {
  elapsed(): number {
    return performance.now();
  },
};

/** A wall clock the caller advances by hand, for tests. */
export function manualClock(start: number): Clock & { advance(byMs: number): void } {
  let current = start;
  return {
    now(): number {
      return current;
    },
    advance(byMs: number): void {
      current += byMs;
    },
  };
}

/** A monotonic clock the caller advances by hand, for tests. */
export function manualMonotonicClock(start = 0): MonotonicClock & { advance(byMs: number): void } {
  let current = start;
  return {
    elapsed(): number {
      return current;
    },
    advance(byMs: number): void {
      current += byMs;
    },
  };
}
