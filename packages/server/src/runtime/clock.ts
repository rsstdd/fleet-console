/**
 * The server's single wall-clock reader.
 *
 * ADR 3 puts freshness derivation on the server, and AGENTS.md requires `receivedAt`
 * to be stamped from the server clock at the ingest boundary. Everything that needs
 * the time takes a `Clock` instead of reading it, so freshness transitions, late-tick
 * detection, coalescing and shutdown are all testable with an injected clock rather
 * than a wall-clock sleep. `eslint.config.js` names this file as the one place the
 * wall-clock ban is lifted; move the file and the exception moves with it.
 *
 * Coupling: a reading from here is the third argument to `decodeTelemetry` in
 * `packages/adapters/src/registry.ts`. That package bans the `Date` global in its own
 * lint config and has no clock at all, so `receivedAt` on every envelope it returns is
 * whatever this file was asked for at the ingest boundary — and the freshness sweep
 * then derives from that value and no other. Passing a vendor timestamp there would
 * move freshness onto vendor clocks without failing a test in either package.
 */

/** A source of epoch-millisecond readings, injected wherever time is needed. */
export interface Clock {
  /** Epoch milliseconds. */
  now(): number;
}

/** The real system clock. Composition roots pass this; tests pass their own. */
export const systemClock: Clock = {
  now(): number {
    return Date.now();
  },
};

/** A clock fixed at one instant, for tests and for deterministic replay. */
export function fixedClock(instant: number): Clock {
  return {
    now(): number {
      return instant;
    },
  };
}

/** A clock the caller advances by hand, for tests that need time to move. */
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
