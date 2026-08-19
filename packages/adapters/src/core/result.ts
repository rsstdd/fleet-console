/**
 * The explicit success/failure model every adapter returns.
 *
 * Adapters never throw vendor data across the boundary (AGENTS.md § Adapter
 * contract). A rejected payload is a value the caller must handle, which is what
 * lets `packages/server` count rejections for its health endpoint instead of
 * discovering them as unhandled exceptions.
 *
 * The failure detail is `@fleet/contracts`' `ContractIssue`, not a shape of this
 * package's own. One vocabulary describes a decode failure at every hop —
 * adapter, ingest metric, HTTP error body, console — so nothing is translated
 * and no per-field detail disappears on the way (ADR 20).
 */

import type { AdapterErrorKind, ContractIssue } from "@fleet/contracts";

import type { SupportedVendor } from "./vendor.ts";

/**
 * Why an adapter refused a payload; each kind is separately countable by the server.
 *
 * Coupling: the vocabulary is owned by `@fleet/contracts`
 * (`errors/errorEnvelopeSchema.ts`) and re-exported here under this package's
 * own name, because the server puts the same value straight onto the wire. A
 * kind added there is available here with no change; a kind invented here would
 * not survive the hop (ADR 20).
 */
export type { AdapterErrorKind };

/**
 * A structured adapter failure carrying enough detail to diagnose without the raw payload.
 *
 * `issues` is the per-field detail: a vendor schema failure passes
 * `toContractIssues(error.error)` through unchanged, and a rejection with no Zod
 * error behind it synthesizes one issue whose `code` is the kind (see
 * `issuesForKind`). Nothing here holds a rejected value, which is what lets the
 * server serialize these into an error body (`packages/server` **G6**).
 */
export interface AdapterError {
  readonly kind: AdapterErrorKind;
  readonly vendor: SupportedVendor;
  /** What failed, per field; never contains raw vendor payload contents. */
  readonly issues: readonly ContractIssue[];
}

/** A successful decode carrying the adapter's output value. */
export interface AdapterOk<TValue> {
  readonly ok: true;
  readonly value: TValue;
}

/** A rejected decode carrying the structured reason. */
export interface AdapterFailure {
  readonly ok: false;
  readonly error: AdapterError;
}

/** The result of running one adapter over one vendor payload. */
export type AdapterResult<TValue> = AdapterOk<TValue> | AdapterFailure;

/** Wraps a successfully decoded value as an adapter result. */
export function ok<TValue>(value: TValue): AdapterOk<TValue> {
  return { ok: true, value };
}

/** Wraps a structured rejection as an adapter result. */
export function failure(error: AdapterError): AdapterFailure {
  return { ok: false, error };
}

/**
 * Builds the single-issue list a rejection with no Zod error behind it carries.
 *
 * `malformed_payload` already has issues — the schema produced them. The other
 * two kinds are the adapter's own judgement about an otherwise valid document,
 * so the issue is synthesized here with the kind as its `code`, keeping the
 * codes a closed set rather than three vendors' invented strings (ADR 20).
 *
 * `message` describes the rule that was broken. Never interpolate a value from
 * the payload into it: an issue travels to the console in an HTTP error body,
 * and the guarantee that no vendor content leaks is a property of what goes in
 * here (`packages/server` **G6**).
 */
export function issuesForKind(
  kind: AdapterErrorKind,
  path: string,
  message: string,
): readonly ContractIssue[] {
  return [{ path, code: kind, message }];
}

/** Type guard narrowing an adapter result to its success branch. */
export function isOk<TValue>(result: AdapterResult<TValue>): result is AdapterOk<TValue> {
  return result.ok;
}
