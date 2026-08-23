// entities/robot/__boundary-violation__/adapterImport.fixture.test.ts
//
// The legal half of the pair: the same import adapterImport.ts is rejected for,
// in a file named the way test files are named. The end-to-end contract path
// depends on this exception holding, so it is asserted rather than assumed.
//
// A fixture, not a test — vitest is told to skip `*.fixture.test.ts` under
// __boundary-violation__ in vite.config.ts, and ESLint's `**/*.test.*` override
// still classifies it as a test file, which is the whole point.
//
// Do not repair or delete (ADR 12 § Implications: these fixtures are
// load-bearing and look like dead code).
import { SUPPORTED_VENDORS } from "@fleet/adapters";

export const vendors = SUPPORTED_VENDORS;
