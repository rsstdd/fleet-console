import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/** Allows type-aware ESLint to build its package program under parallel workspace load. */
const LINT_TIMEOUT_MS = 30_000;

/**
 * Proves this package's import boundary is live (Principle 15, ADR 16).
 *
 * ADR 16 made `@fleet/adapters` a dev dependency permitted in tests and banned
 * in production code. A ban nobody probes is indistinguishable from no ban:
 * ADR 7 records exactly that outcome for `boundaries/dependencies` in
 * `packages/web`, which sat inert for most of this repository's life while
 * reporting nothing for any input.
 *
 * Assertions are on rule ids rather than message counts, because a bare
 * `length > 0` is satisfied by any unrelated rule firing while the rule under
 * test does nothing.
 *
 * The fixtures are excluded from the normal lint run by the `ignores` entry in
 * `eslint.config.js`, so this instance is built with `ignore: false` to reach
 * them. Structure and style follow `packages/adapters/src/__enforcement__/`.
 */
async function ruleIdsFor(file: string): Promise<string[]> {
  const eslint = new ESLint({ ignore: false });
  const [result] = await eslint.lintFiles([file]);
  return (result?.messages ?? [])
    .map((message) => message.ruleId)
    .filter((ruleId): ruleId is string => ruleId !== null);
}

describe("import boundary enforcement", () => {
  it(
    "rejects @fleet/adapters in production code (ADR 16)",
    async () => {
      const ruleIds = await ruleIdsFor("src/__enforcement__/adaptersInProduction.ts");

      expect(ruleIds).toContain("no-restricted-imports");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "permits @fleet/adapters in a test file, which is what the dev dependency is for",
    async () => {
      // The half that matters most: a ban applied to test files too would break
      // src/fleet/vendorId.test.ts, the one file D7 exists to make possible.
      const ruleIds = await ruleIdsFor("src/__enforcement__/adaptersInTest.fixture.test.ts");

      expect(ruleIds).not.toContain("no-restricted-imports");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "still rejects @fleet/server, in test files as much as anywhere",
    async () => {
      // Relaxing the rule for tests must not have relaxed it for the packages this
      // one may never import. The fixture is production-named; the test override
      // re-states FORBIDDEN_PACKAGES so the same holds under a test filename.
      const ruleIds = await ruleIdsFor("src/__enforcement__/serverImport.ts");

      expect(ruleIds).toContain("no-restricted-imports");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "permits a module that imports within the package and takes time as an argument",
    async () => {
      const ruleIds = await ruleIdsFor("src/__enforcement__/legal.ts");

      expect(ruleIds).toEqual([]);
    },
    LINT_TIMEOUT_MS,
  );
});
