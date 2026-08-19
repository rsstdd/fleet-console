import { ESLint, type Linter } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Every fixture this suite asserts on, linted in one pass before any case runs.
 *
 * The list is here rather than inline in each case because a single `beforeAll`
 * does all the linting: see `lintResults`.
 */
const FIXTURES = [
  "src/__enforcement__/wallClock.ts",
  "src/__enforcement__/unsafeAssertion.ts",
  "src/__enforcement__/workspaceImport.ts",
  "src/__enforcement__/legal.ts",
  "src/vendors/a/__enforcement__/crossVendor.ts",
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
 * Proves the package's lint rules are live.
 *
 * Asserts on rule ids rather than on message counts, because any lint message at
 * all satisfies a bare `length > 0` — including one from an unrelated rule while
 * the rule under test sits inert. That is precisely the failure ADR 7 records for
 * `boundaries/dependencies` in `packages/web`, and Principle 15's requirement that
 * enforcement be tested is what this file discharges.
 *
 * The fixtures are excluded from the normal lint run by the `ignores` entry in
 * `eslint.config.js`, so this instance is built with `ignore: false` to reach them.
 *
 * One instance lints every fixture, in one pass, so all five cases judge the
 * same snapshot and this hook is the suite's only contact with the tree. That is
 * not a speed change — typescript-eslint builds its program once per process
 * either way — it is what keeps `packages/FIXME.md` **F14**'s residual risk to
 * one event per suite instead of one per assertion.
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

describe("lint enforcement", () => {
  it("rejects a wall-clock read, which ADR 3 gives to the server", () => {
    const ruleIds = ruleIdsFor("src/__enforcement__/wallClock.ts");

    expect(ruleIds).toContain("no-restricted-properties");
    expect(ruleIds).toContain("no-restricted-globals");
  });

  it("rejects asserting untrusted input into a narrower type (Principle 2)", () => {
    const ruleIds = ruleIdsFor("src/__enforcement__/unsafeAssertion.ts");

    expect(ruleIds).toContain("@typescript-eslint/no-unsafe-type-assertion");
  });

  it("rejects a workspace import other than @fleet/contracts", () => {
    const ruleIds = ruleIdsFor("src/__enforcement__/workspaceImport.ts");

    expect(ruleIds).toContain("no-restricted-imports");
  });

  it("rejects one vendor adapter importing another (ADR 1)", () => {
    const ruleIds = ruleIdsFor("src/vendors/a/__enforcement__/crossVendor.ts");

    expect(ruleIds).toContain("no-restricted-imports");
  });

  // Without this, an inert rule set passes every assertion above by reporting
  // nothing for any input.
  it("permits a module that imports core, takes time as an argument, and asserts nothing", () => {
    const ruleIds = ruleIdsFor("src/__enforcement__/legal.ts");

    expect(ruleIds).toEqual([]);
  });
});
