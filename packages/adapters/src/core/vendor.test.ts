import { describe, expect, it } from "vitest";

import { isSupportedVendor, SUPPORTED_VENDORS } from "./vendor.ts";

describe("supported vendors", () => {
  it("recognizes every dialect this package has an adapter for", () => {
    for (const vendor of SUPPORTED_VENDORS) {
      expect(isSupportedVendor(vendor)).toBe(true);
    }
  });

  it("rejects a well-formed identifier for a vendor with no adapter", () => {
    // "D" is a valid vendor id under the contract's open identifierSchema. It is
    // not supported here, and the two facts are different rejections.
    expect(isSupportedVendor("D")).toBe(false);
    expect(isSupportedVendor("a")).toBe(false);
    expect(isSupportedVendor("")).toBe(false);
  });

  it("narrows from unknown, so the ingest boundary need not cast first", () => {
    const fromRoute: unknown = "B";

    expect(isSupportedVendor(fromRoute)).toBe(true);
    for (const value of [null, undefined, 42, ["A"], { vendor: "A" }]) {
      expect(isSupportedVendor(value)).toBe(false);
    }
  });
});
