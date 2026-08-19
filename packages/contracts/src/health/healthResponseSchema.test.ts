import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "../shared/primitives.js";
import { healthResponseSchema, parseHealthResponse } from "./healthResponseSchema.js";

/** A complete, valid health response; each test perturbs one field. */
function completeHealth(): Record<string, unknown> {
  return {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: 1_755_600_000_000,
    malformedIngest: 4,
    unsupportedVendors: 1,
    unknownFieldScope: "accepted",
    byAdapter: {
      A: {
        failures: 0,
        unknownFields: { total: 2, fields: { "telemetry.extra": 2 } },
        sequence: { evaluated: true, gaps: 1, duplicates: 0 },
      },
      B: {
        failures: 3,
        unknownFields: { total: 0, fields: {} },
        sequence: { evaluated: false },
      },
    },
    lateFreshnessTicks: { count: 2, lastLatenessMs: 140 },
  };
}

describe("healthResponseSchema", () => {
  it("accepts a complete response", () => {
    const result = parseHealthResponse(completeHealth());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.value.byAdapter.A?.unknownFields.total).toBe(2);
  });

  it("carries an adapter whose sequence was never evaluated, with no counts to misread", () => {
    // Vendor B sends no sequence (ADR 1). The whole point of the discriminated
    // shape is that there is no `gaps` field to render as "0 gaps".
    const result = parseHealthResponse(completeHealth());
    if (!result.ok) {
      throw new Error("expected success");
    }
    const b = result.value.byAdapter.B;
    expect(b?.sequence).toEqual({ evaluated: false });
    expect(b !== undefined && "gaps" in b.sequence).toBe(false);
  });

  it("uses the same not-evaluated representation the diagnostic envelope uses", () => {
    // The required evidence for ADR 25: one spelling, wherever the fact appears.
    // Two schemas that agreed only by review is what this replaced.
    const perAdapter = parseHealthResponse(completeHealth());
    if (!perAdapter.ok) {
      throw new Error("expected success");
    }
    expect(perAdapter.value.byAdapter.B?.sequence).toEqual({ evaluated: false });
  });

  it("keeps the adapter key open, so a fourth vendor is not a contracts change", () => {
    const withNewVendor = completeHealth();
    (withNewVendor.byAdapter as Record<string, unknown>).D = {
      failures: 0,
      unknownFields: { total: 0, fields: {} },
      sequence: { evaluated: false },
    };

    expect(healthResponseSchema.safeParse(withNewVendor).success).toBe(true);
  });

  it("rejects an adapter key that is not a usable identifier", () => {
    const bad = completeHealth();
    (bad.byAdapter as Record<string, unknown>)[" A"] = {
      failures: 0,
      unknownFields: { total: 0, fields: {} },
      sequence: { evaluated: false },
    };

    expect(healthResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("names the unknown-field scope as data rather than leaving it to a comment", () => {
    // ADR 15: the console renders "(adapter, accepted payloads)" from this value.
    const result = parseHealthResponse(completeHealth());
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.value.unknownFieldScope).toBe("accepted");
  });

  it("rejects a scope nobody has defined a ledger for", () => {
    expect(
      healthResponseSchema.safeParse({ ...completeHealth(), unknownFieldScope: "rejected" })
        .success,
    ).toBe(false);
  });

  it("accepts a null lateness but not a zero standing in for one", () => {
    // Zero would claim a tick ran exactly on time; null states none has run late.
    const never = { ...completeHealth(), lateFreshnessTicks: { count: 0, lastLatenessMs: null } };
    expect(healthResponseSchema.safeParse(never).success).toBe(true);

    const missing = { ...completeHealth(), lateFreshnessTicks: { count: 0 } };
    expect(healthResponseSchema.safeParse(missing).success).toBe(false);
  });

  it("rejects an unrecognized key, so a renamed counter fails loudly", () => {
    expect(healthResponseSchema.safeParse({ ...completeHealth(), robotCount: 50 }).success).toBe(
      false,
    );
  });

  it("rejects negative or fractional counters", () => {
    for (const malformedIngest of [-1, 2.5]) {
      expect(healthResponseSchema.safeParse({ ...completeHealth(), malformedIngest }).success).toBe(
        false,
      );
    }
  });

  it("requires the schema version, and rejects any other value", () => {
    expect(
      healthResponseSchema.safeParse({ ...completeHealth(), schemaVersion: "2" }).success,
    ).toBe(false);
  });

  it("carries no per-robot field at all", () => {
    // The decision, asserted rather than described: every counter here is adapter-
    // or process-scoped, because the unknown-field ledger has no per-robot precision
    // to offer (ADR 15). Per-robot sequence health lives on the diagnostic envelope.
    const result = parseHealthResponse(completeHealth());
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(Object.keys(result.value).sort()).toEqual([
      "byAdapter",
      "capturedAt",
      "lateFreshnessTicks",
      "malformedIngest",
      "schemaVersion",
      "unknownFieldScope",
      "unsupportedVendors",
    ]);
  });

  it("survives a JSON round trip", () => {
    const decoded = parseHealthResponse(JSON.parse(JSON.stringify(completeHealth())));
    expect(decoded.ok).toBe(true);
  });
});
