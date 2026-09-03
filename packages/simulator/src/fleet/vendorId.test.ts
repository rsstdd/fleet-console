import { SUPPORTED_VENDORS, isSupportedVendor } from "@fleet/adapters";
import { describe, expect, it } from "vitest";

import { VENDOR_IDS } from "./simulatedRobot.ts";
import { createFleet } from "./createFleet.ts";

/**
 * The guard `simulatedRobot.ts` names, and D7's resolution (ADR 16).
 *
 * This package restates the three vendor identifiers rather than importing them,
 * because a production import from adapters would invert the dependency the
 * simulator exists to exercise: it must stay able to emit a payload the adapters
 * reject. That duplication is deliberate. What it needs is something that fails
 * when the two copies stop matching, and until now nothing did — the source
 * comment named a `vendorId.test.ts` that did not exist, which reads as verified
 * and is therefore worse than plain duplication.
 *
 * `@fleet/adapters` is a **dev** dependency and this is the only file permitted
 * to import it. `eslint.config.js` bans the specifier in production code and
 * lifts the ban for test files only; `src/__enforcement__/` pins both
 * directions so the ban cannot go inert (Principle 15).
 *
 * What this does *not* assert: that a dialect decodes. That is the adapter
 * contract tests' job, on recorded fixtures (ADR 13). This file answers one
 * narrower question — is every vendor this simulator emits a vendor some adapter
 * claims to handle — which is the question two copies of a list can get wrong.
 */
describe("supported vendor parity", () => {
  it("emits exactly the vendors the adapters claim to support", () => {
    // Order included: both lists are declaration-ordered and both are used to
    // drive round-robin allocation and dispatch. Comparing as sets would let the
    // two disagree on order while this test stayed green.
    expect([...VENDOR_IDS]).toEqual([...SUPPORTED_VENDORS]);
  });

  it("emits no vendor the adapters would reject at ingest", () => {
    // The asymmetric half, stated separately because it is the failure with
    // consequences: a vendor here but not there is a dialect nothing can decode,
    // and `packages/server`'s manifest schema enumerates SUPPORTED_VENDORS, so
    // it also fails startup for every robot naming it.
    for (const vendor of VENDOR_IDS) {
      expect(isSupportedVendor(vendor)).toBe(true);
    }
  });

  it("leaves no supported vendor without a producer", () => {
    // The other direction. An adapter with nothing emitting its dialect is dead
    // code whose contract test is the only thing exercising it, which is how a
    // vendor gets quietly dropped from the demo without anything failing.
    for (const vendor of SUPPORTED_VENDORS) {
      expect(VENDOR_IDS).toContain(vendor);
    }
  });

  it("puts every supported vendor into a fleet large enough to hold them all", () => {
    // Parity between two literals is not the same as parity in what actually
    // gets built: `vendorFor` allocates round-robin over VENDOR_IDS, so this
    // catches an allocation rule that skips a vendor the list still contains.
    const built = new Set(createFleet(SUPPORTED_VENDORS.length, 1).map((r) => r.identity.vendor));

    expect([...built].sort()).toEqual([...SUPPORTED_VENDORS].sort());
  });
});
