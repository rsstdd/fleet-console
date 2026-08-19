import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Proves the dependency rule is live. Asserts on the rule id rather than on
 * message count, because any lint message at all would satisfy a bare
 * `length > 0` — including one from an unrelated rule while
 * `boundaries/dependencies` sat inert, which is exactly what happened before
 * 19 August 2026 (TODO B10, B11).
 *
 * The fixtures are excluded from the normal lint run by the `ignores` entry in
 * eslint.config.js, so this instance is constructed with `ignore: false` to
 * reach them.
 */
const RULE = "boundaries/dependencies";

/**
 * Every fixture this file asserts on, across both suites below, linted in one
 * pass before any case runs.
 *
 * The list is here rather than inline in each case because a single `beforeAll`
 * does all the linting: see `lintResults`.
 */
const FIXTURES = [
  "src/features/fleet/__boundary-violation__/violation.ts",
  "src/features/fleet/__boundary-violation__/legal.ts",
  "src/entities/robot/__boundary-violation__/violation.ts",
  "src/entities/robot/__boundary-violation__/adapterImport.ts",
  "src/entities/robot/__boundary-violation__/adapterImport.fixture.test.ts",
  "src/entities/robot/__boundary-violation__/adapterTestingImport.ts",
  "src/entities/robot/__boundary-violation__/adapterTestingImport.fixture.test.ts",
];

/**
 * Budget for the one type-aware ESLint run, which builds a TypeScript program
 * over the whole package — since 19 August 2026 that includes
 * `@fleet/contracts` sources, because `entities/robot` imports the canonical
 * types from it.
 *
 * This is a hook budget for a single program build, not a per-assertion
 * allowance. Each case used to start its own run under a timeout this size, and
 * `packages/FIXME.md` **F14** rejects widening a timeout as the fix for a
 * transient failure here: if this suite starts failing again, the cause is a
 * rule, a fixture, or something writing the tree underneath it — raising this
 * number hides whichever it is.
 */
const PROGRAM_BUILD_TIMEOUT_MS = 30_000;

const lintResults = new Map<string, ESLint.LintResult>();

/**
 * Lints every fixture with one instance, in one pass.
 *
 * All seven cases below judge the same snapshot, and this hook is the file's
 * only contact with the tree — which keeps `packages/FIXME.md` **F14**'s
 * residual risk to one event per file instead of one per assertion. The cause
 * itself is gone: see the serial workspace run described in `vite.config.ts`.
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
function messagesForRule(file: string, ruleId: string): string[] {
  const result = lintResults.get(file);

  if (result === undefined) {
    throw new Error(`${file} is asserted on but missing from FIXTURES.`);
  }

  const fatal = result.messages.filter((m) => m.fatal === true);

  if (fatal.length > 0) {
    throw new Error(
      `ESLint failed on ${file} instead of judging it: ` + fatal.map((m) => m.message).join("; "),
    );
  }

  return result.messages.filter((m) => m.ruleId === ruleId).map((m) => m.message);
}

function boundaryMessagesFor(file: string): string[] {
  return messagesForRule(file, RULE);
}

describe("dependency rule enforcement", () => {
  it("rejects a feature importing another feature", () => {
    const messages = boundaryMessagesFor("src/features/fleet/__boundary-violation__/violation.ts");

    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe("feature may not import feature (PRINCIPLES.md 9).");
  });

  it("rejects an entity importing react-dom", () => {
    const messages = boundaryMessagesFor("src/entities/robot/__boundary-violation__/violation.ts");

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("renders nothing and routes nothing");
  });

  // Without this, an inert rule passes both assertions above by reporting
  // nothing for any input.
  it("permits a feature importing an entity", () => {
    const messages = boundaryMessagesFor("src/features/fleet/__boundary-violation__/legal.ts");

    expect(messages).toEqual([]);
  });
});

/**
 * `@fleet/adapters` is server-side vendor decoding. Production code here must
 * not import it; the end-to-end contract path in
 * `entities/robot/fromEnvelope.test.ts` must be able to. Both halves are
 * asserted, because the exception is the half most likely to be removed by
 * someone tidying the config (ADR 12, ratifying register stub D3).
 */
describe("server-only package imports", () => {
  const IMPORT_RULE = "no-restricted-imports";

  it("rejects an entity importing @fleet/adapters", () => {
    const messages = messagesForRule(
      "src/entities/robot/__boundary-violation__/adapterImport.ts",
      IMPORT_RULE,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Vendor decoding is server-side");
  });

  it("permits a test file importing @fleet/adapters", () => {
    const messages = messagesForRule(
      "src/entities/robot/__boundary-violation__/adapterImport.fixture.test.ts",
      IMPORT_RULE,
    );

    expect(messages).toEqual([]);
  });

  it("rejects an entity importing the @fleet/adapters/testing subpath", () => {
    // The exact-name ban does not match subpaths, so this asserts the pattern
    // entry beside it. Without that entry the test-only surface ADR 11 added
    // would be importable from production code, which is the one thing a
    // test-only surface must not be.
    const messages = messagesForRule(
      "src/entities/robot/__boundary-violation__/adapterTestingImport.ts",
      IMPORT_RULE,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("recorded fixtures for tests");
  });

  it("permits a test file importing the @fleet/adapters/testing subpath", () => {
    const messages = messagesForRule(
      "src/entities/robot/__boundary-violation__/adapterTestingImport.fixture.test.ts",
      IMPORT_RULE,
    );

    expect(messages).toEqual([]);
  });
});
