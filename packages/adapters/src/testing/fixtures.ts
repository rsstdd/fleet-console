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
import vendorABoundaryEmpty from "../vendors/a/__fixtures__/boundary-empty.json" with { type: "json" };
import vendorABoundaryFull from "../vendors/a/__fixtures__/boundary-full.json" with { type: "json" };
import vendorBRepresentative from "../vendors/b/__fixtures__/representative.json" with { type: "json" };
import vendorBBoundaryEmpty from "../vendors/b/__fixtures__/boundary-empty.json" with { type: "json" };
import vendorBBoundaryFull from "../vendors/b/__fixtures__/boundary-full.json" with { type: "json" };
import vendorCRepresentative from "../vendors/c/__fixtures__/representative.json" with { type: "json" };
import vendorCBoundaryEmpty from "../vendors/c/__fixtures__/boundary-empty.json" with { type: "json" };
import vendorCBoundaryFull from "../vendors/c/__fixtures__/boundary-full.json" with { type: "json" };
import vendorAWrongType from "../vendors/a/__malformed__/wrong-type.json" with { type: "json" };
import vendorBMultipleDefects from "../vendors/b/__malformed__/multiple-defects.json" with { type: "json" };
import vendorCUnparsableTimestamp from "../vendors/c/__malformed__/unparsable-timestamp.json" with { type: "json" };

/**
 * The kinds of recorded payload a vendor can have.
 *
 * Every member is produced by the simulator and written by `pnpm record:fixtures`.
 * Malformed payloads are deliberately absent from this union — they cannot be
 * recorded, and `MalformedPayloadName` is their separate home.
 *
 * Coupling: `RECORDED_CASE_NAMES` in
 * `packages/simulator/src/recording/fixtureSet.ts` is the producing half; a name
 * added there needs an import and a registry entry here.
 */
export type VendorFixtureName = "representative" | "boundary-empty" | "boundary-full";

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

function fixture(
  vendor: SupportedVendor,
  name: VendorFixtureName,
  robotId: string,
  payload: unknown,
): VendorFixture {
  return {
    vendor,
    name,
    robotId,
    recordedAt: FIXTURE_RECORDING.instantMs,
    payload,
  };
}

/**
 * Every recorded payload, keyed by vendor and then by name.
 *
 * Both records are total so C1's minimum is enforced by TypeScript: adding a
 * vendor or recorded case cannot compile until every vendor has that case.
 */
const FIXTURES: Readonly<
  Record<SupportedVendor, Readonly<Record<VendorFixtureName, VendorFixture>>>
> = {
  A: {
    representative: fixture("A", "representative", "R-001", vendorARepresentative),
    "boundary-empty": fixture("A", "boundary-empty", "R-001", vendorABoundaryEmpty),
    "boundary-full": fixture("A", "boundary-full", "R-001", vendorABoundaryFull),
  },
  B: {
    representative: fixture("B", "representative", "R-002", vendorBRepresentative),
    "boundary-empty": fixture("B", "boundary-empty", "R-002", vendorBBoundaryEmpty),
    "boundary-full": fixture("B", "boundary-full", "R-002", vendorBBoundaryFull),
  },
  C: {
    representative: fixture("C", "representative", "R-003", vendorCRepresentative),
    "boundary-empty": fixture("C", "boundary-empty", "R-003", vendorCBoundaryEmpty),
    "boundary-full": fixture("C", "boundary-full", "R-003", vendorCBoundaryFull),
  },
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
  if (!Object.hasOwn(forVendor, name)) {
    throw new Error(`No recorded ${name} fixture for vendor ${vendor}.`);
  }
  return forVendor[name];
}

/** Returns every recorded fixture, in supported-vendor order. */
export function listVendorFixtures(): readonly VendorFixture[] {
  return SUPPORTED_VENDORS.flatMap((vendor) => Object.values(FIXTURES[vendor]));
}

/**
 * The hand-authored malformed payloads, named for the defect each carries.
 *
 * A separate union from `VendorFixtureName` because these have a different
 * provenance, and one union would hide that. The simulator only emits well-formed
 * output, so a malformed payload cannot be recorded from it (ADR 13
 * § Implications); these are written by hand and live under
 * `src/vendors/<v>/__malformed__/` rather than `__fixtures__/`, which keeps the
 * recorder's "generated, never edited" rule true of everything in that directory
 * and keeps these files inside ADR 27's reviewable-diff budget where they belong.
 *
 * One per vendor today, each breaking something different, so the rejection tests
 * planned as **D4** are not three assertions about the same defect.
 */
export type MalformedPayloadName = "wrong-type" | "multiple-defects" | "unparsable-timestamp";

/** One payload a vendor schema must reject, with the reason it must. */
export interface MalformedPayload {
  readonly vendor: SupportedVendor;
  readonly name: MalformedPayloadName;
  /**
   * What is wrong with it, in the terms a rejection test asserts on.
   *
   * Prose rather than a machine-readable expectation on purpose: the issue
   * `code` and `path` a schema produces are what the test pins, and duplicating
   * them here would be a second expectation to keep in step with the first.
   */
  readonly reason: string;
  /** The payload exactly as an adapter would receive it, still untrusted. */
  readonly payload: unknown;
}

/**
 * Every malformed payload, keyed by vendor and then by defect.
 *
 * `Partial` for the same reason the recorded registry is: a defect is not
 * meaningful for every dialect. Vendor B is the only one that can be missing
 * `ts`, because A and C carry an ISO `timestamp` instead.
 */
const MALFORMED: Readonly<
  Record<SupportedVendor, Readonly<Partial<Record<MalformedPayloadName, MalformedPayload>>>>
> = {
  A: {
    "wrong-type": {
      vendor: "A",
      name: "wrong-type",
      reason:
        'telemetry.battery.level is the string "0.9661" rather than a number, so the issue ' +
        "path must be the nested dotted path and not the top-level key.",
      payload: vendorAWrongType,
    },
  },
  B: {
    "multiple-defects": {
      vendor: "B",
      name: "multiple-defects",
      reason:
        "ts is absent and batt_pct is 150. Two independent defects in one payload, so a " +
        "rejection that reports one issue has flattened the other away (ADR 20).",
      payload: vendorBMultipleDefects,
    },
  },
  C: {
    "unparsable-timestamp": {
      vendor: "C",
      name: "unparsable-timestamp",
      reason:
        'timestamp is "yesterday": the right type and an impossible value, so a schema that ' +
        "checks only `string` accepts it and the adapter maps an invalid instant.",
      payload: vendorCUnparsableTimestamp,
    },
  },
};

/**
 * Returns one malformed payload, throwing if the combination does not exist.
 *
 * Throws for the same reason `loadVendorFixture` does: a test asking for a
 * payload that is not there has a broken premise, and `undefined` would surface
 * as a schema accepting `undefined` three frames away — which is the exact
 * failure a rejection test exists to catch.
 */
export function loadMalformedPayload(
  vendor: SupportedVendor,
  name: MalformedPayloadName,
): MalformedPayload {
  const found = MALFORMED[vendor][name];
  if (found === undefined) {
    throw new Error(`No malformed ${name} payload for vendor ${vendor}.`);
  }
  return found;
}

/** Returns every malformed payload, in supported-vendor order. */
export function listMalformedPayloads(): readonly MalformedPayload[] {
  return SUPPORTED_VENDORS.flatMap((vendor) => Object.values(MALFORMED[vendor]));
}
