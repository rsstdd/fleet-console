/**
 * Public entry point for `@fleet/adapters/testing` — recorded vendor payloads
 * for tests in this package and in others.
 *
 * Separate from `src/index.ts` on purpose (ADR 11). This surface carries no
 * production behaviour, so importing it from production code is a defect that
 * lint reports in every consuming package; the export map entry exists so that
 * a *test* has one public way in, rather than reaching into
 * `src/vendors/<v>/__fixtures__/` and freezing an internal layout.
 *
 * Deep imports are not the contract here any more than they are for `.`.
 */
export {
  FIXTURE_RECORDING,
  listVendorFixtures,
  loadVendorFixture,
  type VendorFixture,
  type VendorFixtureName,
} from "./fixtures.ts";
