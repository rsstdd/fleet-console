// utils/__boundary-violation__/adapterTestingImport.fixture.test.ts
//
// The legal half of the pair: the same import adapterTestingImport.ts is
// rejected for, in a file named the way test files are named. The joining test
// ADR 11 exists to enable depends on this exception holding, so it is asserted
// rather than assumed.
//
// A fixture, not a test — vitest skips `*.fixture.test.ts` under
// __boundary-violation__ in vite.config.ts, while ESLint's `**/*.test.*`
// override still classifies it as a test file, which is the whole point.
//
// Do not repair or delete (ADR 11).
import { loadVendorFixture } from "@fleet/adapters/testing";

export const vendorA = loadVendorFixture("A");
