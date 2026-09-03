import { describe, expect, it } from "vitest";

import { HealthMetrics } from "./healthMetrics.ts";

describe("HealthMetrics", () => {
  it("keeps failure counts at adapter scope", () => {
    const metrics = new HealthMetrics();
    metrics.noteMalformedIngest();
    metrics.noteUnsupportedVendor();
    metrics.noteAdapterFailure("A");
    metrics.noteLateFreshnessTick(125);

    expect(metrics.snapshot()).toMatchObject({
      malformedIngest: 1,
      unsupportedVendors: 1,
      adapterFailures: { A: 1 },
      lateFreshnessTicks: { count: 1, lastLatenessMs: 125 },
    });
  });
});
