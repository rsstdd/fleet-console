/**
 * The vendor dialects this package has an adapter for.
 *
 * Deliberately narrower than the contract, and deliberately not called `VendorId`.
 * `@fleet/contracts` types a vendor id as an open `identifierSchema`, with the stated
 * reason that a closed enum there would make every new vendor a contracts change
 * (ADR 1, Principle 3). This union answers a different question — "do I have a module
 * that can decode this?" — which is finite, knowable at compile time, and is what gives
 * the dispatch switch its exhaustiveness check.
 *
 * The distinction is load-bearing at the ingest boundary. A payload naming vendor D is
 * an unsupported-vendor rejection with its own health metric, not a malformed
 * identifier (packages/server/AGENTS.md § Ingest boundary). Collapsing the two would
 * report an integration gap as a data-quality problem.
 *
 * Names stay generic (A, B, C) by decision in ADR 1; they never name a real integration
 * partner. Coupling: `packages/web/src/entities/robot/model.ts` declares the same three
 * values as `Vendor` for display.
 */
export type SupportedVendor = "A" | "B" | "C";

/** Every vendor dialect this package can decode, in declaration order. */
export const SUPPORTED_VENDORS: readonly SupportedVendor[] = ["A", "B", "C"];

/**
 * Narrows untrusted input to a vendor this package can decode.
 *
 * Takes `unknown` rather than `string` because the server calls it with a route
 * parameter it has not validated yet. Requiring a `string` would push a cast to the
 * caller, which is the coercion Principle 2 exists to prevent at the boundary.
 *
 * That signature was written against an assumption; the assumption is now a decision.
 * ADR 8 § Decision (amended 19 August 2026, ratifying register stub D9) fixes vendor
 * identity in the `:vendor` path segment, validated here before any body byte is read.
 * The register asked whether this parameter should narrow to `string` once the server
 * validated first; it stays `unknown` deliberately — the value arrives from a URL, and
 * a boundary guard that trusts its input to already be a string is a guard with a
 * precondition. Caller: `selectIngestVendor` in `packages/server/src/ingest`.
 */
export function isSupportedVendor(value: unknown): value is SupportedVendor {
  return typeof value === "string" && SUPPORTED_VENDORS.some((vendor) => vendor === value);
}
