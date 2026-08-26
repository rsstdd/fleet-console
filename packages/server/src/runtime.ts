export interface Clock {
  now(): number;
}
export interface MonotonicClock {
  elapsed(): number;
}

export const systemClock: Clock = { now: () => Date.now() };
export const systemMonotonicClock: MonotonicClock = { elapsed: () => performance.now() };

export function manualClock(start: number): Clock & { advance(byMs: number): void } {
  let current = start;
  return {
    now: () => current,
    advance(byMs) {
      current += byMs;
    },
  };
}

export function manualMonotonicClock(start = 0): MonotonicClock & { advance(byMs: number): void } {
  let current = start;
  return {
    elapsed: () => current,
    advance(byMs) {
      current += byMs;
    },
  };
}

export interface Logger {
  log(level: "info" | "warn" | "error", event: string, fields?: Record<string, unknown>): void;
}

export const jsonLogger: Logger = {
  log(level, event, fields = {}) {
    process.stdout.write(`${JSON.stringify({ level, event, ...fields })}\n`);
  },
};

export const silentLogger: Logger = { log: () => undefined };
