import type { AdapterError } from "@fleet/adapters";
import {
  SCHEMA_VERSION,
  type ContractIssue,
  type ErrorEnvelope,
  type ErrorKind,
} from "@fleet/contracts";

/**
 * The one place an HTTP error body is built.
 *
 * A rejected payload is described in the same vocabulary at every hop: the
 * adapter returns `ContractIssue[]`, this module copies those issues onto the
 * wire unchanged, and the console renders `path` and `code` from them. There is
 * no translation step here, and therefore no place for per-field detail to
 * disappear (ADR 20).
 *
 * Two things are the server's alone and are added here rather than upstream:
 * the HTTP status, and a short summary for logs and non-console callers.
 * Operator copy belongs to `packages/web`, which composes it from `kind` and
 * `issues` rather than from `message` (ADR 20 § Implications).
 *
 * Coupling: `@fleet/contracts` owns `errorEnvelopeSchema` and the `ErrorKind`
 * vocabulary; `@fleet/adapters` produces the three adapter kinds. Adding a kind
 * happens in contracts, and the exhaustive records below stop compiling until
 * this file has decided its status and summary.
 */

/** The HTTP statuses this server returns for a failed request. */
export type ErrorStatus = 400 | 404 | 413 | 500;

/**
 * Status per error kind: the coarse distinction, with `kind` carrying the fine one.
 *
 * Several kinds deliberately share a status. "Your payload is wrong" is one
 * operator problem however the payload was wrong, and a consumer that needs the
 * finer answer reads `kind` — a field it can switch on — instead of a status
 * vocabulary invented for the purpose. An unsupported vendor is the exception
 * ADR 8 § Implications already decided: 404 with its own counter, because
 * "your vendor is not integrated" is a different problem from a bad payload.
 *
 * `payload_too_large` is the second exception (ADR 26). 413 rather than 400 because
 * the caller's remedy is different in kind — send less, rather than send it correctly —
 * and because the rejection happened before anything read the body, so the server has
 * no opinion about whether the payload was well-formed.
 */
const STATUS_BY_KIND: Readonly<Record<ErrorKind, ErrorStatus>> = {
  malformed_payload: 400,
  unmappable_value: 400,
  unsupported_dialect: 400,
  unsupported_vendor: 404,
  not_found: 404,
  payload_too_large: 413,
  internal: 500,
};

/**
 * The summary each kind carries.
 *
 * Fixed strings, deliberately: nothing derived from the request can appear in a
 * summary, so no vendor payload content can reach a log line or an error body
 * through this field (**G6**). What actually failed travels in `issues`.
 */
const SUMMARY_BY_KIND: Readonly<Record<ErrorKind, string>> = {
  malformed_payload: "The payload did not satisfy the vendor schema.",
  unmappable_value: "The payload carried a value with no canonical mapping.",
  unsupported_dialect: "The payload named a dialect version this adapter does not support.",
  unsupported_vendor: "No adapter is registered for that vendor.",
  not_found: "No such resource.",
  // States the limit, because a caller that cannot see it cannot comply. The number
  // is a constant, never anything derived from the request (**G6**).
  payload_too_large: "The request body exceeded the ingest size limit.",
  internal: "The server failed to handle the request.",
};

/** An HTTP status paired with the canonical error body to send with it. */
export interface ErrorResponse {
  readonly status: ErrorStatus;
  readonly body: ErrorEnvelope;
}

/** Builds the status and canonical error body for one failure kind and its issues. */
export function errorResponse(
  kind: ErrorKind,
  issues: readonly ContractIssue[] = [],
): ErrorResponse {
  return {
    status: STATUS_BY_KIND[kind],
    body: {
      schemaVersion: SCHEMA_VERSION,
      error: { kind, message: SUMMARY_BY_KIND[kind], issues: [...issues] },
    },
  };
}

/**
 * Turns an adapter's rejection into an HTTP response.
 *
 * The body's `kind` and `issues` are the adapter's own values, copied and not
 * mapped — which is the property ADR 20 exists to hold, and the reason
 * `AdapterErrorKind` is a subset of `ErrorKind` rather than a parallel union.
 * The vendor is not put on the wire: the caller already knows which vendor it
 * posted to, and it is the adapter-scoped health counter that needs it.
 */
export function errorResponseForAdapterError(error: AdapterError): ErrorResponse {
  return errorResponse(error.kind, error.issues);
}
