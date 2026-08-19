import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

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
 */
async function ruleIdsFor(file: string): Promise<string[]> {
  const eslint = new ESLint({ ignore: false });
  const [result] = await eslint.lintFiles([file]);
  return (result?.messages ?? [])
    .map((message) => message.ruleId)
    .filter((ruleId): ruleId is string => ruleId !== null);
}

describe("lint enforcement", () => {
  it("rejects a wall-clock read, which ADR 3 gives to the server", async () => {
    const ruleIds = await ruleIdsFor("src/__enforcement__/wallClock.ts");

    expect(ruleIds).toContain("no-restricted-properties");
    expect(ruleIds).toContain("no-restricted-globals");
  });

  it("rejects asserting untrusted input into a narrower type (Principle 2)", async () => {
    const ruleIds = await ruleIdsFor("src/__enforcement__/unsafeAssertion.ts");

    expect(ruleIds).toContain("@typescript-eslint/no-unsafe-type-assertion");
  });

  it("rejects a workspace import other than @fleet/contracts", async () => {
    const ruleIds = await ruleIdsFor("src/__enforcement__/workspaceImport.ts");

    expect(ruleIds).toContain("no-restricted-imports");
  });

  it("rejects one vendor adapter importing another (ADR 1)", async () => {
    const ruleIds = await ruleIdsFor("src/vendors/a/__enforcement__/crossVendor.ts");

    expect(ruleIds).toContain("no-restricted-imports");
  });

  // Without this, an inert rule set passes every assertion above by reporting
  // nothing for any input.
  it("permits a module that imports core, takes time as an argument, and asserts nothing", async () => {
    const ruleIds = await ruleIdsFor("src/__enforcement__/legal.ts");

    expect(ruleIds).toEqual([]);
  });
});
