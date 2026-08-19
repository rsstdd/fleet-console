import { z } from "zod";

import {
  epochMillisecondsSchema,
  identifierSchema,
  type ParseResult,
  parseWith,
  schemaVersionSchema,
  sequenceHealthSchema,
} from "../shared/primitives.js";

/**
 * The `GET /api/health` response: process-lifetime operational counters, at the scope
 * each one actually has.
 *
 * Modelled here rather than in `packages/server` because the console decodes everything
 * it receives (Principle 2), which makes this a boundary type whether or not this package
 * admits it. `packages/contracts/TODO.md` § 6 said server-only response composition stays
 * in the server; ADR 25 narrows that to responses **no console reads**, because the
 * alternative had already produced two spellings of one fact.
 *
 * **Every counter here is adapter-scoped or process-scoped. None is per robot.** That is
 * the decision, not an accident of what was easy: the unknown-field ledger counts per
 * adapter and has no per-robot precision to offer (ADR 15), so a per-robot number here
 * would imply an accuracy that does not exist. The one genuinely per-robot fact —
 * sequence continuity — lives on `robotDiagnosticEnvelopeSchema` instead.
 *
 * Coupling: `packages/server/src/health/healthMetrics.ts` accumulates these values and
 * `packages/adapters`' `UnknownFieldSnapshot` supplies the unknown-field half. This schema
 * is the shape they must serialize into; neither of those types is on the wire.
 */

/** One adapter's unrecognized-field counts, by dotted path. */
export const unknownFieldTallySchema = z.strictObject({
  /** Total unrecognized field occurrences this adapter has seen. */
  total: z.number().int().min(0),
  /** Occurrences per dotted field path. */
  fields: z.record(z.string().min(1), z.number().int().min(0)),
});

/** Unrecognized-field counts for one adapter. */
export type UnknownFieldTally = z.infer<typeof unknownFieldTallySchema>;

/**
 * The population the unknown-field counts cover.
 *
 * Carried as data rather than left to a comment, so the console renders its caveat from
 * the value (ADR 15). Today the only population is payloads a vendor schema accepted; a
 * rejected-payload ledger would arrive as a second scope beside this one, and no consumer
 * would rename anything.
 */
export const unknownFieldScopeSchema = z.enum(["accepted"]);

/** The population an unknown-field count covers. */
export type UnknownFieldScope = z.infer<typeof unknownFieldScopeSchema>;

/**
 * What one adapter has done and seen.
 *
 * `sequence` here is the adapter's rollup across every robot it decodes — "is this
 * dialect ordered at all" — and is a different question from the per-robot
 * `sequenceHealth` on the diagnostic envelope. They share one schema so "not evaluated"
 * has one representation, and they must never be summed or substituted (ADR 25).
 */
export const adapterHealthSchema = z.strictObject({
  /** Payloads this adapter rejected or failed to map. */
  failures: z.number().int().min(0),
  unknownFields: unknownFieldTallySchema,
  sequence: sequenceHealthSchema,
});

/** One adapter's operational counters. */
export type AdapterHealth = z.infer<typeof adapterHealthSchema>;

/** Sweep scheduling health: how often a freshness tick ran late, and by how much. */
export const lateFreshnessTicksSchema = z.strictObject({
  count: z.number().int().min(0),
  /** Null until a tick has actually run late; zero would claim a measured on-time tick. */
  lastLatenessMs: z.number().int().min(0).nullable(),
});

/**
 * The health response.
 *
 * `byAdapter` is keyed by open identifier, never a closed enum: adding a vendor is an
 * adapter change and never a contracts change (ADR 1), and an enum here would make it one.
 *
 * `malformedIngest` and the unknown-field totals must **never be summed**. Their pairing
 * is the signal — a vendor that breaks and changes shape at once shows a flat unknown-field
 * ledger and a climbing malformed count — and adding them destroys exactly that (ADR 15).
 */
export const healthResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  capturedAt: epochMillisecondsSchema,
  /** Requests rejected before an adapter ran, at process scope. */
  malformedIngest: z.number().int().min(0),
  /** Requests naming a vendor with no adapter, at process scope (ADR 8). */
  unsupportedVendors: z.number().int().min(0),
  unknownFieldScope: unknownFieldScopeSchema,
  byAdapter: z.record(identifierSchema, adapterHealthSchema),
  lateFreshnessTicks: lateFreshnessTicksSchema,
});

/** Process-lifetime operational counters served at `GET /api/health`. */
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Decodes an untrusted health response from the wire. */
export function parseHealthResponse(input: unknown): ParseResult<HealthResponse> {
  return parseWith(healthResponseSchema, input);
}
