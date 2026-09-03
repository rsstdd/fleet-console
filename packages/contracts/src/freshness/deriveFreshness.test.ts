import { describe, expect, it } from "vitest";

import { MAX_EPOCH_MS } from "../shared/primitives.js";
import {
  DEFAULT_FRESHNESS_POLICY,
  type FreshnessPolicy,
  deriveFreshness,
  freshnessPolicySchema,
  parseFreshnessPolicy,
} from "./deriveFreshness.js";

/** A fixed instant. Nothing here reads a clock; `now` is always an argument. */
const NOW = 1_755_600_000_000;

/** Builds a `receivedAt` the given number of milliseconds before NOW. */
function receivedAgo(ageMs: number): number {
  return NOW - ageMs;
}

describe("DEFAULT_FRESHNESS_POLICY", () => {
  it("carries the ADR 3 thresholds", () => {
    expect(DEFAULT_FRESHNESS_POLICY).toEqual({ liveThresholdMs: 2_000, staleThresholdMs: 10_000 });
  });

  it("omits the sweep interval, which is the server's scheduling concern", () => {
    // ADR 3 puts sweepIntervalMs in config/freshness.json alongside the
    // thresholds, but the pure derivation cannot use it. Including it here
    // would imply this function knows how often it is called.
    expect(DEFAULT_FRESHNESS_POLICY).not.toHaveProperty("sweepIntervalMs");
  });
});

describe("deriveFreshness thresholds", () => {
  it("returns unknown when no telemetry has ever been received", () => {
    // A registered robot from the fleet manifest that has not reported. Not
    // unreachable: the console has never had an answer to lose (ADR 3).
    expect(deriveFreshness({ receivedAt: null, now: NOW })).toBe("unknown");
  });

  it("returns live from age 0 through the inclusive live threshold", () => {
    expect(deriveFreshness({ receivedAt: receivedAgo(0), now: NOW })).toBe("live");
    expect(deriveFreshness({ receivedAt: receivedAgo(1), now: NOW })).toBe("live");
    expect(deriveFreshness({ receivedAt: receivedAgo(1_999), now: NOW })).toBe("live");
    expect(deriveFreshness({ receivedAt: receivedAgo(2_000), now: NOW })).toBe("live");
  });

  it("returns stale above the live threshold through the inclusive stale threshold", () => {
    expect(deriveFreshness({ receivedAt: receivedAgo(2_001), now: NOW })).toBe("stale");
    expect(deriveFreshness({ receivedAt: receivedAgo(9_999), now: NOW })).toBe("stale");
    expect(deriveFreshness({ receivedAt: receivedAgo(10_000), now: NOW })).toBe("stale");
  });

  it("returns unreachable above the stale threshold", () => {
    expect(deriveFreshness({ receivedAt: receivedAgo(10_001), now: NOW })).toBe("unreachable");
    expect(deriveFreshness({ receivedAt: receivedAgo(60_000), now: NOW })).toBe("unreachable");
  });

  it("honours custom valid thresholds", () => {
    const policy: FreshnessPolicy = { liveThresholdMs: 500, staleThresholdMs: 1_500 };

    expect(deriveFreshness({ receivedAt: receivedAgo(500), now: NOW, policy })).toBe("live");
    expect(deriveFreshness({ receivedAt: receivedAgo(501), now: NOW, policy })).toBe("stale");
    expect(deriveFreshness({ receivedAt: receivedAgo(1_500), now: NOW, policy })).toBe("stale");
    expect(deriveFreshness({ receivedAt: receivedAgo(1_501), now: NOW, policy })).toBe(
      "unreachable",
    );
  });

  it("supports a policy whose thresholds are equal, skipping stale entirely", () => {
    const policy: FreshnessPolicy = { liveThresholdMs: 1_000, staleThresholdMs: 1_000 };

    expect(deriveFreshness({ receivedAt: receivedAgo(1_000), now: NOW, policy })).toBe("live");
    expect(deriveFreshness({ receivedAt: receivedAgo(1_001), now: NOW, policy })).toBe(
      "unreachable",
    );
  });
});

describe("deriveFreshness clock behaviour", () => {
  it("treats a receipt time in the future as live rather than as an error", () => {
    // A negative age can only come from the server's own clock, because
    // receivedAt and now are both read from it — vendor clock skew lives in
    // reportedAt, which this function never sees. Sub-millisecond ordering
    // noise is therefore the only cause, and clamping to age 0 is correct.
    expect(deriveFreshness({ receivedAt: NOW + 1, now: NOW })).toBe("live");
    expect(deriveFreshness({ receivedAt: NOW + 60_000, now: NOW })).toBe("live");
  });

  it("handles the largest supported epoch values without precision surprises", () => {
    expect(deriveFreshness({ receivedAt: MAX_EPOCH_MS, now: MAX_EPOCH_MS })).toBe("live");
    expect(deriveFreshness({ receivedAt: MAX_EPOCH_MS - 10_001, now: MAX_EPOCH_MS })).toBe(
      "unreachable",
    );
  });

  it("is a pure function of its arguments", () => {
    const input = { receivedAt: receivedAgo(3_000), now: NOW } as const;

    expect(deriveFreshness(input)).toBe("stale");
    expect(deriveFreshness(input)).toBe("stale");
    // Same input, same answer, no matter how much wall-clock time passes
    // between calls — the sweep's schedule cannot change a verdict.
    expect(input).toEqual({ receivedAt: receivedAgo(3_000), now: NOW });
  });

  it("ignores reportedAt entirely, because it is not passed at all", () => {
    // Structural rather than behavioural: the input type has no reportedAt, so
    // "never use reportedAt to derive freshness" is enforced by the signature
    // rather than by review (ADR 3).
    expect(Object.keys({ receivedAt: 0, now: 0 })).toEqual(["receivedAt", "now"]);
  });
});

describe("freshnessPolicySchema", () => {
  it("accepts the default policy and other valid threshold pairs", () => {
    expect(freshnessPolicySchema.safeParse(DEFAULT_FRESHNESS_POLICY).success).toBe(true);
    expect(
      freshnessPolicySchema.safeParse({ liveThresholdMs: 0, staleThresholdMs: 0 }).success,
    ).toBe(true);
  });

  it("rejects a live threshold greater than the stale threshold", () => {
    // Otherwise stale is unreachable as a state, and a reader of the config
    // would have no way to tell from the values alone.
    const result = parseFreshnessPolicy({ liveThresholdMs: 10_000, staleThresholdMs: 2_000 });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.issues[0]?.path).toBe("liveThresholdMs");
  });

  it("rejects negative, fractional, and non-finite thresholds", () => {
    for (const bad of [-1, 1.5, Number.NaN, Infinity, "2000", null]) {
      expect(
        freshnessPolicySchema.safeParse({ liveThresholdMs: bad, staleThresholdMs: 10_000 }).success,
      ).toBe(false);
    }
  });

  it("rejects a policy carrying a sweep interval, which belongs to the server", () => {
    expect(
      freshnessPolicySchema.safeParse({ ...DEFAULT_FRESHNESS_POLICY, sweepIntervalMs: 500 })
        .success,
    ).toBe(false);
  });

  it("rejects missing thresholds rather than defaulting them", () => {
    // A default here would hide a truncated config file behind plausible
    // behaviour, which is the class of failure Principle 2 exists to stop.
    expect(freshnessPolicySchema.safeParse({ liveThresholdMs: 2_000 }).success).toBe(false);
    expect(freshnessPolicySchema.safeParse({}).success).toBe(false);
  });
});
