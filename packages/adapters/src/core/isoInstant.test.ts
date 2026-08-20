import { describe, expect, it } from "vitest";

import { parseIsoInstant } from "./isoInstant.ts";

/**
 * Expected values are stated as literals rather than computed with `Date`, which
 * this package cannot use. Each one is the instant the comment names; a test that
 * derived them from the implementation would only prove it agrees with itself.
 */
describe("parseIsoInstant", () => {
  it("converts the instant the recorded fixtures are stamped with", () => {
    // 2025-08-19T10:40:00.000Z is FIXTURE_RECORDING.instantMs.
    expect(parseIsoInstant("2025-08-19T10:40:00.000Z")).toBe(1_755_600_000_000);
  });

  it("anchors on the epoch itself", () => {
    expect(parseIsoInstant("1970-01-01T00:00:00.000Z")).toBe(0);
    expect(parseIsoInstant("1969-12-31T23:59:59.999Z")).toBe(-1);
  });

  it("applies a zone offset rather than ignoring it", () => {
    // Same instant written three ways; all must land on one number.
    expect(parseIsoInstant("2025-08-19T12:40:00+02:00")).toBe(1_755_600_000_000);
    expect(parseIsoInstant("2025-08-19T05:40:00-05:00")).toBe(1_755_600_000_000);
    expect(parseIsoInstant("2025-08-19T10:40:00Z")).toBe(1_755_600_000_000);
  });

  it("handles the leap-year rule in all three of its cases", () => {
    // 2024 divisible by 4, 1900 by 100 and not 400, 2000 by 400.
    expect(parseIsoInstant("2024-02-29T00:00:00Z")).toBe(1_709_164_800_000);
    expect(parseIsoInstant("1900-02-29T00:00:00Z")).toBeNull();
    expect(parseIsoInstant("2000-02-29T00:00:00Z")).toBe(951_782_400_000);
  });

  it("truncates sub-millisecond precision instead of rounding it forward", () => {
    // .0009 is under a millisecond; rounding would move the instant to the next.
    expect(parseIsoInstant("1970-01-01T00:00:00.0009Z")).toBe(0);
    expect(parseIsoInstant("1970-01-01T00:00:00.1Z")).toBe(100);
    expect(parseIsoInstant("1970-01-01T00:00:00.12Z")).toBe(120);
  });

  it("covers the range the canonical epoch bound allows", () => {
    // MAX_EPOCH_MS in @fleet/contracts; the four-digit year regex caps here.
    expect(parseIsoInstant("9999-12-31T23:59:59.999Z")).toBe(253_402_300_799_999);
  });

  it.each([
    ["yesterday", "prose, which is what vendor C's malformed fixture sends"],
    ["2025-08-19", "a date with no time"],
    ["2025-08-19T10:40:00", "a local time with no zone, which names no instant"],
    ["2025-13-01T00:00:00Z", "month 13"],
    ["2025-04-31T00:00:00Z", "31 April"],
    ["2025-02-30T00:00:00Z", "30 February"],
    ["2025-08-19T24:00:00Z", "hour 24"],
    ["2025-08-19T10:60:00Z", "minute 60"],
    ["2025-08-19T10:40:60Z", "a leap second the canonical model cannot represent"],
    ["2025-08-19T10:40:00+24:00", "an impossible zone offset"],
    ["2025-08-19 10:40:00Z", "a space instead of the T separator"],
    ["", "an empty string"],
  ])("rejects %s — %s", (value) => {
    expect(parseIsoInstant(value)).toBeNull();
  });
});
