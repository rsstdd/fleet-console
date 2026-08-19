import { describe, expect, it } from "vitest";

import { createFaultPolicy, NO_FAULTS, UnknownRobotError } from "./faultPolicy.ts";

const FLEET = ["R-001", "R-002", "R-003", "R-004"];

describe("createFaultPolicy", () => {
  it("drops exactly one named robot", () => {
    const policy = createFaultPolicy(["R-002"], FLEET);

    expect(policy.isDropped("R-002")).toBe(true);
    for (const id of ["R-001", "R-003", "R-004"]) {
      expect(policy.isDropped(id)).toBe(false);
    }
  });

  it("drops multiple named robots and leaves the rest emitting", () => {
    const policy = createFaultPolicy(["R-001", "R-003"], FLEET);

    expect(FLEET.filter((id) => policy.isDropped(id))).toEqual(["R-001", "R-003"]);
    expect(FLEET.filter((id) => !policy.isDropped(id))).toEqual(["R-002", "R-004"]);
  });

  it("allows dropping the entire fleet", () => {
    const policy = createFaultPolicy(FLEET, FLEET);
    expect(FLEET.every((id) => policy.isDropped(id))).toBe(true);
  });

  it("collapses duplicates in the reported set", () => {
    expect(createFaultPolicy(["R-001", "R-001"], FLEET).droppedRobotIds).toEqual(["R-001"]);
  });

  it("reports the dropped set sorted, for stable logs", () => {
    expect(createFaultPolicy(["R-003", "R-001"], FLEET).droppedRobotIds).toEqual([
      "R-001",
      "R-003",
    ]);
  });

  it("fails at startup on an unknown identifier rather than dropping nothing", () => {
    // A mistyped id that silently dropped nothing would present much later as
    // "the freshness demo does not work" (AGENTS.md § CLI and configuration).
    expect(() => createFaultPolicy(["R-2O4"], FLEET)).toThrow(UnknownRobotError);
  });

  it("names the unknown identifiers and the fleet's range in the message", () => {
    expect(() => createFaultPolicy(["R-999", "R-888"], FLEET)).toThrow(/R-999, R-888/);
    expect(() => createFaultPolicy(["R-999"], FLEET)).toThrow(/R-001 to R-004/);
  });

  it("reports every unknown identifier at once, not just the first", () => {
    expect(() => createFaultPolicy(["R-999", "R-888"], FLEET)).toThrow(/2 robot\(s\)/);
  });
});

describe("NO_FAULTS", () => {
  it("drops nothing", () => {
    expect(FLEET.some((id) => NO_FAULTS.isDropped(id))).toBe(false);
    expect(NO_FAULTS.droppedRobotIds).toEqual([]);
  });
});
