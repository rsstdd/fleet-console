/**
 * Recorded vendor payloads, loadable by vendor and name.
 *
 * This module is the entire content of the `@fleet/adapters/testing` public
 * subpath (ADR 11). It exists so another workspace package can assert against
 * the *exact bytes* an adapter contract test uses, without deep-importing this
 * package's internals and without keeping a second copy that drifts.
 *
 * Deliberately free of Node-only APIs — no `node:fs`, no `import.meta.dirname`,
 * no path resolution. The fixtures are static JSON imports, so a
 * browser-targeted consumer (`packages/web` under jsdom) can load them exactly
 * as a Node consumer does. That constraint is why this is a loader over
 * imported modules rather than a filesystem reader.
 *
 * Coupling: the payloads are recorded output from
 * `packages/simulator/src/vendors/{vendorA,vendorB,vendorC}.ts`, which are the
 * authoritative dialects. When a dialect changes, re-record with
 * `pnpm record:fixtures` — see `README.md` in this directory.
 *
 * That is enforced (ADR 13). CI re-records and fails on any diff, so a dialect
 * change that leaves these files behind breaks the build. The JSON is therefore
 * **generated**: review it, never edit it. `FIXTURE_RECORDING` below is checked
 * too — the recorder reads this file and refuses to run if the pinned inputs it
 * used disagree with the ones declared here, because provenance can go stale
 * while every byte stays correct.
 */
import { SUPPORTED_VENDORS, type SupportedVendor } from "../core/vendor.ts";
import vendorARepresentative from "../vendors/a/__fixtures__/representative.json" with { type: "json" };
import vendorBRepresentative from "../vendors/b/__fixtures__/representative.json" with { type: "json" };
import vendorCRepresentative from "../vendors/c/__fixtures__/representative.json" with { type: "json" };

/** The kinds of recorded payload a vendor can have. */
export type VendorFixtureName = "representative";

/**
 * The simulator inputs these fixtures were recorded from.
 *
 * Pinned so the recording is reproducible: the same seed, fleet size and
 * instant produce these bytes again. A test asserting an exact canonical output
 * uses `instantMs` as its `receivedAt` rather than reading a clock.
 */
export const FIXTURE_RECORDING = {
  /** `createFleet(fleetSize, seed)` in `packages/simulator`. */
  seed: 1,
  fleetSize: 9,
  /** The wall-clock instant passed to `buildPayload`, as epoch milliseconds. */
  instantMs: 1_755_600_000_000,
} as const;

/** One recorded vendor payload with the provenance needed to reproduce it. */
export interface VendorFixture {
  readonly vendor: SupportedVendor;
  readonly name: VendorFixtureName;
  /** The simulated robot this payload came from, in the vendor's own spelling. */
  readonly robotId: string;
  /** The pinned instant the payload was recorded at, as epoch milliseconds. */
  readonly recordedAt: number;
  /**
   * The payload exactly as the vendor sends it.
   *
   * Typed `unknown` on purpose: a contract test must enter the adapter through
   * the same untrusted door production does. A typed fixture would let a test
   * pass while the schema it is meant to exercise is wrong.
   */
  readonly payload: unknown;
}

function fixture(vendor: SupportedVendor, robotId: string, payload: unknown): VendorFixture {
  return {
    vendor,
    name: "representative",
    robotId,
    recordedAt: FIXTURE_RECORDING.instantMs,
    payload,
  };
}

/**
 * Every recorded payload, keyed by vendor and then by name.
 *
 * The inner record is `Partial` because a fixture name is not guaranteed to
 * exist for every vendor: the malformed and boundary cases adapters `TODO.md`
 * **C1** calls for are per-vendor by nature — only vendor C has an undocumented
 * field to record — so a total record would be a promise this package cannot
 * keep. That partiality is what makes the lookup guard below real rather than
 * decorative.
 */
const FIXTURES: Readonly<
  Record<SupportedVendor, Readonly<Partial<Record<VendorFixtureName, VendorFixture>>>>
> = {
  A: { representative: fixture("A", "R-001", vendorARepresentative) },
  B: { representative: fixture("B", "R-002", vendorBRepresentative) },
  C: { representative: fixture("C", "R-003", vendorCRepresentative) },
};

/**
 * Returns one recorded payload, throwing if the combination does not exist.
 *
 * Throwing is correct here and nowhere else in this package: the adapters
 * themselves never throw (`AdapterResult` is their contract), but a test asking
 * for a fixture that is not there has a broken premise, and a silent `undefined`
 * would surface as an unrelated schema failure three frames away.
 */
export function loadVendorFixture(
  vendor: SupportedVendor,
  name: VendorFixtureName = "representative",
): VendorFixture {
  const forVendor = FIXTURES[vendor];
  const found = forVendor[name];
  if (found === undefined) {
    throw new Error(`No recorded ${name} fixture for vendor ${vendor}.`);
  }
  return found;
}

/** Returns every recorded fixture, in supported-vendor order. */
export function listVendorFixtures(): readonly VendorFixture[] {
  return SUPPORTED_VENDORS.flatMap((vendor) => Object.values(FIXTURES[vendor]));
}
