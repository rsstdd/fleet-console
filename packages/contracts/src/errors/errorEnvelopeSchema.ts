import { z } from "zod";

import { type ParseResult, parseWith, schemaVersionSchema } from "../shared/primitives.js";

/**
 * The HTTP error body, defined in terms of `ContractIssue` rather than as a
 * third failure shape (ADR 20).
 *
 * Three surfaces describe one rejected payload: the adapter that refused it,
 * the server that counts it and answers the request, and the console that tells
 * a technician what happened. They share this vocabulary, so nothing is
 * translated between hops and no per-field detail is lost on the way.
 *
 * The envelope is designed rather than leaked: it carries a machine-readable
 * `kind`, a short server-authored summary, and the issues. It carries no vendor
 * payload contents, because a `ContractIssue` holds only a path, a category and
 * a message derived from the schema — never a rejected value (`packages/server`
 * TODO **D4**, **G6**).
 */

/**
 * The rejection kinds an adapter can produce, owned here so the adapter, the
 * metric and the wire all name a failure the same way.
 *
 * Coupling: `packages/adapters` re-exports this as its `AdapterErrorKind` and
 * asserts at compile time that it is a subset of `ERROR_KINDS` below, which is
 * what makes the adapter → HTTP hop a copy rather than a mapping (ADR 20).
 */
export const ADAPTER_ERROR_KINDS = [
  /** The payload did not satisfy the vendor's runtime schema. */
  "malformed_payload",
  /** The payload was well-formed but carried a value with no honest canonical mapping. */
  "unmappable_value",
  /** The payload named a dialect version this adapter does not support. */
  "unsupported_dialect",
] as const;

/** Why an adapter refused a payload; each kind is separately countable by the server. */
export const adapterErrorKindSchema = z.enum(ADAPTER_ERROR_KINDS);

/** One of the three adapter rejection kinds. */
export type AdapterErrorKind = z.infer<typeof adapterErrorKindSchema>;

/**
 * Every kind an HTTP error body may carry: the adapter's three, plus the
 * failures only the server can produce.
 *
 * A kind is the finer distinction; the status code is the coarse one. Adding a
 * kind is additive — a new member here does not rename or restate an existing
 * one — which is how the request-size cap that register **D18** is deciding
 * gets its own kind later without a wire migration.
 */
export const ERROR_KINDS = [
  ...ADAPTER_ERROR_KINDS,
  /** The `:vendor` route segment named no adapter in the registry (ADR 8). */
  "unsupported_vendor",
  /** The addressed resource — a robot id, most often — does not exist. */
  "not_found",
  /**
   * The request body exceeded the ingest byte cap and was refused before it was
   * parsed (ADR 26).
   *
   * Deliberately **not** an adapter kind: nothing decoded the payload, so there is no
   * vendor schema opinion to report and no adapter to attribute it to. The rejection
   * happens before `selectIngestVendor`'s work is used and before `JSON.parse`, which
   * is what makes the cap protect the work rather than follow it.
   */
  "payload_too_large",
  /** The server failed for a reason the caller cannot act on. */
  "internal",
] as const;

/** The closed vocabulary of error kinds that may appear on the wire. */
export const errorKindSchema = z.enum(ERROR_KINDS);

/** A machine-readable failure category shared by the adapter, the metric and the wire. */
export type ErrorKind = z.infer<typeof errorKindSchema>;

/**
 * The runtime schema for `ContractIssue`, so the issue vocabulary can cross a
 * network boundary and be decoded rather than trusted (Principle 2).
 *
 * Coupling: `shared/primitives.ts` declares the interface this must match;
 * `errorEnvelopeSchema.test.ts` asserts the two are the same type.
 */
export const contractIssueSchema = z.strictObject({
  path: z.string().min(1),
  code: z.string().min(1),
  message: z.string().min(1),
});

/**
 * The body of every non-2xx JSON response the server returns.
 *
 * Strict, like every other canonical shape: an error body that grew a field is
 * contract drift and must fail loudly rather than be half-read by a console.
 */
export const errorEnvelopeSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  error: z.strictObject({
    kind: errorKindSchema,
    /**
     * A short server-authored summary for logs and non-console callers. The
     * console renders from `kind` and `issues`; operator copy is
     * `packages/web`'s to write and must not be taken from here (ADR 20).
     */
    message: z.string().min(1),
    /** What failed, per field. Empty when the failure is not field-scoped. */
    issues: z.array(contractIssueSchema),
  }),
});

/** A decoded HTTP error body: a kind, a summary, and the issues behind it. */
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** Decodes an untrusted HTTP error body into the canonical error envelope. */
export function parseErrorEnvelope(input: unknown): ParseResult<ErrorEnvelope> {
  return parseWith(errorEnvelopeSchema, input);
}
