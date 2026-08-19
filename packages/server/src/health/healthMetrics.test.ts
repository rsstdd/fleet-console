import { describe, expect, it } from "vitest";

import { HealthMetrics } from "./healthMetrics.ts";

describe("HealthMetrics", () => {
  it("keeps failure and sequence scopes distinct", () => {
    const metrics = new HealthMetrics();
    metrics.noteMalformedIngest();
    metrics.noteUnsupportedVendor();
    metrics.noteAdapterFailure("A");
    metrics.noteSequence("A", "gap");
    metrics.noteSequence("B", "not-evaluated");
    metrics.noteLateFreshnessTick(125);

    expect(metrics.snapshot()).toMatchObject({
      malformedIngest: 1,
      unsupportedVendors: 1,
      adapterFailures: { A: 1 },
      sequence: { A: { evaluated: true, gaps: 1, duplicates: 0 }, B: { evaluated: false } },
      lateFreshnessTicks: { count: 1, lastLatenessMs: 125 },
    });
  });
});
