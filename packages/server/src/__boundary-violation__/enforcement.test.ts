import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Every fixture this suite asserts on, linted in one pass before any case runs.
 *
 * The list is here rather than inline in each case because a single `beforeAll`
 * does all the linting: see `lintResults`.
 */
const FIXTURES = [
  "src/__boundary-violation__/wallClock.ts",
  "src/__boundary-violation__/database.ts",
  "src/__boundary-violation__/adapterVendorImport.ts",
  "src/__boundary-violation__/adapterTestingSubpath.ts",
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
 * Lints every fixture with one instance, in one pass.
 *
 * Both cases judge the same snapshot, and this hook is the suite's only contact
 * with the tree. `packages/FIXME.md` **F14** caught this suite failing once and
 * `packages/simulator`'s twice on 19 August 2026, each passing on re-run and in
 * isolation; the serial workspace run described in `vitest.config.ts` is what
 * removed the cause, and this shape is what keeps the residual risk to one
 * event per suite instead of one per assertion.
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
 * A fatal message carries no rule id, so filtering by rule id turns "ESLint
 * broke" into "the rule did not fire" — a false enforcement failure pointing at
 * an innocent boundary, which is the shape F14 spent five occurrences being.
 */
function messagesFor(fixture: string, ruleId: string): string[] {
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

  return result.messages
    .filter((message) => message.ruleId === ruleId)
    .map((message) => message.message);
}

describe("server boundary enforcement", () => {
  it("rejects wall-clock reads outside the clock module", () => {
    const messages = messagesFor(
      "src/__boundary-violation__/wallClock.ts",
      "no-restricted-globals",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("injected `Clock`");
  });

  it("rejects database dependencies forbidden by ADR 6", () => {
    const messages = messagesFor("src/__boundary-violation__/database.ts", "no-restricted-imports");

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("ADR 6 decides there is no database");
  });

  it("rejects the fixture subpath in production code, where the ADR 11 exception does not reach", () => {
    // The exception admitting @fleet/adapters/testing is scoped to `**/*.test.ts`. A
    // production file is the case that has to keep failing, because recorded fixtures
    // reaching runtime behaviour is what made that subpath nearly not worth having.
    const messages = messagesFor(
      "src/__boundary-violation__/adapterTestingSubpath.ts",
      "no-restricted-imports",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("In production code the ban is total");
  });

  it("rejects direct imports of an adapter vendor module", () => {
    const messages = messagesFor(
      "src/__boundary-violation__/adapterVendorImport.ts",
      "no-restricted-imports",
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Dispatch through the adapters package's public entry point");
  });
});
