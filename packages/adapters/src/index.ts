/**
 * Public entry point for `@fleet/adapters`.
 *
 * This barrel and `./testing` are the whole of the package's contract; the
 * `exports` map in `package.json` admits no other path, and `packages/server`
 * carries a lint fixture proving a deep import into a vendor module is refused
 * (adapters TODO C9, AGENTS.md § Required structure).
 *
 * ## What is not here, and why
 *
 * The per-vendor `create<Vendor>Adapter` factories, the ledger constructor, and
 * the unknown-field path helpers are **internal**. They are what an adapter is
 * written *with*, not what a consumer decodes *through*, and every one of them is
 * reachable inside this package by relative import — which is how the contract
 * tests use them.
 *
 * Exporting the vendor factories would have quietly undone C8. A consumer holding
 * `createVendorCAdapter` is bound to one dialect at a call site outside this
 * package, which is the vendor conditional ADR 1 keeps on this side of the
 * boundary, and no lint rule would catch it: the deep-import ban stops
 * `@fleet/adapters/vendors/c/adapter`, not a named import from the root. Removing
 * the name is the enforcement — there is nothing to ban if there is nothing to
 * import. Dispatch goes through `createAdapterRegistry`.
 *
 * `src/index.test.ts` pins this list exactly, so an internal helper cannot become
 * a public contract by being re-exported once.
 */

export {
  failure,
  isOk,
  issuesForKind,
  ok,
  type AdapterError,
  type AdapterErrorKind,
  type AdapterFailure,
  type AdapterOk,
  type AdapterResult,
} from "./core/result.ts";

/**
 * The tally types only, not the ledger that writes them.
 *
 * `UnknownFieldSnapshot` is the shape ADR 25's health response serves, so it is a
 * consumer type. The ledger is process state the registry owns; handing a consumer
 * the constructor would hand it a second counting scope with nothing to attach it
 * to (ADR 1, ADR 15).
 */
export {
  type UnknownFieldScope,
  type UnknownFieldSnapshot,
  type UnknownFieldTally,
} from "./core/unknownFields.ts";

export { isSupportedVendor, SUPPORTED_VENDORS, type SupportedVendor } from "./core/vendor.ts";

/** Dispatch: the one way a consumer decodes a vendor payload. */
export { createAdapterRegistry, type AdapterRegistry } from "./registry.ts";
