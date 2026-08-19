/**
 * The one way in: which adapter decodes a payload, chosen from a vendor id.
 *
 * `packages/server` imports this and never a vendor module (adapters TODO C8,
 * AGENTS.md § Required structure). That is not a tidiness rule. A server that
 * imports `vendors/a/adapter.ts` directly has a `switch` on vendor in the ingest
 * path, and ADR 1 puts every vendor difference on this side of the boundary —
 * the moment transport knows which vendors exist, adding one stops being local
 * to this package.
 *
 * ## The registry owns the ledger
 *
 * `createAdapterRegistry` takes no arguments and builds its own
 * `UnknownFieldLedger`, rather than accepting one. ADR 1 permits exactly one
 * counting scope, per adapter and never per robot, and `UnknownFieldSnapshot` can
 * express no other. A ledger parameter here would let a caller pass a fresh one
 * per request — every tally reading 0 or 1, no test failing, and the counter
 * silently answering a different question than the one ADR 15 asks. One registry
 * is one process's tally because there is no argument with which to say otherwise.
 *
 * The per-vendor `create<Vendor>Adapter(ledger)` factories still take one; that is
 * how the contract tests give each suite an isolated count, and a test holding its
 * own ledger is not a second production scope.
 *
 * ## Dispatch is a switch, and the switch is the mapping
 *
 * There is no lookup table beside it. A `Record<SupportedVendor, VendorAdapter>`
 * would be exhaustive too, but reading from it yields `VendorAdapter | undefined`
 * under `noUncheckedIndexedAccess`, so dispatch would carry a branch for a case the
 * key type has already excluded — untestable code that exists to satisfy the
 * checker. Keeping the three bindings and switching over them leaves
 * `switch-exhaustiveness-check` as the only thing standing between a fourth
 * `SupportedVendor` and a compile error, which is what C8 asks for.
 */
import type { AdapterEnvelope } from "@fleet/contracts";

import type { VendorAdapter } from "./core/adapter.ts";
import type { AdapterResult } from "./core/result.ts";
import {
  createUnknownFieldLedger,
  type UnknownFieldSnapshot,
} from "./core/unknownFields.ts";
import type { SupportedVendor } from "./core/vendor.ts";
import { createVendorAAdapter } from "./vendors/a/adapter.ts";
import { createVendorBAdapter } from "./vendors/b/adapter.ts";
import { createVendorCAdapter } from "./vendors/c/adapter.ts";

/** Dispatch over every vendor dialect this package can decode, plus their shared tally. */
export interface AdapterRegistry {
  /**
   * Decodes one untrusted payload with the adapter for `vendor`.
   *
   * `vendor` is `SupportedVendor` rather than `unknown` because rejecting an
   * unrecognized one is a different outcome with a different status code, and it
   * happens before a body byte is read — `selectIngestVendor` in `packages/server`
   * owns it (ADR 8, ADR 20). Widening this parameter would give the same refusal
   * two homes.
   */
  decodeTelemetry(
    vendor: SupportedVendor,
    raw: unknown,
    receivedAt: number,
  ): AdapterResult<AdapterEnvelope>;

  /**
   * The unknown-field counts accumulated across every decode this registry has
   * dispatched, for ADR 25's health response.
   *
   * A snapshot rather than the ledger, so a consumer can read the tally without
   * being handed the thing that writes it.
   */
  unknownFields(): UnknownFieldSnapshot;
}

/** Builds a dispatch registry over all three vendor adapters and one shared ledger. */
export function createAdapterRegistry(): AdapterRegistry {
  const ledger = createUnknownFieldLedger();

  // Built once, not per payload. Each factory closes over the ledger, so building
  // per call would give every request its own tally — the failure the ledger's
  // ownership rule above exists to prevent — and would re-enter three schema
  // closures at ADR 2's peak rate for nothing.
  const vendorA: VendorAdapter = createVendorAAdapter(ledger);
  const vendorB: VendorAdapter = createVendorBAdapter(ledger);
  const vendorC: VendorAdapter = createVendorCAdapter(ledger);

  return {
    decodeTelemetry(vendor, raw, receivedAt) {
      switch (vendor) {
        case "A":
          return vendorA(raw, receivedAt);
        case "B":
          return vendorB(raw, receivedAt);
        case "C":
          return vendorC(raw, receivedAt);
      }
    },
    unknownFields() {
      return ledger.snapshot();
    },
  };
}
