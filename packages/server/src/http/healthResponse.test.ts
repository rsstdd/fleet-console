import { describe, expect, it } from "vitest";

import { createAdapterRegistry, SUPPORTED_VENDORS } from "@fleet/adapters";
import { loadMalformedPayload, loadVendorFixture } from "@fleet/adapters/testing";
import { parseHealthResponse } from "@fleet/contracts";

import { HealthMetrics } from "../health/healthMetrics.ts";
import { encodeHealthResponse } from "./healthResponse.ts";

/**
 * The health body joins three counters kept at three scopes by three different
 * components. What this suite guards is that the join does not blur them.
 */
describe("encodeHealthResponse", () => {
  function encode(over: Partial<Parameters<typeof encodeHealthResponse>[0]> = {}) {
    const registry = createAdapterRegistry();
    return encodeHealthResponse({
      metrics: new HealthMetrics().snapshot(),
      unknownFields: registry.unknownFields(),
      sequenceByVendor: {},
      capturedAt: 1_755_600_000_000,
      ...over,
    });
  }

  it("produces a body the contract's own decoder accepts, on a cold process", () => {
    expect(parseHealthResponse(JSON.parse(JSON.stringify(encode()))).ok).toBe(true);
  });

  it("names every supported vendor even before any of them reports", () => {
    // An absent key reads as "no such adapter" rather than "nothing yet", and an operator
    // checking whether a dialect is integrated would get the wrong answer.
    expect(Object.keys(encode().byAdapter)).toStrictEqual([...SUPPORTED_VENDORS]);
  });

  it("says a vendor's ordering is unevaluated rather than claiming zero gaps", () => {
    // `{ evaluated: true, gaps: 0 }` asserts a measurement nobody made (ADR 25).
    expect(encode().byAdapter.A?.sequence).toStrictEqual({ evaluated: false });
  });

  it("keeps malformed ingest and unknown fields as separate, unsummed numbers", () => {
    // Their pairing is the signal: a vendor that breaks and changes shape at once shows a
    // flat ledger and a climbing malformed count, and a total erases that (ADR 15).
    const registry = createAdapterRegistry();
    registry.decodeTelemetry("C", loadVendorFixture("C").payload, 0);
    registry.decodeTelemetry("A", loadMalformedPayload("A", "wrong-type").payload, 0);
    const metrics = new HealthMetrics();
    metrics.noteMalformedIngest();
    metrics.noteAdapterFailure("A");

    const body = encode({ metrics: metrics.snapshot(), unknownFields: registry.unknownFields() });

    expect(body.malformedIngest).toBe(1);
    expect(body.byAdapter.A?.failures).toBe(1);
    // Vendor A's payload was rejected, so it never reached the ledger — the flat-ledger,
    // climbing-malformed pairing ADR 15 describes, in one assertion.
    expect(body.byAdapter.A?.unknownFields.total).toBe(0);
    expect(body.byAdapter.C?.unknownFields.total).toBeGreaterThan(0);
  });

  it("carries the unknown-field scope as data, not as a caption", () => {
    // The console renders its caveat from this value, so a stale comment cannot mislabel
    // a per-adapter number as per-robot (ADR 25).
    expect(encode().unknownFieldScope).toBe("accepted");
  });
});
