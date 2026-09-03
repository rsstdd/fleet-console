import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["adapters", "contracts", "server", "simulator", "web"];
const requiredCompilerOptions = {
  strict: true,
  noUncheckedIndexedAccess: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noFallthroughCasesInSwitch: true,
};

/** Reads and parses a JSON configuration file relative to the repository root. */
async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

test("the shared TypeScript baseline keeps every strictness option enabled", async () => {
  const base = await readJson("tsconfig.base.json");
  for (const [option, expected] of Object.entries(requiredCompilerOptions)) {
    assert.equal(base.compilerOptions[option], expected, `${option} must remain enabled`);
  }
});

test("every package inherits strict typing without weakening it", async () => {
  const configs = [
    "packages/adapters/tsconfig.json",
    "packages/contracts/tsconfig.json",
    "packages/server/tsconfig.json",
    "packages/simulator/tsconfig.json",
    "packages/web/tsconfig.app.json",
    "packages/web/tsconfig.node.json",
  ];
  for (const configPath of configs) {
    const source = await readFile(path.join(root, configPath), "utf8");
    assert.match(
      source,
      /"extends":\s*"\.\.\/\.\.\/tsconfig\.base\.json"/,
      `${configPath} must extend the baseline`,
    );
    for (const option of Object.keys(requiredCompilerOptions)) {
      assert.doesNotMatch(
        source,
        new RegExp(`"${option}"\\s*:\\s*false`),
        `${configPath} must not disable ${option}`,
      );
    }
  }
});

test("typed ESLint rejects explicit any in every package", async () => {
  for (const packageName of packages) {
    const configPath = `packages/${packageName}/eslint.config.js`;
    const source = await readFile(path.join(root, configPath), "utf8");
    assert.match(source, /"@typescript-eslint\/no-explicit-any":\s*"error"/, configPath);
    assert.match(source, /strictTypeChecked/, `${configPath} must use typed static analysis`);
  }
});
