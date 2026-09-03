import { ESLint, type Linter } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Every fixture this suite asserts on, linted in one pass before any case runs.
 *
 * The list is here rather than inline in each case because a single `beforeAll`
 * does all the linting: see `lintResults`.
 */
const FIXTURES = [
  "src/__enforcement__/adaptersInProduction.ts",
  "src/__enforcement__/adaptersInTest.fixture.test.ts",
  "src/__enforcement__/serverImport.ts",
  "src/__enforcement__/legal.ts",
];

/**
 * Budget for the one type-aware ESLint run, which builds a TypeScript program
 * over the whole package.
 *
 * This is a hook budget for a single program build, not a per-assertion
 * allowance. `packages/FIXME.md` **F14** rejects widening a timeout as the fix
 * for a transient failure here: if this suite starts failing again, the cause
 * is a rule, a fixture, or something writing the tree underneath it — raising
 * this number hides whichever it is.
 */
const PROGRAM_BUILD_TIMEOUT_MS = 30_000;

const lintResults = new Map<string, ESLint.LintResult>();

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
 * them. One instance lints every fixture, in one pass, so all four cases
 * judge the same snapshot and this hook is the suite's only contact with the
 * tree. That is not a speed change — typescript-eslint builds its program once
 * per process either way — it is what keeps `packages/FIXME.md` **F14**'s
 * residual risk to one event per suite instead of one per assertion. Structure
 * and style follow `packages/adapters/src/__enforcement__/`.
 */
beforeAll(async () => {
  const eslint = new ESLint({ ignore: false });

  for (const fixture of FIXTURES) {
    const [result] = await eslint.lintFiles([fixture]);

    if (result === undefined) {
      throw new Error(`ESLint returned no result for ${fixture}.`);
    }

    lintResults.set(fixture, result);
  }
}, PROGRAM_BUILD_TIMEOUT_MS);

/**
 * Fails loudly when ESLint could not reach a verdict, rather than reporting the
 * empty message list a parse or configuration failure produces.
 *
 * A fatal message carries no rule id, so filtering rule ids turns "ESLint
 * broke" into "the rule did not fire" — a false enforcement failure pointing at
 * an innocent boundary, which is the shape F14 spent five occurrences being.
 */
function messagesFor(fixture: string): Linter.LintMessage[] {
  const result = lintResults.get(fixture);

  if (result === undefined) {
    throw new Error(`${fixture} is asserted on but missing from FIXTURES.`);
  }

  const fatal = result.messages.filter((message) => message.fatal === true);

  if (fatal.length > 0) {
    throw new Error(
      `ESLint failed on ${fixture} instead of judging it: ` +
        fatal.map((message) => message.message).join("; "),
    );
  }

  return result.messages;
}

function ruleIdsFor(fixture: string): string[] {
  return messagesFor(fixture)
    .map((message) => message.ruleId)
    .filter((ruleId): ruleId is string => ruleId !== null);
}

describe("import boundary enforcement", () => {
  it("rejects @fleet/adapters in production code (ADR 16)", () => {
    const ruleIds = ruleIdsFor("src/__enforcement__/adaptersInProduction.ts");

    expect(ruleIds).toContain("no-restricted-imports");
  });

  it("permits @fleet/adapters in a test file, which is what the dev dependency is for", () => {
    // The half that matters most: a ban applied to test files too would break
    // src/fleet/vendorId.test.ts, the one file D7 exists to make possible.
    const ruleIds = ruleIdsFor("src/__enforcement__/adaptersInTest.fixture.test.ts");

    expect(ruleIds).not.toContain("no-restricted-imports");
  });

  it("still rejects @fleet/server, in test files as much as anywhere", () => {
    // Relaxing the rule for tests must not have relaxed it for the packages this
    // one may never import. The fixture is production-named; the test override
    // re-states FORBIDDEN_PACKAGES so the same holds under a test filename.
    const ruleIds = ruleIdsFor("src/__enforcement__/serverImport.ts");

    expect(ruleIds).toContain("no-restricted-imports");
  });

  it("permits a module that imports within the package and takes time as an argument", () => {
    const ruleIds = ruleIdsFor("src/__enforcement__/legal.ts");

    expect(ruleIds).toEqual([]);
  });
});
