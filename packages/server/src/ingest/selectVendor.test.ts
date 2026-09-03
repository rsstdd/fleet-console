import { SUPPORTED_VENDORS } from "@fleet/adapters";
import { describe, expect, it } from "vitest";

import { selectIngestVendor } from "./selectVendor.ts";

/**
 * ADR 8 § Decision (amended 19 August 2026, ratifying register stub D9): vendor
 * identity travels in the path segment of `POST /api/telemetry/:vendor`, and
 * the segment is validated against the adapter registry before any body byte is
 * read.
 */
describe("selectIngestVendor", () => {
  it("selects each vendor the adapter registry supports", () => {
    for (const vendor of SUPPORTED_VENDORS) {
      const selection = selectIngestVendor(vendor);

      expect(selection.ok).toBe(true);
      if (!selection.ok) continue;
      expect(selection.vendor).toBe(vendor);
    }
  });

  it("rejects a vendor no adapter can decode, and names it as that", () => {
    const selection = selectIngestVendor("D");

    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    // Not "malformed": vendor D is an integration gap with its own health
    // metric, not a data-quality problem (packages/adapters/src/core/vendor.ts).
    expect(selection.reason).toBe("unsupported_vendor");
    expect(selection.status).toBe(404);
  });

  it("rejects a missing or empty segment rather than defaulting to a vendor", () => {
    for (const segment of [undefined, null, "", "   "]) {
      const selection = selectIngestVendor(segment);

      expect(selection.ok).toBe(false);
      if (selection.ok) continue;
      expect(selection.reason).toBe("unsupported_vendor");
    }
  });

  it("is case-sensitive, because the registry key set is", () => {
    // The simulator posts the canonical upper-case ids. Accepting "a" here
    // would mean the route and the registry disagree about what a vendor id is,
    // and the disagreement would surface as a dispatch miss much later.
    expect(selectIngestVendor("a").ok).toBe(false);
  });

  it("never falls back to an adapter when the segment is a lie", () => {
    for (const segment of ["../A", "A/", "A B", "AA", 42, ["A"], { vendor: "A" }]) {
      expect(selectIngestVendor(segment).ok).toBe(false);
    }
  });

  it("cannot read a request body, structurally", () => {
    // The proof the register's evidence list asks for, at the level this stage
    // can carry it: selection takes the path segment and nothing else, so no
    // body byte can be read before the adapter is chosen. When the Hono handler
    // lands, its own test asserts the same ordering against a real request.
    expect(selectIngestVendor).toHaveLength(1);
  });
});
