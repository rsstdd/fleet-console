import { z } from "zod";
import { type ParseResult, parseWith, schemaVersionSchema } from "./primitives.js";

export const ADAPTER_ERROR_KINDS = [
  "malformed_payload",
  "unmappable_value",
  "unsupported_dialect",
] as const;
export const adapterErrorKindSchema = z.enum(ADAPTER_ERROR_KINDS);
export type AdapterErrorKind = z.infer<typeof adapterErrorKindSchema>;

export const ERROR_KINDS = [
  ...ADAPTER_ERROR_KINDS,
  "unsupported_vendor",
  "not_found",
  "payload_too_large",
  "internal",
] as const;
export const errorKindSchema = z.enum(ERROR_KINDS);
export type ErrorKind = z.infer<typeof errorKindSchema>;

export const contractIssueSchema = z.strictObject({
  path: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const errorEnvelopeSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  error: z.strictObject({
    kind: errorKindSchema,
    message: z.string().min(1),
    issues: z.array(contractIssueSchema),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function parseErrorEnvelope(input: unknown): ParseResult<ErrorEnvelope> {
  return parseWith(errorEnvelopeSchema, input);
}
