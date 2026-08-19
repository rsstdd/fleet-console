/**
 * Public entry point for `@fleet/adapters`.
 *
 * Consumers import from the package root; deep imports into vendor modules are
 * not part of the contract (AGENTS.md § Required structure). Vendor adapters are
 * added to this file as they land — see `TODO.md`.
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

export {
  type AcceptedPayloadNote,
  createUnknownFieldLedger,
  noteAcceptedPayload,
  type UnknownFieldLedger,
  type UnknownFieldScope,
  type UnknownFieldSnapshot,
  type UnknownFieldTally,
} from "./core/unknownFields.ts";
export { findUnknownFieldPaths, knownFieldPaths } from "./core/unknownFieldPaths.ts";

export { isSupportedVendor, SUPPORTED_VENDORS, type SupportedVendor } from "./core/vendor.ts";

export type { VendorAdapter } from "./core/adapter.ts";

export { createVendorAAdapter } from "./vendors/a/adapter.ts";
export { createVendorBAdapter } from "./vendors/b/adapter.ts";
export { createVendorCAdapter } from "./vendors/c/adapter.ts";
