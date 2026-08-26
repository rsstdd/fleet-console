import { z } from "zod";
import {
  epochMillisecondsSchema,
  identifierSchema,
  type ParseResult,
  parseWith,
  schemaVersionSchema,
  sequenceHealthSchema,
} from "./primitives.js";

export const unknownFieldTallySchema = z.strictObject({
  total: z.number().int().min(0),
  fields: z.record(z.string().min(1), z.number().int().min(0)),
});
export type UnknownFieldTally = z.infer<typeof unknownFieldTallySchema>;

export const adapterHealthSchema = z.strictObject({
  failures: z.number().int().min(0),
  unknownFields: unknownFieldTallySchema,
  sequence: sequenceHealthSchema,
});
export type AdapterHealth = z.infer<typeof adapterHealthSchema>;

export const lateFreshnessTicksSchema = z.strictObject({
  count: z.number().int().min(0),
  lastLatenessMs: z.number().int().min(0).nullable(),
});

export const healthResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  capturedAt: epochMillisecondsSchema,
  malformedIngest: z.number().int().min(0),
  unsupportedVendors: z.number().int().min(0),
  byAdapter: z.record(identifierSchema, adapterHealthSchema),
  lateFreshnessTicks: lateFreshnessTicksSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export function parseHealthResponse(input: unknown): ParseResult<HealthResponse> {
  return parseWith(healthResponseSchema, input);
}
