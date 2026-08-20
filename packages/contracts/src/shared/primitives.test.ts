import { describe, expect, it } from "vitest";

import {
  MAX_EPOCH_MS,
  MAX_POSITION_METRES,
  SCHEMA_VERSION,
  batteryPercentSchema,
  connectivitySchema,
  displayNameSchema,
  epochMillisecondsSchema,
  freshnessStateSchema,
  healthSchema,
  healthSeveritySchema,
  identifierSchema,
  parseWith,
  positionSchema,
  robotStatusSchema,
  schemaVersionSchema,
  toContractIssues,
  versionStringSchema,
} from "./primitives.js";

describe("identifierSchema", () => {
  it("accepts the identifier shapes the fixtures and manifest use", () => {
    for (const value of ["R-204", "site.north", "vendor_a", "A", "adapter-a-v2"]) {
      expect(identifierSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects empty, whitespace-only, and whitespace-padded values", () => {
    // Padding is rejected rather than trimmed: silently trimming means "R-204 "
    // and "R-204" become the same robot, which is a merge no producer asked for.
    for (const value of ["", " ", "  R-204", "R-204  ", "R 204"]) {
      expect(identifierSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects characters outside the allowed set and over-long values", () => {
    for (const value of ["R/204", "R:204", "robot#1", "«id»", "-leading"]) {
      expect(identifierSchema.safeParse(value).success).toBe(false);
    }
    expect(identifierSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(identifierSchema.safeParse("a".repeat(65)).success).toBe(false);
  });

  it("does not coerce non-strings", () => {
    for (const value of [204, null, undefined, true, ["R-204"], { id: "R-204" }]) {
      expect(identifierSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("displayNameSchema", () => {
  it("accepts vendor model names, which are prose rather than identifiers", () => {
    expect(displayNameSchema.safeParse("Scrubber 4000").success).toBe(true);
    expect(displayNameSchema.safeParse("AMR-2 (rev B)").success).toBe(true);
  });

  it("rejects empty, padded, and control-character values", () => {
    for (const value of ["", "   ", " Scrubber", "Scrubber ", "Scrub\nber", "Scrub\u0000ber"]) {
      expect(displayNameSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("versionStringSchema", () => {
  it("accepts three-part numeric versions", () => {
    expect(versionStringSchema.safeParse("1.0.0").success).toBe(true);
    expect(versionStringSchema.safeParse("12.4.107").success).toBe(true);
  });

  it("rejects partial, prefixed, and non-numeric versions", () => {
    for (const value of ["1.0", "v1.0.0", "1.0.0-beta", "1.0.0.0", "latest", ""]) {
      expect(versionStringSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("schemaVersionSchema", () => {
  it("accepts exactly the current supported version", () => {
    expect(schemaVersionSchema.safeParse(SCHEMA_VERSION).success).toBe(true);
  });

  it("rejects any other version rather than reinterpreting it", () => {
    // An unsupported version must fail loudly. Accepting "1" under version 2
    // rules is the silent reinterpretation AGENTS.md forbids — a version-1
    // payload predates `serverSessionId` (ADR 31).
    for (const value of ["1", "0", "3", "2.0", 2, null]) {
      expect(schemaVersionSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("epochMillisecondsSchema", () => {
  it("accepts integral milliseconds within the supported epoch range", () => {
    for (const value of [0, 1, 1_755_600_000_000, MAX_EPOCH_MS]) {
      expect(epochMillisecondsSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects NaN, infinities, fractions, negatives, and out-of-range values", () => {
    for (const value of [Number.NaN, Infinity, -Infinity, 1.5, -1, MAX_EPOCH_MS + 1]) {
      expect(epochMillisecondsSchema.safeParse(value).success).toBe(false);
    }
  });

  it("does not coerce numeric strings or Date instances", () => {
    // A timestamp arriving as a string is a producer bug, not a formatting
    // preference. Coercing it hides which side of the wire is wrong.
    expect(epochMillisecondsSchema.safeParse("1755600000000").success).toBe(false);
    expect(epochMillisecondsSchema.safeParse(new Date(1_755_600_000_000)).success).toBe(false);
  });
});

describe("closed vocabularies", () => {
  it("accepts exactly the five canonical statuses", () => {
    for (const value of ["idle", "busy", "charging", "fault", "unknown"]) {
      expect(robotStatusSchema.safeParse(value).success).toBe(true);
    }
    for (const value of ["IDLE", "maintenance", "offline", ""]) {
      expect(robotStatusSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts exactly the three health severities", () => {
    for (const value of ["nominal", "degraded", "critical"]) {
      expect(healthSeveritySchema.safeParse(value).success).toBe(true);
    }
    expect(healthSeveritySchema.safeParse("fault").success).toBe(false);
  });

  it("accepts exactly the four freshness states, lowercase", () => {
    for (const value of ["live", "stale", "unreachable", "unknown"]) {
      expect(freshnessStateSchema.safeParse(value).success).toBe(true);
    }
    // The display vocabulary is uppercase; the wire vocabulary is not.
    expect(freshnessStateSchema.safeParse("LIVE").success).toBe(false);
  });

  it("accepts exactly the three connectivity values", () => {
    for (const value of ["online", "offline", "unknown"]) {
      expect(connectivitySchema.safeParse(value).success).toBe(true);
    }
    // Connectivity is the robot's reported link state. Freshness words must
    // not leak into it, because they answer a different question.
    expect(connectivitySchema.safeParse("stale").success).toBe(false);
  });
});

describe("batteryPercentSchema", () => {
  it("accepts the inclusive 0-100 range including fractional readings", () => {
    for (const value of [0, 0.5, 33.7, 99.9, 100]) {
      expect(batteryPercentSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects values outside the range and non-finite values", () => {
    // Vendor A reports a 0-1 fraction; converting it is the adapter's job, and
    // 0.87 is a legal percentage here, so the contract cannot catch a missed
    // conversion. That is recorded as an adapter contract-test obligation.
    for (const value of [-0.1, 100.1, Number.NaN, Infinity, "50"]) {
      expect(batteryPercentSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("positionSchema", () => {
  it("accepts a named frame with finite metre coordinates", () => {
    const parsed = positionSchema.safeParse({ frame: "site-map", x: 12.5, y: -3.25 });
    expect(parsed.success).toBe(true);
  });

  it("requires the frame, because coordinates without one mean nothing", () => {
    expect(positionSchema.safeParse({ x: 1, y: 2 }).success).toBe(false);
    expect(positionSchema.safeParse({ frame: "", x: 1, y: 2 }).success).toBe(false);
  });

  it("rejects non-finite and implausibly large coordinates", () => {
    for (const bad of [Number.NaN, Infinity, MAX_POSITION_METRES + 1, -MAX_POSITION_METRES - 1]) {
      expect(positionSchema.safeParse({ frame: "site-map", x: bad, y: 0 }).success).toBe(false);
    }
    expect(
      positionSchema.safeParse({ frame: "site-map", x: MAX_POSITION_METRES, y: 0 }).success,
    ).toBe(true);
  });

  it("rejects additional fields rather than silently dropping them", () => {
    const parsed = positionSchema.safeParse({ frame: "site-map", x: 1, y: 2, heading: 90 });
    expect(parsed.success).toBe(false);
  });
});

describe("healthSchema", () => {
  it("accepts a severity with and without a description", () => {
    expect(healthSchema.safeParse({ severity: "nominal" }).success).toBe(true);
    expect(
      healthSchema.safeParse({ severity: "degraded", description: "Brush motor current high" })
        .success,
    ).toBe(true);
  });

  it("rejects an empty description instead of treating it as absent", () => {
    expect(healthSchema.safeParse({ severity: "degraded", description: "" }).success).toBe(false);
  });

  it("imposes no cross-field rule tying fault status to critical severity", () => {
    // ADR 1 leaves this open and says to add the invariant only if it is true
    // for every vendor. It is not established, so status and severity stay
    // independent here and the presentation rule lives in the web entity layer.
    expect(healthSchema.safeParse({ severity: "nominal" }).success).toBe(true);
  });
});

describe("parseWith and toContractIssues", () => {
  it("returns a typed value on success", () => {
    const result = parseWith(identifierSchema, "R-204");
    expect(result).toEqual({ ok: true, value: "R-204" });
  });

  it("returns stable issue categories and dotted paths on failure", () => {
    const result = parseWith(positionSchema, { frame: "site-map", x: "north", y: 2 });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    // Callers assert on code and path, never on Zod's prose, so a Zod message
    // rewording cannot break a consumer (packages/contracts/AGENTS.md, Tests).
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "x", code: "invalid_type" }),
    );
  });

  it("names the root explicitly rather than emitting an empty path", () => {
    const result = parseWith(identifierSchema, 42);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.issues[0]?.path).toBe("(root)");
  });

  it("formats nested paths as dotted segments", () => {
    const parsed = healthSchema.safeParse({ severity: "nope" });
    if (parsed.success) {
      throw new Error("expected a failure");
    }

    expect(toContractIssues(parsed.error)[0]?.path).toBe("severity");
  });
});
