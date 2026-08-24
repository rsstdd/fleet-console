import assert from "node:assert/strict";
import test from "node:test";

import { Linter } from "eslint";

import webTokenLint from "./webTokenLint.mjs";

const RULE = "tokens/no-raw-visual-units";

function messagesFor(source) {
  const linter = new Linter({ configType: "flat" });
  return linter.verify(
    source,
    [
      {
        files: ["**/*.jsx"],
        languageOptions: {
          ecmaVersion: 2022,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { tokens: webTokenLint },
        rules: { [RULE]: "error" },
      },
    ],
    { filename: "sample.jsx" },
  );
}

test("rejects raw units embedded in a CSS shorthand string", () => {
  const messages = messagesFor(`const sx = { border: "1px solid var(--line)" };`);

  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.ruleId, RULE);
});

test("rejects raw colours embedded in a CSS function string", () => {
  const messages = messagesFor(`const sx = { background: "linear-gradient(#fff, #000)" };`);

  assert.equal(messages.length, 1);
});

test("rejects non-zero numeric dimensions in style objects", () => {
  const messages = messagesFor(
    `const sx = { minWidth: 140, height: 48 }; const view = <div style={sx} />;`,
  );

  assert.equal(messages.length, 2);
});

test("rejects non-zero numeric dimensions passed as JSX props", () => {
  const messages = messagesFor(`const view = <div><Skeleton height={48} /></div>;`);

  assert.equal(messages.length, 1);
});

test("allows theme spacing multipliers, zero dimensions, and token references", () => {
  const messages = messagesFor(
    `const sx = { p: 2, minWidth: 0, border: "var(--border-width) solid var(--line)" };`,
  );

  assert.deepEqual(messages, []);
});
