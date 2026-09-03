/**
 * The shape every vendor adapter presents to the dispatch registry.
 *
 * Two arguments and nothing else, which is the signature
 * `docs/03_package-specs/02_ADAPTERS.md` § 1 states and archived joining-plan A-1
 * settled: the payload is untrusted, and receipt time is injected because ADR 3
 * gives the only clock this package may trust to the server boundary.
 *
 * The unknown-field ledger is not an argument here. It is process state owned by
 * the caller, so an adapter is built with `create<Vendor>Adapter(ledger)` and the
 * function that comes back is this — pure in its arguments, with the one piece of
 * shared state closed over rather than threaded through every call site. Making
 * the ledger a third parameter would put a mutable object in the signature the
 * package spec describes as pure, and would let a caller pass a different ledger
 * per payload, which is precisely the per-robot accounting ADR 1 forbids.
 */
import type { AdapterEnvelope } from "@fleet/contracts";

import type { AdapterResult } from "./result.ts";

/** Decodes one untrusted vendor payload received at a given instant. */
export type VendorAdapter = (
  payload: unknown,
  receivedAt: number,
) => AdapterResult<AdapterEnvelope>;
