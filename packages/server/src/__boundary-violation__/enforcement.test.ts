import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/** Allows type-aware ESLint to build its package program under parallel workspace load. */
const LINT_TIMEOUT_MS = 30_000;

async function messagesFor(file: string, ruleId: string): Promise<string[]> {
  const eslint = new ESLint({ ignore: false });
  const [result] = await eslint.lintFiles([file]);
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === ruleId)
    .map((message) => message.message);
}

describe("server boundary enforcement", () => {
  it(
    "rejects wall-clock reads outside the clock module",
    async () => {
      const messages = await messagesFor(
        "src/__boundary-violation__/wallClock.ts",
        "no-restricted-globals",
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("injected `Clock`");
    },
    LINT_TIMEOUT_MS,
  );

  it(
    "rejects database dependencies forbidden by ADR 6",
    async () => {
      const messages = await messagesFor(
        "src/__boundary-violation__/database.ts",
        "no-restricted-imports",
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain("ADR 6 decides there is no database");
    },
    LINT_TIMEOUT_MS,
  );
});
