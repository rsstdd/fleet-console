import { describe, expect, it } from "vitest";

import { fixedClock, manualClock } from "./clock.ts";

describe("clock", () => {
  it("holds a fixed instant so a receipt time can be asserted exactly", () => {
    const clock = fixedClock(1_700_000_000_000);

    expect(clock.now()).toBe(1_700_000_000_000);
    expect(clock.now()).toBe(1_700_000_000_000);
  });

  it("advances only when the test advances it", () => {
    const clock = manualClock(1_000);

    expect(clock.now()).toBe(1_000);
    clock.advance(2_500);
    expect(clock.now()).toBe(3_500);
  });
});
