/**
 * The dispatch registry's contract (adapters TODO C8).
 *
 * `switch-exhaustiveness-check` already proves the switch covers every
 * `SupportedVendor`. It cannot prove any branch reaches the *right* adapter, and
 * a swapped pair typechecks perfectly, so the wiring is asserted here — by
 * decoding each vendor's own recorded payload and reading the `vendorId` the
 * adapter itself stamped, which no other branch would produce.
 *
 * The other half is the shared ledger. One registry is one process's tally, and
 * the only way to see that from outside is that counts survive across calls and
 * stay on the vendor that earned them.
 */
import { describe, expect, it } from "vitest";

import { createAdapterRegistry } from "./registry.ts";
import { SUPPORTED_VENDORS, type SupportedVendor } from "./core/vendor.ts";
import {
  FIXTURE_RECORDING,
  listMalformedPayloads,
  loadMalformedPayload,
  loadVendorFixture,
} from "./testing/index.ts";

/** One instant after the pinned recording instant, matching the per-vendor suites. */
const RECEIVED_AT = FIXTURE_RECORDING.instantMs + 250;

/** The vendor whose dialect is not `vendor`, for the cross-dialect rejection cases. */
function otherThan(vendor: SupportedVendor): SupportedVendor {
  const other = SUPPORTED_VENDORS.find((candidate) => candidate !== vendor);
  if (other === undefined) {
    throw new Error("SUPPORTED_VENDORS holds fewer than two dialects.");
  }
  return other;
}

describe("adapter dispatch", () => {
  it.each(SUPPORTED_VENDORS)("routes vendor %s to the adapter that stamps its own id", (vendor) => {
    // The assertion that catches a swapped branch: every adapter writes its own
    // `vendorId`, so a payload routed to the wrong one decodes fine and answers
    // with the wrong name rather than failing.
    const result = createAdapterRegistry().decodeTelemetry(
      vendor,
      loadVendorFixture(vendor).payload,
      RECEIVED_AT,
    );

    expect(result.ok && result.value.vendorId).toBe(vendor);
  });

  it.each(SUPPORTED_VENDORS)("decodes every vendor the package claims to support", (vendor) => {
    // Runtime completeness against `SUPPORTED_VENDORS` rather than against the
    // switch. A vendor listed there with no working branch is an ingest route the
    // server advertises and cannot serve, and the type checker sees no problem
    // because `isSupportedVendor` and the switch read the same union.
    expect(
      createAdapterRegistry().decodeTelemetry(
        vendor,
        loadVendorFixture(vendor).payload,
        RECEIVED_AT,
      ).ok,
    ).toBe(true);
  });

  it.each(SUPPORTED_VENDORS)("rejects a payload from a dialect other than %s", (vendor) => {
    // Dispatch selects one adapter; it never tries the others. Without this, a
    // registry that fell back through all three would pass every test above.
    const result = createAdapterRegistry().decodeTelemetry(
      vendor,
      loadVendorFixture(otherThan(vendor)).payload,
      RECEIVED_AT,
    );

    expect(result.ok).toBe(false);
  });

  it.each(listMalformedPayloads())(
    "refuses $vendor/$name with a result, never a throw",
    ({ vendor, name, payload, reason }) => {
      // The definition of done says *every* malformed fixture returns an
      // `AdapterResult` failure and none throws. That was three hand-written tests
      // that happened to cover the three fixtures, so a fourth would have been
      // silently unexercised. Driving the list makes the claim universal: adding a
      // fixture adds a case here whether or not anyone remembers to.
      //
      // "Never a throw" is the load-bearing half. A vendor payload reaching the
      // ingest handler as an exception rather than a value is how a decode failure
      // becomes a 500 instead of the 400 ADR 20 specifies.
      const decode = () => createAdapterRegistry().decodeTelemetry(vendor, payload, RECEIVED_AT);

      expect(decode).not.toThrow();
      const result = decode();

      expect(result.ok, `${vendor}/${name} was accepted; it ${reason}`).toBe(false);
      expect(!result.ok && result.error.vendor).toBe(vendor);
      expect(!result.ok && result.error.issues.length).toBeGreaterThan(0);
    },
  );

  it("passes the caller's receipt instant through untouched", () => {
    // ADR 3: the server owns the only clock this package may trust. A registry
    // that defaulted or rounded `receivedAt` would be a second authority.
    const result = createAdapterRegistry().decodeTelemetry(
      "B",
      loadVendorFixture("B").payload,
      RECEIVED_AT,
    );

    expect(result.ok && result.value.receivedAt).toBe(RECEIVED_AT);
  });

  it("surfaces a vendor's own rejection rather than one of its own", () => {
    const { payload } = loadMalformedPayload("C", "unparsable-timestamp");

    const result = createAdapterRegistry().decodeTelemetry("C", payload, RECEIVED_AT);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.vendor).toBe("C");
  });
});

describe("the registry's unknown-field ledger", () => {
  it("counts across calls, which is how one process keeps one tally", () => {
    // Vendor C's dialect is the only one carrying an undeclared field, so it is the
    // only place accumulation is visible. Two decodes and a count of one would mean
    // the adapters — and their ledger — were rebuilt per payload.
    const registry = createAdapterRegistry();

    registry.decodeTelemetry("C", loadVendorFixture("C").payload, RECEIVED_AT);
    registry.decodeTelemetry("C", loadVendorFixture("C").payload, RECEIVED_AT);

    expect(registry.unknownFields().byAdapter.C.fields).toEqual({
      "telemetry.firmware_channel": 2,
    });
  });

  it("keeps each adapter's count to itself", () => {
    // Per adapter, never per robot and never pooled (ADR 1). One shared ledger is
    // the point; one shared *number* would be the defect.
    const registry = createAdapterRegistry();

    registry.decodeTelemetry("C", loadVendorFixture("C").payload, RECEIVED_AT);

    const { byAdapter } = registry.unknownFields();

    expect([byAdapter.A.total, byAdapter.B.total, byAdapter.C.total]).toEqual([0, 0, 1]);
  });

  it("gives every registry its own tally", () => {
    // Two registries in one process are two counting scopes. That is a caller
    // mistake rather than a supported mode, and it should read as one — not as a
    // number that quietly includes someone else's payloads.
    const first = createAdapterRegistry();
    const second = createAdapterRegistry();

    first.decodeTelemetry("C", loadVendorFixture("C").payload, RECEIVED_AT);

    expect(second.unknownFields().byAdapter.C.total).toBe(0);
  });

  it("labels the population the counts cover", () => {
    // ADR 15: the scope travels as data so the health endpoint says what the number
    // means rather than a comment saying it somewhere else.
    expect(createAdapterRegistry().unknownFields().scope).toBe("accepted");
  });

  it("counts nothing for a payload the schema rejected", () => {
    // A payload no vendor schema accepted belongs to the server's malformed-ingest
    // counter, and the two must never be summed (ADR 15). Vendor B's payload is flat
    // where vendor C's is nested, so C's schema refuses it before any walk.
    const registry = createAdapterRegistry();

    registry.decodeTelemetry("C", loadVendorFixture("B").payload, RECEIVED_AT);

    expect(registry.unknownFields().byAdapter.C.total).toBe(0);
  });

  it("counts a payload the schema accepted and the mapping then rejected", () => {
    // Written expecting zero, and wrong: ADR 15 § Decision, amended 20 August 2026,
    // puts the gate at *schema* acceptance and not at overall success. This payload
    // is well-formed vendor C carrying an unparsable timestamp, so the ledger is
    // written and the decode still fails — and that is the point, because a vendor
    // shipping a new field and a bad value in one release is dialect change, which
    // is the signal the ledger exists for.
    //
    // Pinned from out here as well as in the vendor suites: the registry is what the
    // health endpoint reads, so a later reordering inside one adapter would change
    // the population this number covers without touching anything else server-side.
    const registry = createAdapterRegistry();
    const { payload } = loadMalformedPayload("C", "unparsable-timestamp");

    const result = registry.decodeTelemetry("C", payload, RECEIVED_AT);

    expect(result.ok).toBe(false);
    expect(registry.unknownFields().byAdapter.C.fields).toEqual({
      "telemetry.firmware_channel": 1,
    });
  });
});
