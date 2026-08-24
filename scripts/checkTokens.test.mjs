// The gate's own falsifier. A check nobody has watched fail is indistinguishable from a
// check that does nothing (ADR 7), and this one is cheap to fool: a parser that silently
// returns an empty map makes every assertion pass over nothing, which is exactly how an
// earlier draft of it behaved.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  contrastRatio,
  findTokenProblems,
  paletteFromSource,
  tokensForTheme,
} from "./checkTokens.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CSS = `
:root { --unrelated: 1px; }
:root,
[data-theme="dark"] {
  --bg: #141816;
  --surface: #1c211e;
  --ink: #e8e6e1;
  --ink-soft: #c5c2b8;
  --ink-muted: #8e8b82;
  /* a comment before a declaration, which an earlier parser swallowed */
  --accent: #c2a671;
  --accent-hover: #a8905e;
  --on-accent: #141816;
  --line: #2e3430;
  --status-neutral: #767068;
  --status-active: #3d9b6e;
  --status-charging: #3b82a0;
  --status-degraded: #c4a035;
  --status-fault: #c75138;
  --status-unknown: #8e8b82;
}
[data-theme="light"] {
  --bg: #f4f2ec;
  --surface: #ffffff;
  --ink: #1a1d1b;
  --ink-soft: #3d4240;
  --ink-muted: #6b6860;
  --accent: #a67c3a;
  --accent-hover: #8f6a30;
  --on-accent: #ffffff;
  --line: #d9d4c8;
  --status-neutral: #5a554f;
  --status-active: #2f7d56;
  --status-charging: #2e6a86;
  --status-degraded: #a67c1a;
  --status-fault: #b33e2a;
  --status-unknown: #6b6860;
}
`;

const PALETTE = `
export const TENANT_PALETTE = {
  dark: {
    bg: "#141816",
    surface: "#1c211e",
    ink: "#e8e6e1",
    inkSoft: "#c5c2b8",
    inkMuted: "#8e8b82",
    accent: "#c2a671",
    accentHover: "#a8905e",
    onAccent: "#141816",
    line: "#2e3430",
  },
  light: {
    bg: "#f4f2ec",
    surface: "#ffffff",
    ink: "#1a1d1b",
    inkSoft: "#3d4240",
    inkMuted: "#6b6860",
    accent: "#a67c3a",
    accentHover: "#8f6a30",
    onAccent: "#ffffff",
    line: "#d9d4c8",
  },
} as const;
`;

test("parses a declaration that follows a comment", () => {
  const tokens = tokensForTheme(CSS, "dark");
  assert.equal(tokens["--accent"], "#c2a671");
  assert.equal(tokens["--status-neutral"], "#767068");
});

test("reads the dark block from the selector list, not the bare :root above it", () => {
  assert.equal(tokensForTheme(CSS, "dark")["--unrelated"], undefined);
});

test("computes known WCAG ratios", () => {
  assert.equal(contrastRatio("#ffffff", "#000000").toFixed(0), "21");
  assert.equal(contrastRatio("#767068", "#1c211e").toFixed(2), "3.34");
});

test("reports a drifted colour", () => {
  const drifted = PALETTE.replace('bg: "#141816"', 'bg: "#141817"');
  const problems = findTokenProblems(CSS, drifted);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /two spellings/);
});

test("reports a colour that fails contrast", () => {
  // The value this gate actually caught in the tree, restored.
  const failing = CSS.replace("--status-neutral: #767068", "--status-neutral: #6b6560");
  const problems = findTokenProblems(failing, PALETTE);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /below WCAG 1\.4\.11/);
});

test("reports a theme whose block it could not parse", () => {
  // The failure that would otherwise be invisible: empty maps make every other assertion
  // pass, which is how an earlier draft of the parser behaved.
  const problems = findTokenProblems(
    CSS.replace('[data-theme="light"]', '[data-theme="other"]'),
    PALETTE,
  );
  assert.ok(problems.some((line) => line.includes("no custom properties found")));
});

test("reports a palette key nothing maps", () => {
  const extended = PALETTE.replace('line: "#2e3430",', 'line: "#2e3430",\n    extra: "#123456",');
  const problems = findTokenProblems(CSS, extended);
  assert.ok(problems.some((line) => line.includes("stops covering it")));
});

test("the shipped tree passes", async () => {
  const [css, palette] = await Promise.all([
    readFile(path.join(ROOT, "packages/web/src/styles/tokens.css"), "utf8"),
    readFile(path.join(ROOT, "packages/web/src/styles/tokens.ts"), "utf8"),
  ]);
  assert.deepEqual(findTokenProblems(css, palette), []);
});
