import { describe, expect, it } from "vitest";
import { z } from "zod";

import { findUnknownFieldPaths, knownFieldPaths } from "./unknownFieldPaths.ts";

/**
 * A stand-in for a vendor dialect schema, loose in the same way the real ones
 * will be: unknown keys are accepted so they can be counted, not rejected
 * (ADR 15, ADR 1).
 */
const DIALECT = z.looseObject({
  robot_id: z.string(),
  ts: z.number(),
  telemetry: z.looseObject({
    battery: z.looseObject({ level: z.number() }),
    state: z.string(),
    dock: z.looseObject({ docked: z.boolean() }).optional(),
    modules: z.array(z.looseObject({ id: z.string() })),
  }),
  tags: z.array(z.string()).nullable(),
});

describe("knownFieldPaths", () => {
  it("emits every dotted path the schema declares, nested ones included", () => {
    expect([...knownFieldPaths(DIALECT)].sort()).toEqual(
      [
        "robot_id",
        "ts",
        "telemetry",
        "telemetry.battery",
        "telemetry.battery.level",
        "telemetry.state",
        "telemetry.dock",
        "telemetry.dock.docked",
        "telemetry.modules",
        "telemetry.modules[].id",
        "tags",
      ].sort(),
    );
  });

  it("looks through optional, nullable and defaulted wrappers", () => {
    // A wrapper is not a shape. If the walk stopped at one, every optional
    // block in a vendor dialect would read as an unknown field the moment a
    // payload populated it.
    const wrapped = z.looseObject({
      a: z.looseObject({ x: z.number() }).optional(),
      b: z.looseObject({ y: z.number() }).nullable(),
      c: z.looseObject({ z: z.number() }).default({ z: 0 }),
    });

    expect([...knownFieldPaths(wrapped)].sort()).toEqual(
      ["a", "a.x", "b", "b.y", "c", "c.z"].sort(),
    );
  });

  it("marks array element paths with [] rather than an index", () => {
    // The ledger counts dialect facts, not occurrences of one payload's data.
    // Indexed paths would make a 500-element array produce 500 distinct
    // entries and drown the signal the counter exists for.
    expect(knownFieldPaths(DIALECT).has("telemetry.modules[].id")).toBe(true);
  });

  it("returns nothing for a schema that is not an object", () => {
    expect([...knownFieldPaths(z.string())]).toEqual([]);
  });
});

describe("findUnknownFieldPaths", () => {
  const known = knownFieldPaths(DIALECT);

  /**
   * A payload the dialect accepts. Returned with a concrete type rather than
   * `Record<string, unknown>` so the variants below can be built by spreading
   * it — this package bans the `as object` casts that would otherwise take.
   */
  function accepted() {
    return {
      robot_id: "R-001",
      ts: 1_755_600_000_000,
      telemetry: {
        battery: { level: 0.5 },
        state: "idle",
        modules: [{ id: "m1" }],
      },
      tags: ["a"] as string[] | null,
    };
  }

  it("finds nothing in a payload that uses only declared fields", () => {
    expect(findUnknownFieldPaths(accepted(), known)).toEqual([]);
  });

  it("reports a top-level unknown field by name", () => {
    const payload = { ...accepted(), firmware_channel: "stable" };

    expect(findUnknownFieldPaths(payload, known)).toEqual(["firmware_channel"]);
  });

  it("distinguishes a nested unknown field from a top-level one", () => {
    // The whole reason paths are dotted: "telemetry.undocumented" and
    // "undocumented" are different facts about a dialect.
    const base = accepted();
    const payload = { ...base, telemetry: { ...base.telemetry, undocumented: 1 } };

    expect(findUnknownFieldPaths(payload, known)).toEqual(["telemetry.undocumented"]);
  });

  it("reports an unknown subtree once, at its root, without descending into it", () => {
    // One new block is one dialect change. Counting its ten children as ten
    // unknown fields would make a single vendor addition look like a rewrite.
    const payload = { ...accepted(), extras: { a: 1, b: { c: 2, d: 3 } } };

    expect(findUnknownFieldPaths(payload, known)).toEqual(["extras"]);
  });

  it("reports an unknown field inside an array element with a [] path", () => {
    const base = accepted();
    const payload = {
      ...base,
      telemetry: { ...base.telemetry, modules: [{ id: "m1" }, { id: "m2", firmware: "1.2" }] },
    };

    expect(findUnknownFieldPaths(payload, known)).toEqual(["telemetry.modules[].firmware"]);
  });

  it("reports one path per payload however many times it occurs", () => {
    // Three array elements carrying the same new key is one dialect fact. The
    // ledger's per-payload increment is what makes its total readable.
    const base = accepted();
    const payload = {
      ...base,
      telemetry: {
        ...base.telemetry,
        modules: [
          { id: "m1", firmware: "1.2" },
          { id: "m2", firmware: "1.3" },
          { id: "m3", firmware: "1.4" },
        ],
      },
    };

    expect(findUnknownFieldPaths(payload, known)).toEqual(["telemetry.modules[].firmware"]);
  });

  it("keeps paths in depth-first document order", () => {
    // `telemetry` is declared before `zeta` in the payload, so its nested
    // unknown is seen first even though `zeta` is shallower. Stable order is
    // what makes a ledger diff readable; which order matters less than that it
    // does not vary run to run.
    const base = accepted();
    const payload = { ...base, telemetry: { ...base.telemetry, alpha: 2 }, zeta: 1 };

    expect(findUnknownFieldPaths(payload, known)).toEqual(["telemetry.alpha", "zeta"]);
  });

  it("ignores nulls, primitives and arrays of primitives", () => {
    const payload = { ...accepted(), tags: null };

    expect(findUnknownFieldPaths(payload, known)).toEqual([]);
  });

  it("returns nothing for input that is not an object", () => {
    // A payload too malformed to walk is not this function's problem: the
    // schema rejected it, so the ledger never hears about it (ADR 15).
    for (const value of [null, undefined, 42, "text", [1, 2, 3]]) {
      expect(findUnknownFieldPaths(value, known)).toEqual([]);
    }
  });

  it("does not treat inherited or prototype keys as fields", () => {
    const payload: Record<string, unknown> = { robot_id: "R-001" };
    Object.setPrototypeOf(payload, { inherited: true });

    expect(findUnknownFieldPaths(payload, known)).toEqual([]);
  });
});
