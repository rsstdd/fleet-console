import { describe, expect, it } from "vitest";

import { formatTimeUtc } from "../time";

describe("formatTimeUtc", () => {
  it("formats an ISO timestamp as UTC HH:MM:SSZ", () => {
    expect(formatTimeUtc("2026-08-19T09:41:02.000Z")).toBe("09:41:02Z");
  });

  it("formats epoch milliseconds the same way, so callers need no ISO round-trip", () => {
    expect(formatTimeUtc(Date.UTC(2026, 7, 19, 9, 41, 2))).toBe("09:41:02Z");
  });

  it("renders null as an em dash — a robot that never reported has no time", () => {
    expect(formatTimeUtc(null)).toBe("—");
  });

  it("renders an unparseable timestamp as an em dash rather than throwing", () => {
    expect(formatTimeUtc("not-a-time")).toBe("—");
  });
});
