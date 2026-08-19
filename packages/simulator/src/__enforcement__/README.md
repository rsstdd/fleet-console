# `__enforcement__` — fixtures that prove the import boundary still fires

Principle 15 requires enforcement to be _tested_, and ADR 7 records what happens when it
is not: `boundaries/dependencies` sat inert for most of this repository's life, reporting
nothing for the deliberate fixture and nothing for any probe, and silence was
indistinguishable from a passing check.

These files exist because [ADR 16](../../../../docs/00_adr/16_TEST_ONLY_ADAPTERS_DEPENDENCY_FOR_VENDOR_PARITY.md)
made `@fleet/adapters` a dev dependency of this package — permitted in tests, banned in
production code. That rule has two directions and both have to hold:

| Fixture                          | Must                                  | Because                                                                        |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| `adaptersInProduction.ts`        | report `no-restricted-imports`        | a production import inverts the dependency this package exists to exercise     |
| `adaptersInTest.fixture.test.ts` | report **no** `no-restricted-imports` | a ban covering tests would break `src/fleet/vendorId.test.ts`, the whole point |
| `serverImport.ts`                | report `no-restricted-imports`        | relaxing the rule for adapters must not relax it for the server                |
| `legal.ts`                       | report nothing                        | without a control, an inert rule set passes every assertion above              |

The `.fixture.test.ts` suffix keeps vitest from collecting that file: it is an input to a
test, not a test. The convention matches `packages/web`, where ADR 12 established it.

These files are excluded from the normal lint run by the `ignores` entry in
`eslint.config.js`. `enforcement.test.ts` reaches them by constructing `ESLint` with
`ignore: false`.

Do not repair or delete them. A failure here means a rule stopped working, not that the
fixture is wrong.

`@ts-nocheck` appears where a fixture imports a module that deliberately does not
resolve. The import bans are syntactic, so the rule still fires; `tsc` would otherwise
fail the package build on a fixture that is doing its job.
