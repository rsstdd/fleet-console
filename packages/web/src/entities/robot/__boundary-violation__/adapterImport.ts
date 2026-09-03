// entities/robot/__boundary-violation__/adapterImport.ts
//
// Deliberate violation. `@fleet/adapters` decodes untrusted vendor dialects and
// is server-side; production code in this package consumes canonical envelopes
// from `@fleet/contracts` instead (ADR 1, Principle 3).
//
// Exercised by ../../../features/fleet/__boundary-violation__/violation.test.ts,
// which asserts this file produces a no-restricted-imports error. Its pair,
// adapterImport.fixture.test.ts, asserts the test-file exception still holds —
// without that half, deleting the override would silently break the end-to-end
// contract path instead of failing here.
//
// Excluded from the normal lint run via the `ignores` entry in eslint.config.js.
// Do not repair or delete (ADR 12 § Implications: these fixtures are
// load-bearing and look like dead code).
import { SUPPORTED_VENDORS } from "@fleet/adapters";

export const vendors = SUPPORTED_VENDORS;
