import { z } from "zod";

import {
  type EpochMilliseconds,
  type FreshnessState,
  type ParseResult,
  parseWith,
} from "../shared/primitives.js";

/**
 * The pure half of ADR 3's freshness mechanism.
 *
 * ADR 3 splits freshness across two packages deliberately: the derivation — a
 * receipt time, a clock reading and two thresholds in, one of four states out —
 * lives here, where it is a framework-independent unit test against an injected
 * clock. The recurring 500 ms sweep that calls it over the current-state store
 * lives in `packages/server`. Neither half lives in `packages/web`, which
 * receives the result as a field on the envelope and renders it.
 *
 * Coupling: `packages/server`'s sweep is the only production caller, and
 * `config/freshness.json` supplies the policy. `sweepIntervalMs` lives in that
 * same config file but deliberately not in `FreshnessPolicy` — see below.
 */

/**
 * The thresholds freshness is derived against, in milliseconds of age.
 *
 * `sweepIntervalMs` is absent on purpose. It sits beside these two values in
 * `config/freshness.json`, but it describes how often the server calls this
 * function, not how the answer is computed. Including it would imply this
 * function knows its own call schedule, and would let a scheduling change look
 * like a derivation change (ADR 3).
 */
export const freshnessPolicySchema = z
  .strictObject({
    /** Maximum age, inclusive, that still counts as `live`. */
    liveThresholdMs: z.number().int().min(0),
    /** Maximum age, inclusive, that still counts as `stale`. */
    staleThresholdMs: z.number().int().min(0),
  })
  .check((ctx) => {
    if (ctx.value.liveThresholdMs > ctx.value.staleThresholdMs) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        path: ["liveThresholdMs"],
        message: "liveThresholdMs must not exceed staleThresholdMs, or stale is unreachable.",
      });
    }
  });

/** Validated freshness thresholds, in milliseconds of age. */
export type FreshnessPolicy = z.infer<typeof freshnessPolicySchema>;

/**
 * ADR 3's thresholds: 2 seconds live, 10 seconds stale.
 *
 * A robot reports at roughly 1 Hz, so a 2-second live window means it must miss
 * about two consecutive expected messages before leaving `live`, which tolerates
 * ordinary jitter without over-triggering.
 */
export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = Object.freeze({
  liveThresholdMs: 2_000,
  staleThresholdMs: 10_000,
});

/** Inputs to a single freshness derivation. */
export interface DeriveFreshnessInput {
  /**
   * The server's own receipt instant, or null for a registered robot that has
   * never reported.
   *
   * There is deliberately no `reportedAt` field on this type. ADR 3 requires
   * freshness to read receipt time exclusively, and leaving the vendor-supplied
   * instant out of the signature makes that a structural fact rather than a rule
   * a caller has to remember.
   */
  readonly receivedAt: EpochMilliseconds | null;
  /** The current instant, supplied by the caller. This function reads no clock. */
  readonly now: EpochMilliseconds;
  /** Thresholds to derive against; defaults to ADR 3's values. */
  readonly policy?: FreshnessPolicy;
}

/**
 * Derives a robot's freshness state from its receipt time and an injected
 * current time.
 *
 * Pure: no clock read, no timer, no allocation beyond the returned string, and
 * no mutation of the input. The policy is trusted rather than re-validated on
 * every call — the sweep runs this once per robot twice a second, and the
 * server parses the policy once at startup with `parseFreshnessPolicy`.
 *
 * A receipt time in the future is clamped to age zero and reported `live`. That
 * is safe here specifically because `receivedAt` and `now` are read from the
 * same server clock, so a negative age is sub-millisecond ordering noise rather
 * than skew; vendor clock skew lives in `reportedAt`, which this function never
 * receives.
 */
export function deriveFreshness({
  receivedAt,
  now,
  policy = DEFAULT_FRESHNESS_POLICY,
}: DeriveFreshnessInput): FreshnessState {
  if (receivedAt === null) {
    return "unknown";
  }

  const ageMs = Math.max(0, now - receivedAt);

  if (ageMs <= policy.liveThresholdMs) {
    return "live";
  }

  if (ageMs <= policy.staleThresholdMs) {
    return "stale";
  }

  return "unreachable";
}

/** Decodes an untrusted freshness policy, typically read from `config/freshness.json`. */
export function parseFreshnessPolicy(input: unknown): ParseResult<FreshnessPolicy> {
  return parseWith(freshnessPolicySchema, input);
}
