/**
 * Public-surface test for the package barrel (adapters TODO C9).
 *
 * It asserts the exact export set rather than spot-checking, because the failure
 * it guards against is an accidental addition: an internal helper re-exported
 * once becomes a contract every consumer may depend on, and nothing about that
 * moment looks like a decision. A deliberate addition updates this list.
 *
 * The second list is the one specific to this package. `ABSENT_BY_DECISION` names
 * what must stay internal, so removing a vendor factory from the barrel is a
 * property with a test rather than a thing someone remembered. That matters more
 * here than in `packages/contracts`: re-exporting `createVendorCAdapter` compiles,
 * passes every other test, and quietly gives a consumer the vendor conditional
 * ADR 1 exists to prevent.
 *
 * The barrel is imported by relative path rather than by package name: this
 * package's own workspace-import ban admits `@fleet/contracts` and nothing else,
 * self-reference included, and weakening a boundary rule so a test can read
 * prettier is the wrong trade. Resolution by name is proven from the outside
 * anyway — `packages/server` imports `@fleet/adapters` and
 * `packages/web/src/entities/robot/adapterFixtureAccess.test.ts` imports
 * `@fleet/adapters/testing` — and the third case below covers the half neither
 * of those can see, which is that no *other* path resolves at all.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as adapters from "./index.ts";
import { FIXTURE_RECORDING, loadVendorFixture } from "./testing/index.ts";

/** Every runtime name the barrel exports; types are absent by construction. */
const EXPECTED_RUNTIME_EXPORTS: readonly string[] = [
  // core/result — the failure vocabulary the server maps onto HTTP (ADR 20)
  "failure",
  "isOk",
  "issuesForKind",
  "ok",
  // core/vendor — the key set the ingest boundary validates a route against
  "SUPPORTED_VENDORS",
  "isSupportedVendor",
  // registry — dispatch
  "createAdapterRegistry",
];

/**
 * Names that exist in this package and must not be reachable from outside it.
 *
 * Each is what an adapter is written *with* rather than what a consumer decodes
 * *through*. The vendor factories are the load-bearing entries: the deep-import
 * lint rule in `packages/server` stops `@fleet/adapters/vendors/a/adapter` and
 * would not have stopped a named import from the root, so the absence of the name
 * is the enforcement.
 */
const ABSENT_BY_DECISION: readonly string[] = [
  "createVendorAAdapter",
  "createVendorBAdapter",
  "createVendorCAdapter",
  "createUnknownFieldLedger",
  "noteAcceptedPayload",
  "knownFieldPaths",
  "findUnknownFieldPaths",
];

describe("@fleet/adapters public API", () => {
  it("exports exactly the documented runtime surface", () => {
    expect(Object.keys(adapters).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });

  it("keeps the adapter-authoring internals out of the barrel", () => {
    // Asserted by name rather than left to the list above, so a re-export shows up
    // as this test failing with the offending name instead of as a diff of two
    // sorted arrays a reviewer has to read carefully.
    expect(ABSENT_BY_DECISION.filter((name) => name in adapters)).toEqual([]);
  });

  it("keeps vendor factories and payload schemas private by shape, not by list", () => {
    // The named list above cannot mention a vendor that does not exist yet, and a
    // fourth vendor is exactly when someone re-exports a factory out of habit.
    // Matching the shape covers the case the list structurally cannot.
    const names = Object.keys(adapters);

    expect(names.filter((name) => /^createVendor.+Adapter$/.test(name))).toEqual([]);
    expect(names.filter((name) => /PayloadSchema$/.test(name))).toEqual([]);
  });

  it("admits exactly two entry points and no deep path", () => {
    // The barrel rule is only as good as the resolution rule under it. A wildcard
    // subpath added here would reopen every internal module to consumers without
    // changing a line of TypeScript.
    const manifest: unknown = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );

    expect(manifest).toMatchObject({
      exports: { ".": "./src/index.ts", "./testing": "./src/testing/index.ts" },
    });
    expect(Object.keys(asRecord(asRecord(manifest).exports)).sort()).toEqual([".", "./testing"]);
  });

  it("decodes every supported vendor from the barrel alone", () => {
    // The whole consumer path: choose an adapter from an untrusted route segment,
    // dispatch, read the tally. If any step needed a name that is not exported, the
    // barrel is incomplete and a consumer would deep-import to finish the job.
    const registry = adapters.createAdapterRegistry();

    const decoded = adapters.SUPPORTED_VENDORS.filter((vendor) => {
      if (!adapters.isSupportedVendor(vendor)) return false;
      const result = registry.decodeTelemetry(
        vendor,
        loadVendorFixture(vendor).payload,
        FIXTURE_RECORDING.instantMs + 250,
      );
      return adapters.isOk(result);
    });

    expect(decoded).toEqual(adapters.SUPPORTED_VENDORS);
    expect(registry.unknownFields().scope).toBe("accepted");
  });
});

/** Narrows parsed JSON to a readable record without a type assertion. */
function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("package.json did not parse to an object.");
  }
  return { ...value };
}
