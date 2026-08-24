import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import stylelint from "stylelint";

const ROOT = import.meta.dirname;
const config = JSON.parse(await readFile(path.join(ROOT, ".stylelintrc.json"), "utf8"));

async function warningsFor(code, filename = "sample.css") {
  const report = await stylelint.lint({
    code,
    codeFilename: path.join(ROOT, "src/styles", filename),
    config,
  });
  return report.results[0]?.warnings ?? [];
}

test("rejects raw CSS dimensions outside the generated token artifact", async () => {
  const warnings = await warningsFor(".sample { border: 1px solid currentColor; }");

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.rule, "declaration-property-value-disallowed-list");
});

test("rejects comma-adjacent and uppercase raw CSS dimensions", async () => {
  const warnings = await warningsFor(
    ".sample { transform: translate(1px,2px); padding-block: 1REM; }",
  );

  assert.equal(warnings.length, 2);
  assert.ok(
    warnings.every((warning) => warning.rule === "declaration-property-value-disallowed-list"),
  );
});

test("accepts token-backed CSS dimensions", async () => {
  const warnings = await warningsFor(".sample { border: var(--border-width) solid currentColor; }");

  assert.deepEqual(warnings, []);
});

test("allows literal values in generated tokens.css", async () => {
  const warnings = await warningsFor(":root { --border-width: 1px; }", "tokens.css");

  assert.deepEqual(warnings, []);
});
