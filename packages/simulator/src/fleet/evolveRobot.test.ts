import { describe, expect, it } from "vitest";

import { createFleet } from "./createFleet.ts";
import { createRandomSource } from "../runtime/random.ts";
import { evolveRobot, type SimulatedRobot } from "./simulatedRobot.ts";

/** Runs `steps` seconds of simulated time through one robot and returns every state. */
function run(robot: SimulatedRobot, steps: number, seed = 1): SimulatedRobot[] {
  const random = createRandomSource(seed);
  const history: SimulatedRobot[] = [];
  let current = robot;
  for (let i = 0; i < steps; i += 1) {
    current = evolveRobot(current, 1000, random);
    history.push(current);
  }
  return history;
}

const ROBOT = createFleet(1, 1)[0]!;

describe("evolveRobot", () => {
  it("is deterministic for the same state, elapsed time and seed", () => {
    expect(run(ROBOT, 200, 42)).toEqual(run(ROBOT, 200, 42));
  });

  it("advances the sequence by exactly one per reading, without regression", () => {
    const history = run(ROBOT, 500);
    const sequences = history.map((r) => r.state.sequence);

    expect(sequences[0]).toBe(1);
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBe(sequences[i - 1]! + 1);
    }
  });

  it("keeps battery inside [0, 1] across a long run", () => {
    for (const { state } of run(ROBOT, 5000)) {
      expect(state.battery).toBeGreaterThanOrEqual(0);
      expect(state.battery).toBeLessThanOrEqual(1);
    }
  });

  it("keeps position finite and inside the site bounds", () => {
    for (const { state } of run(ROBOT, 5000)) {
      expect(Number.isFinite(state.x)).toBe(true);
      expect(Number.isFinite(state.y)).toBe(true);
      expect(Math.abs(state.x)).toBeLessThanOrEqual(40);
      expect(Math.abs(state.y)).toBeLessThanOrEqual(40);
    }
  });

  it("keeps heading inside [0, 360)", () => {
    for (const { state } of run(ROBOT, 5000)) {
      expect(state.heading).toBeGreaterThanOrEqual(0);
      expect(state.heading).toBeLessThan(360);
    }
  });

  it("recharges rather than draining to zero and staying there", () => {
    const history = run(ROBOT, 5000);
    const batteries = history.map((r) => r.state.battery);

    expect(Math.min(...batteries)).toBeGreaterThan(0);
    // The dock cycle must actually run, or a long demo would show a flat fleet.
    expect(history.some((r) => r.state.status === "charging")).toBe(true);
  });

  it("visits every status over a long run, so a demo shows all four", () => {
    const seen = new Set(run(ROBOT, 20_000).map((r) => r.state.status));
    expect([...seen].sort()).toEqual(["busy", "charging", "fault", "idle"]);
  });

  it("docks only while charging, so dock source data cannot contradict status", () => {
    for (const { state } of run(ROBOT, 5000)) {
      expect(state.docked).toBe(state.status === "charging");
      expect(state.dockId === null).toBe(!state.docked);
    }
  });

  it("reports critical health exactly when the robot is faulted", () => {
    for (const { state } of run(ROBOT, 5000)) {
      if (state.status === "fault") {
        expect(state.health).toBe("critical");
      }
    }
  });

  it("does not move a robot that is not busy", () => {
    const history = run(ROBOT, 2000);
    for (let i = 1; i < history.length; i += 1) {
      const previous = history[i - 1]!;
      const current = history[i]!;
      if (current.state.status !== "busy") {
        expect(current.state.x).toBe(previous.state.x);
        expect(current.state.y).toBe(previous.state.y);
      }
    }
  });

  it("never mutates the input state", () => {
    const before = structuredClone(ROBOT);
    evolveRobot(ROBOT, 1000, createRandomSource(1));
    expect(ROBOT).toEqual(before);
  });

  it("scales drain with elapsed time rather than with call count", () => {
    const oneStep = evolveRobot(ROBOT, 10_000, createRandomSource(1));
    const smallStep = evolveRobot(ROBOT, 1000, createRandomSource(1));

    expect(ROBOT.state.battery - oneStep.state.battery).toBeGreaterThan(
      ROBOT.state.battery - smallStep.state.battery,
    );
  });
});
