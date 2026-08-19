import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";

import {
  INFORMATIVE_DOCS_ALIASES,
  INFORMATIVE_DOCS_USELESS_WORDS,
} from "../config/eslint/informativeDocs.js";

/**
 * Proves the redundant-doc ban actually fires, in every package that claims it.
 *
 * ADR 7 records this repository's own experience of a lint rule sitting inert while
 * reporting nothing, and being indistinguishable from a passing check. This rule is a
 * likelier candidate than most: it currently reports **zero** findings across the whole
 * codebase, so "silent" and "working" look identical from the outside (ADR 28).
 *
 * Deliberately uses `lintText` rather than linting files on disk. Every existing
 * enforcement suite here lints the live tree and they flake under parallel load —
 * `packages/FIXME.md` **F14** — because their input changes while other packages build.
 * A string has no such problem, and nothing about this rule needs a real file.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/**
 * Each package and a file its TypeScript project already covers.
 *
 * `web` has no `src/index.ts`; its entry point is `main.tsx`, which is also the only
 * anchor there that exercises the `.tsx` half of the rule's file glob.
 */
const packages = [
  ["adapters", "src/index.ts"],
  ["contracts", "src/index.ts"],
  ["server", "src/index.ts"],
  ["simulator", "src/index.ts"],
  ["web", "src/main.tsx"],
];

/** The canonical redundant comment: a description that restates its own signature. */
const REDUNDANT = `/** Sets the user name. */
export function setUserName(name: string): void {
  void name;
}
`;

/** The same signature, documented with something the reader could not have inferred. */
const INFORMATIVE = `/**
 * Sets the user name, rejecting one that collides with an existing account.
 */
export function setUserName(name: string): void {
  void name;
}
`;

/**
 * Runs one package's real lint configuration over a source string.
 *
 * The `filePath` names a file that already exists, and deliberately so: these packages
 * lint with type-aware rules, whose project service refuses a path it has never heard of
 * with a fatal parsing error rather than a rule result. Nothing is read from that file —
 * `source` is what gets linted — it only has to be a path the TypeScript project already
 * covers, so the config that applies is the one this package really uses.
 */
async function lintInPackage(pkg, anchor, source) {
  const cwd = path.join(root, "packages", pkg);
  const eslint = new ESLint({ cwd, ignore: false });
  const [result] = await eslint.lintText(source, { filePath: path.join(cwd, anchor) });
  const fatal = (result?.messages ?? []).find((message) => message.fatal);
  assert.equal(fatal, undefined, `${pkg} could not parse the probe: ${fatal?.message ?? ""}`);
  return (result?.messages ?? []).filter((m) => m.ruleId === "jsdoc/informative-docs");
}

for (const [pkg, anchor] of packages) {
  test(`${pkg} rejects a doc comment that restates its signature`, async () => {
    const found = await lintInPackage(pkg, anchor, REDUNDANT);
    assert.equal(
      found.length,
      1,
      `${pkg} did not flag a redundant doc comment; the rule is missing or its options were weakened`,
    );
    assert.equal(found[0].severity, 2, `${pkg} must treat this as an error, not a warning`);
  });

  test(`${pkg} accepts a doc comment that adds information`, async () => {
    // The vacuity half. Without it, a rule that flagged *every* doc comment would
    // satisfy the assertion above while making the codebase unlintable.
    const found = await lintInPackage(pkg, anchor, INFORMATIVE);
    assert.equal(
      found.length,
      0,
      `${pkg} flagged an informative comment: ${JSON.stringify(found)}`,
    );
  });
}

test("the shared word lists stay non-empty and keep the plugin's own defaults", () => {
  // Supplying `aliases` replaces the plugin's default rather than merging with it, so
  // dropping the `a` entry would silently weaken every comparison.
  assert.deepEqual(INFORMATIVE_DOCS_ALIASES.a, ["an", "our"]);
  // The entries that close the measured gap: with the plugin's defaults alone,
  // "Sets the user name." on `setUserName` is not flagged, because "sets" and "set"
  // are different strings to it. Losing these silently narrows the rule to restated
  // nouns, which is the weaker half of what it was adopted for (ADR 28).
  assert.ok(INFORMATIVE_DOCS_ALIASES.set.includes("sets"));
  assert.ok(INFORMATIVE_DOCS_ALIASES.get.includes("gets"));
  assert.ok(INFORMATIVE_DOCS_ALIASES.decode.includes("parses"));
  for (const word of ["a", "an", "i", "in", "of", "s", "the"]) {
    assert.ok(
      INFORMATIVE_DOCS_USELESS_WORDS.includes(word),
      `dropping "${word}" would weaken the rule against the plugin's own baseline`,
    );
  }
});
