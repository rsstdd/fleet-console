// Behaviour of the reviewable-diff budget (ADR 27).
//
// The counting, exclusion and override parsing are pure functions specifically so they
// can be tested here rather than only in CI, where a wrong answer is discovered by a
// confusing red build (Principle 10). What is deliberately not tested is `git` itself.
import assert from "node:assert/strict";
import test from "node:test";

import {
  LINE_BUDGET,
  OVERRIDE_TRAILER,
  countChangedLines,
  findOverride,
  isCounted,
  isGenerated,
} from "./checkDiffSize.mjs";

test("the budget is the number ADR 27 derives", () => {
  assert.equal(LINE_BUDGET, 300);
});

test("code and prose both count, because a human reads both", () => {
  for (const filePath of [
    "packages/web/src/features/fleet/fleetPage.tsx",
    "packages/server/src/ingest/selectVendor.ts",
    "scripts/checkDiffSize.mjs",
    "packages/web/src/styles/global.css",
    "docs/00_adr/27_CAP_THE_REVIEWABLE_DIFF_WITH_A_NAMED_OVERRIDE.md",
    "README.md",
  ]) {
    assert.equal(isCounted(filePath), true, filePath);
  }
});

test("generated output does not count, because nobody wrote or reads it", () => {
  for (const filePath of [
    "pnpm-lock.yaml",
    "packages/adapters/src/vendors/a/__fixtures__/representative.json",
    "packages/adapters/src/vendors/c/__fixtures__/representative.json",
    "packages/web/src/styles/tokens.css",
    "docs/PENDING_ARCHITECTURE_DECISIONS.md",
  ]) {
    assert.equal(isGenerated(filePath), true, filePath);
    assert.equal(isCounted(filePath), false, filePath);
  }
});

test("a hand-written file is not excluded merely for sitting near generated ones", () => {
  // The exclusion is by path and command of origin, never by directory convenience.
  assert.equal(isCounted("packages/adapters/src/vendors/a/adapter.ts"), true);
  assert.equal(isCounted("docs/decisions.json"), false); // .json is not a counted extension
  assert.equal(isGenerated("docs/decisions.json"), false); // but it is authored, not generated
});

test("counts additions and deletions together, since both are read", () => {
  const { total } = countChangedLines(["10\t5\tsrc/a.ts", "0\t20\tsrc/b.ts"].join("\n"));
  assert.equal(total, 35);
});

test("ranks the files a reviewer should look at first", () => {
  const { counted } = countChangedLines(
    ["3\t1\tsrc/small.ts", "200\t40\tsrc/large.ts", "10\t10\tsrc/middle.ts"].join("\n"),
  );
  assert.deepEqual(
    counted.map((entry) => entry.filePath),
    ["src/large.ts", "src/middle.ts", "src/small.ts"],
  );
});

test("binary files contribute nothing rather than NaN", () => {
  const { total } = countChangedLines(["-\t-\tdocs/diagram.png", "5\t5\tsrc/a.ts"].join("\n"));
  assert.equal(total, 10);
});

test("ignores blank lines and an empty diff", () => {
  assert.equal(countChangedLines("").total, 0);
  assert.equal(countChangedLines("\n\n").total, 0);
});

test("handles a path containing a tab without losing the rest of the name", () => {
  const { counted } = countChangedLines("4\t2\tsrc/od\td.ts");
  assert.deepEqual(counted, [{ filePath: "src/od\td.ts", lines: 6 }]);
});

test("finds the override trailer and returns the stated reason", () => {
  const message = [
    "chore: import the implementation tree",
    "",
    `${OVERRIDE_TRAILER} initial import; the tree has no smaller form`,
  ].join("\n");
  assert.equal(findOverride(message), "initial import; the tree has no smaller form");
});

test("accepts the trailer from any commit in the range", () => {
  const messages = [
    "feat: part one",
    "",
    "feat: part two",
    "",
    `${OVERRIDE_TRAILER} tree-wide rename`,
  ].join("\n");
  assert.equal(findOverride(messages), "tree-wide rename");
});

test("a bare trailer does not pass, because it asserts nothing a reader can weigh", () => {
  assert.equal(findOverride(`${OVERRIDE_TRAILER}`), null);
  assert.equal(findOverride(`${OVERRIDE_TRAILER}   `), null);
});

test("no trailer means no override", () => {
  assert.equal(findOverride("feat: add the fleet table\n\nCo-Authored-By: someone"), null);
});

test("the trailer is recognised regardless of case or surrounding whitespace", () => {
  assert.equal(findOverride("  oversized-diff:  a reason  "), "a reason");
});
