import { describe, expect, it } from "vitest";

import { toBatteryPercent } from "./units.ts";

describe("toBatteryPercent", () => {
  it("removes the floating-point artefact a plain multiplication leaves", () => {
    // The reason this function exists rather than `fraction * 100` at each call.
    // Both of these are what IEEE-754 actually produces, not hypotheticals.
    expect(0.29 * 100).toBe(28.999999999999996);
    expect(0.564 * 100).toBe(56.39999999999999);

    expect(toBatteryPercent(0.29)).toBe(29);
    expect(toBatteryPercent(0.564)).toBe(56.4);
  });

  it("is not a rare corner: a quarter of four-decimal fractions are affected", () => {
    // Stated as a count rather than an anecdote, so the justification in the
    // module comment is checked rather than believed. A vendor sending four
    // decimals — which A and C both do — hits this roughly one reading in four.
    let affected = 0;
    for (let numerator = 1; numerator < 10_000; numerator += 1) {
      const fraction = numerator / 10_000;
      if (fraction * 100 !== toBatteryPercent(fraction)) {
        affected += 1;
      }
    }

    expect(affected).toBe(2515);
  });

  it("maps the ends of the fraction range to the ends of the percentage range", () => {
    expect(toBatteryPercent(0)).toBe(0);
    expect(toBatteryPercent(1)).toBe(100);
  });

  it("keeps fractional percentages rather than rounding to whole numbers", () => {
    // `batteryPercentSchema` accepts fractions so this precision survives.
    expect(toBatteryPercent(0.966)).toBe(96.6);
    expect(toBatteryPercent(0.3846)).toBe(38.46);
  });

  it("gives the same answer to both callers, which is why it is shared", () => {
    // Vendors A and C both send a fraction. If they converted separately and
    // drifted, D7's cross-vendor core comparison would fail for a spurious reason.
    expect(toBatteryPercent(0.5)).toBe(toBatteryPercent(0.5));
    expect(toBatteryPercent(0.123456789)).toBe(12.3457);
  });
});
