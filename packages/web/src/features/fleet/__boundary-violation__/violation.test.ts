import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

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
 * Each case starts a type-aware ESLint run, which builds a TypeScript program
 * over the whole package — since 19 August 2026 that includes `@fleet/contracts`
 * sources, because `entities/robot` imports the canonical types from it. Under
 * the default 5s timeout these cases failed intermittently when the suite ran in
 * parallel, which reads as "the dependency rule is broken" when the rule is
 * fine. The budget is deliberately generous: a slow machine must not be able to
 * report a false enforcement failure.
 */
const LINT_TIMEOUT_MS = 30_000;

async function messagesForRule(file: string, ruleId: string): Promise<string[]> {
  const eslint = new ESLint({ ignore: false });
  const [result] = await eslint.lintFiles([file]);
  return (result?.messages ?? []).filter((m) => m.ruleId === ruleId).map((m) => m.message);
}

async function boundaryMessagesFor(file: string): Promise<string[]> {
  return messagesForRule(file, RULE);
}

describe("dependency rule enforcement", () => {
  it(
    "rejects a feature importing another feature",
    async () => {
      const messages = await boundaryMessagesFor(
        "src/features/fleet/__boundary-violation__/violation.ts",
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toBe("feature may not import feature (PRINCIPLES.md 9).");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "rejects an entity importing react-dom",
    async () => {
      const messages = await boundaryMessagesFor(
        "src/entities/robot/__boundary-violation__/violation.ts",
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("renders nothing and routes nothing");
    },
    LINT_TIMEOUT_MS,
  );

  // Without this, an inert rule passes both assertions above by reporting
  // nothing for any input.
  it(
    "permits a feature importing an entity",
    async () => {
      const messages = await boundaryMessagesFor(
        "src/features/fleet/__boundary-violation__/legal.ts",
      );

      expect(messages).toEqual([]);
    },
    LINT_TIMEOUT_MS,
  );
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

  it(
    "rejects an entity importing @fleet/adapters",
    async () => {
      const messages = await messagesForRule(
        "src/entities/robot/__boundary-violation__/adapterImport.ts",
        IMPORT_RULE,
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("Vendor decoding is server-side");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "permits a test file importing @fleet/adapters",
    async () => {
      const messages = await messagesForRule(
        "src/entities/robot/__boundary-violation__/adapterImport.fixture.test.ts",
        IMPORT_RULE,
      );

      expect(messages).toEqual([]);
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "rejects an entity importing the @fleet/adapters/testing subpath",
    async () => {
      // The exact-name ban does not match subpaths, so this asserts the pattern
      // entry beside it. Without that entry the test-only surface ADR 11 added
      // would be importable from production code, which is the one thing a
      // test-only surface must not be.
      const messages = await messagesForRule(
        "src/entities/robot/__boundary-violation__/adapterTestingImport.ts",
        IMPORT_RULE,
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("recorded fixtures for tests");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "permits a test file importing the @fleet/adapters/testing subpath",
    async () => {
      const messages = await messagesForRule(
        "src/entities/robot/__boundary-violation__/adapterTestingImport.fixture.test.ts",
        IMPORT_RULE,
      );

      expect(messages).toEqual([]);
    },
    LINT_TIMEOUT_MS,
  );
});
