import { isSupportedVendor, type SupportedVendor } from "@fleet/adapters";
import type { ErrorKind } from "@fleet/contracts";

/**
 * Why an ingest request was refused before its body was looked at.
 *
 * One reason today. It is a union rather than a boolean because the ingest
 * boundary's other refusals — an unreadable body, a payload no vendor schema
 * accepts — are counted separately at their own scope, and collapsing them into
 * one rejection would report an integration gap as a data-quality problem
 * (packages/server/AGENTS.md § Ingest boundary).
 *
 * Narrowed out of the contract's `ErrorKind` rather than spelled again here, so
 * this reason and the `kind` the error body carries are the same value and not
 * two strings that agree by review. `errorResponse` turns it into the response
 * (ADR 20).
 */
export type IngestRejectionReason = Extract<ErrorKind, "unsupported_vendor">;

/** A path segment that named a vendor this deployment can decode. */
export interface VendorSelected {
  readonly ok: true;
  readonly vendor: SupportedVendor;
}

/** A path segment that named nothing this deployment can decode. */
export interface VendorRejected {
  readonly ok: false;
  readonly reason: IngestRejectionReason;
  /**
   * 404, not 400: the route named a resource this server does not serve. A
   * malformed *body* is a 400, and keeping the two apart is what lets an
   * operator tell "your vendor is not integrated" from "your payload is wrong".
   */
  readonly status: 404;
}

/** The outcome of choosing an adapter from a route parameter. */
export type VendorSelection = VendorSelected | VendorRejected;

/**
 * Chooses the adapter for an ingest request from the `:vendor` path segment.
 *
 * This is the whole of adapter selection, and it is deliberately the whole of
 * what happens first. Vendor identity travels in the route rather than in the
 * body because the body is untrusted and the vendor is what selects the schema
 * that would make it trustworthy — reading it from the body is circular
 * (ADR 8 § Decision, amended 19 August 2026; register stub D9).
 *
 * The parameter is `unknown` rather than `string` on purpose: a route parameter
 * is untrusted input, and typing it as a string here would push a cast to the
 * caller, which is the coercion Principle 2 exists to prevent at the boundary.
 * The function takes the segment and nothing else, so no body byte can be read
 * before the adapter is chosen — the ordering is a property of the signature
 * rather than a rule a handler must remember.
 *
 * The caller records `HealthMetrics.recordUnsupportedVendor()` on rejection;
 * counting is the server's job, not this function's, and a pure selector stays
 * testable without a metrics instance.
 *
 * Coupling: `isSupportedVendor` in `packages/adapters` is the registry key set
 * this validates against, and `ingestUrlFor` in `packages/simulator` is the
 * caller that builds the route. All three change together (Principle 14).
 */
export function selectIngestVendor(segment: unknown): VendorSelection {
  if (isSupportedVendor(segment)) {
    return { ok: true, vendor: segment };
  }
  return { ok: false, reason: "unsupported_vendor", status: 404 };
}
