import { z } from "zod";
import {
  type EpochMilliseconds,
  type FreshnessState,
  type ParseResult,
  parseWith,
} from "./primitives.js";

export const freshnessPolicySchema = z
  .strictObject({
    liveThresholdMs: z.number().int().min(0),
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
export type FreshnessPolicy = z.infer<typeof freshnessPolicySchema>;

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = Object.freeze({
  liveThresholdMs: 2_000,
  staleThresholdMs: 10_000,
});

export interface DeriveFreshnessInput {
  readonly receivedAt: EpochMilliseconds | null;
  readonly now: EpochMilliseconds;
  readonly policy?: FreshnessPolicy;
}

/** Callers supply time so freshness never depends on a hidden wall clock. */
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
  return ageMs <= policy.staleThresholdMs ? "stale" : "unreachable";
}

export function parseFreshnessPolicy(input: unknown): ParseResult<FreshnessPolicy> {
  return parseWith(freshnessPolicySchema, input);
}
