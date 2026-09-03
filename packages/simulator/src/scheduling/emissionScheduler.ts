/**
 * The emission scheduler.
 *
 * One timer for the whole fleet, not one per robot: at 500 robots the per-robot
 * design would hold 500 timers whose drift no one is tracking. Due work is
 * computed from monotonic elapsed time, so ordinary callback jitter does not
 * accumulate into permanent rate drift — a tick that fires late still counts the
 * intervals that passed (TODO § 13).
 *
 * Overdue work is coalesced rather than queued. If the process was blocked for
 * three intervals, the robot emits once and the two lost readings are counted as
 * `coalescedOverdue`; replaying them would send three readings a second apart
 * with the same timestamp, which is not what a real robot would have done.
 */
import type { MonotonicClock } from "../runtime/clock.ts";

/** Work the scheduler decided is due for one robot. */
export interface DueTick {
  readonly robotIndex: number;
  /** Simulated milliseconds since that robot's previous emission. */
  readonly elapsedMs: number;
}

/** The scheduler's report for one wake-up. */
export interface TickResult {
  readonly due: readonly DueTick[];
  /** Emissions dropped because the wake-up was more than one interval late. */
  readonly coalesced: number;
}

/** Computes due work; the caller owns the timer that drives it. */
export interface EmissionSchedule {
  /** Returns the work due at `elapsedMs` and advances each robot's next-due time past it. */
  readonly tickAt: (elapsedMs: number) => TickResult;
  /** The interval between two emissions of the same robot. */
  readonly periodMs: number;
}

/**
 * Creates the schedule.
 *
 * Robots are phase-offset across the period rather than all firing together, so
 * 500 robots at 5 Hz produce a steady 2,500 requests per second instead of 500
 * simultaneous requests five times a second. Even spacing is also what keeps one
 * vendor or site from starving another: the offset is by index, and vendors are
 * allocated round-robin, so the vendor mix is uniform across every interval
 * (TODO § 13, "fair scheduling").
 */
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
    tickAt(elapsedMs: number): TickResult {
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

        // Advance past every period that has already elapsed. The intervals
        // skipped here are the coalesced ones.
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

/** Everything the runner needs; the timer is injected so tests use fake timers. */
export interface SchedulerRunnerOptions {
  readonly schedule: EmissionSchedule;
  readonly monotonic: MonotonicClock;
  /** Invoked for each wake-up with the work that came due. */
  readonly onTick: (result: TickResult) => void;
  /**
   * Timer resolution. The scheduler wakes at this cadence and emits whatever is
   * due, rather than waking once per robot per period.
   */
  readonly resolutionMs?: number;
}

/** A started scheduler; `stop` is idempotent so a double signal cannot double-stop. */
export interface SchedulerRunner {
  readonly stop: () => void;
  readonly isRunning: () => boolean;
}

/**
 * Drives `tickAt` from a repeating timer.
 *
 * Starting is the caller's act of construction, so there is no separate `start`
 * to call twice; `stop` is idempotent, which is the property a signal handler
 * actually needs (TODO § 13, "start idempotency behavior explicit").
 */
export function startScheduler(options: SchedulerRunnerOptions): SchedulerRunner {
  const { schedule, monotonic, onTick } = options;
  // Wake at most every 10ms, and no more often than a quarter of the period —
  // enough resolution to keep phase offsets meaningful without spinning.
  const resolutionMs = options.resolutionMs ?? Math.max(1, Math.min(10, schedule.periodMs / 4));
  const startedAt = monotonic.elapsed();
  let running = true;

  const timer = setInterval(() => {
    if (!running) {
      return;
    }
    onTick(schedule.tickAt(monotonic.elapsed() - startedAt));
  }, resolutionMs);

  // Deliberately NOT unref'd. This interval is the only thing keeping the
  // process alive while the simulator runs — everything else is either awaiting
  // it or is an unref'd bookkeeping timer. Unref'ing it makes `node src/index.ts`
  // exit before the first reading, having reported a healthy startup.

  return {
    stop(): void {
      if (!running) {
        return;
      }
      running = false;
      clearInterval(timer);
    },
    isRunning(): boolean {
      return running;
    },
  };
}
