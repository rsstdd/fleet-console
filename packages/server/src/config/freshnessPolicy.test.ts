import { describe, expect, it } from "vitest";

import {
  ADR3_BASELINE_FRESHNESS_POLICY,
  ConfigValidationError,
  parseFreshnessPolicy,
} from "./freshnessPolicy.ts";

describe("parseFreshnessPolicy", () => {
  it("accepts the baseline ADR 3 states", () => {
    expect(parseFreshnessPolicy({ ...ADR3_BASELINE_FRESHNESS_POLICY })).toEqual({
      liveThresholdMs: 2_000,
      staleThresholdMs: 10_000,
      sweepIntervalMs: 500,
      lateTickToleranceMs: 100,
    });
  });

  it("rejects a missing key rather than substituting a default", () => {
    expect(() =>
      parseFreshnessPolicy({ liveThresholdMs: 2_000, staleThresholdMs: 10_000 }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects an unrecognized key so a misspelled intention is not silently ignored", () => {
    expect(() =>
      parseFreshnessPolicy({ ...ADR3_BASELINE_FRESHNESS_POLICY, sweepIntervalMS: 500 }),
    ).toThrow(ConfigValidationError);
  });

  it("rejects non-integer, zero, negative and non-numeric thresholds without coercing", () => {
    const invalid = [
      { ...ADR3_BASELINE_FRESHNESS_POLICY, sweepIntervalMs: 0 },
      { ...ADR3_BASELINE_FRESHNESS_POLICY, sweepIntervalMs: -500 },
      { ...ADR3_BASELINE_FRESHNESS_POLICY, sweepIntervalMs: 500.5 },
      { ...ADR3_BASELINE_FRESHNESS_POLICY, sweepIntervalMs: "500" },
    ];

    for (const input of invalid) {
      expect(() => parseFreshnessPolicy(input)).toThrow(ConfigValidationError);
    }
  });

  it("rejects a policy in which no robot could ever be STALE", () => {
    expect(() =>
      parseFreshnessPolicy({
        liveThresholdMs: 10_000,
        staleThresholdMs: 2_000,
        sweepIntervalMs: 500,
        lateTickToleranceMs: 100,
      }),
    ).toThrow(/STALE/);
  });

  it("rejects a sweep slower than the LIVE threshold it is meant to police", () => {
    expect(() =>
      parseFreshnessPolicy({
        liveThresholdMs: 2_000,
        staleThresholdMs: 10_000,
        sweepIntervalMs: 5_000,
        lateTickToleranceMs: 100,
      }),
    ).toThrow(/detection window/);
  });

  it("names the configuration source and every invalid field in the failure", () => {
    expect(() => parseFreshnessPolicy({}, "config/freshness.json")).toThrow(
      /config\/freshness\.json[\s\S]*liveThresholdMs[\s\S]*staleThresholdMs[\s\S]*sweepIntervalMs[\s\S]*lateTickToleranceMs/,
    );
  });

  it("rejects a non-object payload", () => {
    for (const input of [null, undefined, 42, "policy", []]) {
      expect(() => parseFreshnessPolicy(input)).toThrow(ConfigValidationError);
    }
  });
});
