import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { manualMonotonicClock } from "../runtime/clock.ts";
import { createEmissionSchedule, startScheduler } from "./emissionScheduler.ts";

/** Drives a schedule through `durationMs` in `stepMs` slices, returning totals. */
function drive(
  schedule: ReturnType<typeof createEmissionSchedule>,
  durationMs: number,
  stepMs: number,
): { emissions: number; coalesced: number; perRobot: Map<number, number> } {
  const perRobot = new Map<number, number>();
  let emissions = 0;
  let coalesced = 0;

  for (let at = stepMs; at <= durationMs; at += stepMs) {
    const result = schedule.tickAt(at);
    emissions += result.due.length;
    coalesced += result.coalesced;
    for (const tick of result.due) {
      perRobot.set(tick.robotIndex, (perRobot.get(tick.robotIndex) ?? 0) + 1);
    }
  }

  return { emissions, coalesced, perRobot };
}

describe("createEmissionSchedule", () => {
  it("produces roughly robots x hz readings per second at 50@1Hz", () => {
    const { emissions } = drive(createEmissionSchedule(50, 1), 10_000, 10);
    expect(emissions).toBeGreaterThanOrEqual(495);
    expect(emissions).toBeLessThanOrEqual(505);
  });

  it("produces roughly robots x hz readings per second at 500@5Hz", () => {
    // The documented load profile: 2,500 readings per second.
    const { emissions } = drive(createEmissionSchedule(500, 5), 10_000, 2);
    expect(emissions).toBeGreaterThanOrEqual(24_500);
    expect(emissions).toBeLessThanOrEqual(25_500);
  });

  it("preserves the per-robot rate rather than only the aggregate", () => {
    // An aggregate-only design could starve half the fleet and still hit the
    // total, so this asserts the distribution, not the sum (TODO § 13).
    const { perRobot } = drive(createEmissionSchedule(50, 1), 10_000, 10);

    expect(perRobot.size).toBe(50);
    for (const count of perRobot.values()) {
      expect(count).toBeGreaterThanOrEqual(9);
      expect(count).toBeLessThanOrEqual(11);
    }
  });

  it("phase-offsets robots so they do not all fire on the same tick", () => {
    const schedule = createEmissionSchedule(100, 1);
    const first = schedule.tickAt(5);

    expect(first.due.length).toBeGreaterThan(0);
    expect(first.due.length).toBeLessThan(100);
  });

  it("reports elapsed time per robot as the gap since that robot's previous emission", () => {
    const schedule = createEmissionSchedule(1, 1);
    schedule.tickAt(1000);
    const second = schedule.tickAt(2000);

    expect(second.due[0]?.elapsedMs).toBe(1000);
  });

  it("emits nothing before a robot is first due", () => {
    expect(createEmissionSchedule(1, 1).tickAt(0).due).toHaveLength(1);
    expect(createEmissionSchedule(2, 1).tickAt(0).due).toHaveLength(1);
  });

  it("coalesces rather than replaying when the process was blocked", () => {
    const schedule = createEmissionSchedule(1, 1);
    schedule.tickAt(0);

    // Five seconds pass in one jump. One reading is emitted; the four lost
    // intervals are counted, not queued (TODO § 13).
    const result = schedule.tickAt(5000);
    expect(result.due).toHaveLength(1);
    expect(result.coalesced).toBe(4);
  });

  it("does not drift after a late wake-up", () => {
    const schedule = createEmissionSchedule(1, 1);
    schedule.tickAt(0);
    schedule.tickAt(2500); // late by 1.5 periods

    // Next due time is recovered from elapsed time, not from "now + period",
    // so the rate returns to 1 Hz instead of permanently lagging.
    expect(schedule.tickAt(2999).due).toHaveLength(0);
    expect(schedule.tickAt(3000).due).toHaveLength(1);
  });

  it("handles a fractional rate", () => {
    // A single robot is first due at t=0, so a window closed at both ends spans
    // six emissions at 0.5 Hz (0, 2000, ... 10000), not five.
    const { emissions } = drive(createEmissionSchedule(1, 0.5), 10_000, 10);
    expect(emissions).toBe(6);
  });

  it("keeps the vendor mix uniform across intervals, since vendors alternate by index", () => {
    // Vendors are allocated round-robin by index and the scheduler offsets by
    // index, so no vendor can be starved by scheduling order (TODO § 13).
    const schedule = createEmissionSchedule(30, 1);
    const counts = [0, 0, 0];
    // Stops just short of 1000ms so robot 0 — first due at t=0 — is not counted
    // twice, which would show up as an imbalance the scheduler did not cause.
    for (let at = 10; at < 1000; at += 10) {
      for (const tick of schedule.tickAt(at).due) {
        counts[tick.robotIndex % 3] = (counts[tick.robotIndex % 3] ?? 0) + 1;
      }
    }
    expect(counts).toEqual([10, 10, 10]);
  });
});

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drives ticks from the timer without any wall-clock sleep", () => {
    const monotonic = manualMonotonicClock(0);
    let emissions = 0;

    const runner = startScheduler({
      schedule: createEmissionSchedule(10, 1),
      monotonic,
      resolutionMs: 10,
      onTick: ({ due }) => {
        emissions += due.length;
      },
    });

    // 990ms: every robot due exactly once, and robot 0 not yet due a second time.
    for (let step = 0; step < 99; step += 1) {
      monotonic.advance(10);
      vi.advanceTimersByTime(10);
    }

    expect(emissions).toBe(10);
    runner.stop();
  });

  it("sends nothing after stop", () => {
    const monotonic = manualMonotonicClock(0);
    let emissions = 0;

    const runner = startScheduler({
      schedule: createEmissionSchedule(10, 5),
      monotonic,
      resolutionMs: 10,
      onTick: ({ due }) => {
        emissions += due.length;
      },
    });

    monotonic.advance(200);
    vi.advanceTimersByTime(200);
    const beforeStop = emissions;
    expect(beforeStop).toBeGreaterThan(0);

    runner.stop();
    monotonic.advance(5000);
    vi.advanceTimersByTime(5000);

    expect(emissions).toBe(beforeStop);
  });

  it("makes stop idempotent, so a repeated signal cannot double-stop", () => {
    const runner = startScheduler({
      schedule: createEmissionSchedule(1, 1),
      monotonic: manualMonotonicClock(0),
      resolutionMs: 10,
      onTick: () => undefined,
    });

    expect(runner.isRunning()).toBe(true);
    runner.stop();
    runner.stop();
    expect(runner.isRunning()).toBe(false);
  });

  it("uses one timer for the whole fleet regardless of robot count", () => {
    // 500 robots must not mean 500 timers (TODO § 13).
    const spy = vi.spyOn(globalThis, "setInterval");
    const runner = startScheduler({
      schedule: createEmissionSchedule(500, 5),
      monotonic: manualMonotonicClock(0),
      onTick: () => undefined,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    runner.stop();
    spy.mockRestore();
  });
});
