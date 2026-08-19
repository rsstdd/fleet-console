/**
 * Validated freshness policy: the thresholds and sweep interval ADR 3 requires to live
 * in configuration rather than in the derivation logic.
 *
 * Principle 13 puts deployment policy in typed, validated configuration and Principle 2
 * treats configuration as untrusted external data, so the file is decoded here once and
 * every consumer receives the decoded type. Coupling: `packages/contracts` owns the pure
 * freshness function these values are passed to; this package owns the recurring sweep
 * that calls it (ADR 3 § Implications). Nothing here derives freshness.
 */

import { z } from "zod";

/**
 * The runtime schema for `freshness.json`.
 *
 * Strict, so a key nobody reads is a startup failure rather than a silently ignored
 * intention. ADR 3 includes the late-tick tolerance beside the schedule it qualifies.
 */
export const freshnessPolicySchema = z
  .strictObject({
    /** A robot heard from within this many milliseconds is LIVE. */
    liveThresholdMs: z.number().int().positive(),
    /** A robot heard from within this many milliseconds is STALE; beyond it, UNREACHABLE. */
    staleThresholdMs: z.number().int().positive(),
    /** How often the sweep runs, independently of message arrival and of fan-out flushes. */
    sweepIntervalMs: z.number().int().positive(),
    /** Allowed scheduler drift before the tick is recorded as late. */
    lateTickToleranceMs: z.number().int().min(0),
  })
  .refine((policy) => policy.liveThresholdMs < policy.staleThresholdMs, {
    error: "liveThresholdMs must be less than staleThresholdMs, or no robot can ever be STALE",
    path: ["staleThresholdMs"],
  })
  .refine((policy) => policy.sweepIntervalMs <= policy.liveThresholdMs, {
    // ADR 3 § Assumptions: worst-case detection latency is the threshold plus the sweep
    // interval. An interval longer than the LIVE threshold means a robot can be silent
    // for more than two threshold-widths before anything notices.
    error:
      "sweepIntervalMs must not exceed liveThresholdMs, or silence outlives its own detection window",
    path: ["sweepIntervalMs"],
  });

/** The decoded freshness policy handed to the sweep. */
export type FreshnessPolicy = z.infer<typeof freshnessPolicySchema>;

/**
 * The baseline ADR 3 states: a 500 ms sweep, LIVE through 2 seconds, STALE through 10.
 *
 * This is documentation and test evidence, not a default. A missing or invalid
 * `freshness.json` is a startup failure; falling back to these values would let the
 * server run a policy nobody deployed (Principle 13).
 */
export const ADR3_BASELINE_FRESHNESS_POLICY: FreshnessPolicy = {
  liveThresholdMs: 2_000,
  staleThresholdMs: 10_000,
  sweepIntervalMs: 500,
  lateTickToleranceMs: 100,
};

/** Raised when configuration fails validation at startup. */
export class ConfigValidationError extends Error {
  /** Creates a startup failure naming the configuration source and every invalid field. */
  constructor(source: string, issues: readonly string[]) {
    super(`Invalid configuration in ${source}:\n  - ${issues.join("\n  - ")}`);
    this.name = "ConfigValidationError";
  }
}

/**
 * Decodes untrusted configuration input into a freshness policy, or fails loudly.
 *
 * Takes already-parsed JSON rather than a path so the validation rules are testable
 * without a filesystem; the thin file read belongs in the composition root.
 */
export function parseFreshnessPolicy(input: unknown, source = "freshness.json"): FreshnessPolicy {
  const result = freshnessPolicySchema.safeParse(input);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });
  throw new ConfigValidationError(source, issues);
}
