import { describe, expect, it } from "vitest";

import { createRandomSource, deriveSeed, randomInt, randomRange } from "./random.ts";

/**
 * Test vectors, not properties. The point of these assertions is that a change
 * of PRNG algorithm becomes a visible failure rather than a silently different
 * fleet in every fixture and demo downstream (TODO § 5).
 */
describe("createRandomSource", () => {
  it("produces the same sequence for the same seed", () => {
    const first = createRandomSource(1);
    const second = createRandomSource(1);

    const a = [first.next(), first.next(), first.next()];
    const b = [second.next(), second.next(), second.next()];

    expect(a).toEqual(b);
  });

  it("pins the mulberry32 sequence for seed 1", () => {
    const random = createRandomSource(1);

    expect([random.next(), random.next(), random.next()].map((v) => v.toFixed(12))).toEqual([
      "0.627073940588",
      "0.002735721180",
      "0.527447039960",
    ]);
  });

  it("produces different sequences for different seeds", () => {
    expect(createRandomSource(1).next()).not.toBe(createRandomSource(2).next());
  });

  it("stays within [0, 1) over a long run", () => {
    const random = createRandomSource(99);
    for (let i = 0; i < 10_000; i += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("deriveSeed", () => {
  it("is stable for the same parent seed and label", () => {
    expect(deriveSeed(7, "state:R-001")).toBe(deriveSeed(7, "state:R-001"));
  });

  it("separates labels so one robot's stream does not follow another's", () => {
    expect(deriveSeed(7, "state:R-001")).not.toBe(deriveSeed(7, "state:R-002"));
  });

  it("separates parent seeds", () => {
    expect(deriveSeed(7, "state:R-001")).not.toBe(deriveSeed(8, "state:R-001"));
  });

  it("returns an unsigned 32-bit integer", () => {
    const seed = deriveSeed(123, "evolve:R-500");
    expect(Number.isSafeInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });
});

describe("randomInt and randomRange", () => {
  it("keeps randomInt inside the exclusive bound", () => {
    const random = createRandomSource(4);
    for (let i = 0; i < 1000; i += 1) {
      const value = randomInt(random, 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(3);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("keeps randomRange inside its bounds", () => {
    const random = createRandomSource(5);
    for (let i = 0; i < 1000; i += 1) {
      const value = randomRange(random, -30, 30);
      expect(value).toBeGreaterThanOrEqual(-30);
      expect(value).toBeLessThan(30);
    }
  });
});
