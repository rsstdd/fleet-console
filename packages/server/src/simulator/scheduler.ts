import type { MonotonicClock } from "../runtime.ts";

export interface DueTick {
  readonly robotIndex: number;
  readonly elapsedMs: number;
}
export interface TickResult {
  readonly due: readonly DueTick[];
  readonly coalesced: number;
}

export interface EmissionSchedule {
  tickAt(elapsedMs: number): TickResult;
  readonly periodMs: number;
}

/** Missed ticks are coalesced, never replayed as already-stale readings. */
export function createEmissionSchedule(robotCount: number, hz: number): EmissionSchedule {
  const periodMs = 1000 / hz;
  const nextDueMs: number[] = [];
  const lastEmittedMs: number[] = [];
  for (let index = 0; index < robotCount; index += 1) {
    const offset = (periodMs * index) / Math.max(robotCount, 1);
    nextDueMs.push(offset);
    lastEmittedMs.push(offset - periodMs);
  }

  return {
    periodMs,
    tickAt(elapsedMs) {
      const due: DueTick[] = [];
      let coalesced = 0;
      for (let index = 0; index < robotCount; index += 1) {
        const nextDue = nextDueMs[index];
        const lastEmitted = lastEmittedMs[index];
        if (nextDue === undefined || lastEmitted === undefined || elapsedMs < nextDue) {
          continue;
        }
        due.push({ robotIndex: index, elapsedMs: elapsedMs - lastEmitted });
        lastEmittedMs[index] = elapsedMs;
        let advanced = nextDue + periodMs;
        while (advanced <= elapsedMs) {
          advanced += periodMs;
          coalesced += 1;
        }
        nextDueMs[index] = advanced;
      }
      return { due, coalesced };
    },
  };
}

export interface SchedulerRunner {
  stop(): void;
}

export function startScheduler(options: {
  readonly schedule: EmissionSchedule;
  readonly monotonic: MonotonicClock;
  readonly onTick: (result: TickResult) => void;
}): SchedulerRunner {
  const resolutionMs = Math.max(1, Math.min(10, options.schedule.periodMs / 4));
  const startedAt = options.monotonic.elapsed();
  const timer = setInterval(() => {
    options.onTick(options.schedule.tickAt(options.monotonic.elapsed() - startedAt));
  }, resolutionMs);
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
