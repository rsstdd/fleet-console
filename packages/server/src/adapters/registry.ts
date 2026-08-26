import type { AdapterEnvelope, UnknownFieldTally } from "@fleet/contracts";
import type { AdapterResult, SupportedVendor } from "./result.ts";
import { createUnknownFieldLedger } from "./unknownFields.ts";
import { createVendorAAdapter } from "./vendorA.ts";
import { createVendorBAdapter } from "./vendorB.ts";
import { createVendorCAdapter } from "./vendorC.ts";

export interface AdapterRegistry {
  decode(vendor: SupportedVendor, raw: unknown, receivedAt: number): AdapterResult<AdapterEnvelope>;
  unknownFields(): Readonly<Record<SupportedVendor, UnknownFieldTally>>;
}

/** Adding a vendor must not change the canonical model. */
export function createAdapterRegistry(): AdapterRegistry {
  const ledger = createUnknownFieldLedger();
  const adapters = {
    A: createVendorAAdapter(ledger),
    B: createVendorBAdapter(ledger),
    C: createVendorCAdapter(ledger),
  } as const;

  return {
    decode: (vendor, raw, receivedAt) => adapters[vendor](raw, receivedAt),
    unknownFields: () => ledger.byAdapter(),
  };
}
