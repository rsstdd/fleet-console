// entities/robot/__boundary-violation__/adapterTestingImport.ts
//
// Deliberate violation. `@fleet/adapters/testing` is the recorded-fixture
// surface ADR 11 made public for tests. Production code importing it would put
// test data — and a specifier that resolves into a server-side package — into
// the browser bundle.
//
// This fixture exists because the ban it proves is easy to lose: the exact-name
// entry in `no-restricted-imports` does not match subpaths, so the pattern
// entry beside it is the only thing standing between the new subpath and
// production code.
//
// Exercised by ../../../features/fleet/__boundary-violation__/violation.test.ts.
// Excluded from the normal lint run via the `ignores` entry in eslint.config.js.
// Do not repair or delete (ADR 11).
import { loadVendorFixture } from "@fleet/adapters/testing";

export const vendorA = loadVendorFixture("A");
