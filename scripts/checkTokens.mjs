// The design system's two colour sources, held to agreeing, and its contrast measured.
//
// WHY THIS IS A SCRIPT AND NOT A TEST IN `packages/web`. Both checks need to read
// `tokens.css` as text. `packages/web` is a browser package whose `tsconfig.app.json`
// carries `types: ["vite/client"]` and no Node types, so a `node:fs` read inside `src/**`
// is untyped and its lint says so — correctly. Vite's `?raw` import is the browser-native
// alternative and returns an empty string for CSS under the test runner's configuration,
// so it cannot do the job either. This repository already keeps cross-file consistency
// checks in `scripts/*.mjs` (`checkDependencies`, `checkBundleBudget`, `checkDiffSize`);
// this is one more of those rather than a hole punched in a package's type boundary.
//
// WHAT IT PREVENTS.
//
// 1. **Two spellings of one colour.** `tokens.css` is the design system's source and
//    `TENANT_PALETTE` in `src/config/tenantTheme.ts` is what MUI's theme needs as
//    JavaScript; neither can read the other at runtime without a build step this
//    repository does not have. ADR 21 met the same shape and chose a test over a
//    mechanical join because the failure was loud. Here it is **silent** — a drifted hex
//    just looks slightly wrong, on one theme — so pinning it matters more, not less
//    (`packages/FIXME.md` F8, Principle 8).
//
// 2. **Contrast regressions.** Principle 6 makes WCAG 2.2 AA a release requirement.
//    Computing the ratios is cheap and exact; recording them once in a document is how
//    they rot. This found `--status-neutral` at 2.84:1 in dark on the first run.
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = path.join(ROOT, "packages/web/src/styles/tokens.css");
const PALETTE = path.join(ROOT, "packages/web/src/config/tenantTheme.ts");

/** WCAG 2.2 AA: body text. */
export const AA_TEXT = 4.5;
/** WCAG 2.2 AA: large text, and non-text contrast of UI components (1.4.11). */
export const AA_NON_TEXT = 3;

/** The custom property each `TENANT_PALETTE` key restates. */
const TOKEN_FOR_PALETTE_KEY = {
  bg: "--bg",
  surface: "--surface",
  ink: "--ink",
  inkSoft: "--ink-soft",
  inkMuted: "--ink-muted",
  accent: "--accent",
  accentHover: "--accent-hover",
  onAccent: "--on-accent",
  line: "--line",
};

/** Text tokens that must clear the body-text ratio on both backgrounds. */
const TEXT_TOKENS = ["--ink", "--ink-soft", "--ink-muted"];

/** Status tokens: chips, dots and borders, judged as non-text UI. */
const STATUS_TOKENS = [
  "--status-neutral",
  "--status-active",
  "--status-charging",
  "--status-degraded",
  "--status-fault",
  "--status-unknown",
];

/**
 * Custom properties declared for one theme.
 *
 * Comments are stripped first: splitting on `;` otherwise glues a preceding comment to the
 * declaration after it, and the two tokens this file introduces with a comment silently
 * vanished from an earlier draft — which would have made the whole check pass over a
 * shrinking subset (ADR 7).
 *
 * Both themes are located by `[data-theme="…"]`, including dark, whose block is the
 * selector list `:root, [data-theme="dark"]`; keying on `:root` alone matches the
 * colourless base block above it.
 */
export function tokensForTheme(css, theme) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selector = `[data-theme="${theme}"]`;
  const declarations = {};
  let cursor = source.indexOf(selector);
  while (cursor !== -1) {
    const open = source.indexOf("{", cursor);
    const close = source.indexOf("}", open);
    if (open === -1 || close === -1) break;
    for (const line of source.slice(open + 1, close).split(";")) {
      const separator = line.indexOf(":");
      const name = line.slice(0, separator).trim();
      if (separator !== -1 && name.startsWith("--")) {
        declarations[name] = line.slice(separator + 1).trim();
      }
    }
    cursor = source.indexOf(selector, close);
  }
  return declarations;
}

/** Relative luminance of a `#rrggbb` colour, per WCAG 2.x. */
function luminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Contrast ratio between two `#rrggbb` colours, 1 to 21. */
export function contrastRatio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** Palette values per theme, read out of the TypeScript module as text. */
export function paletteFromSource(source) {
  const palettes = {};
  for (const theme of ["dark", "light"]) {
    const start = source.indexOf(`${theme}: {`);
    if (start === -1) continue;
    const end = source.indexOf("}", start);
    const values = {};
    for (const line of source.slice(start, end).split("\n")) {
      const match = /^\s*(\w+):\s*"(#[0-9a-fA-F]{6})"/.exec(line);
      if (match) values[match[1]] = match[2];
    }
    palettes[theme] = values;
  }
  return palettes;
}

/** Every disagreement and every contrast failure, as reviewer-facing sentences. */
export function findTokenProblems(css, paletteSource) {
  const problems = [];
  const palettes = paletteFromSource(paletteSource);

  for (const theme of ["dark", "light"]) {
    const tokens = tokensForTheme(css, theme);
    const palette = palettes[theme] ?? {};

    // A theme whose block is absent or unparsed would otherwise sail through every check
    // below on empty maps — the "passes over nothing" failure this gate exists to avoid.
    if (Object.keys(tokens).length === 0) {
      problems.push(
        `${theme}: no custom properties found for [data-theme="${theme}"]. Either the block is missing or the parser stopped matching it.`,
      );
      continue;
    }

    const paletteKeys = Object.keys(palette).sort();
    const mappedKeys = Object.keys(TOKEN_FOR_PALETTE_KEY).sort();
    if (paletteKeys.join(",") !== mappedKeys.join(",")) {
      // Without this the map could fall behind the palette and every remaining assertion
      // would keep passing over a shrinking subset.
      problems.push(
        `TENANT_PALETTE.${theme} has keys [${paletteKeys.join(", ")}] but scripts/checkTokens.mjs maps [${mappedKeys.join(", ")}]. Add the new colour to the map, or this check stops covering it.`,
      );
    }

    for (const [key, token] of Object.entries(TOKEN_FOR_PALETTE_KEY)) {
      if (palette[key] !== undefined && tokens[token] !== palette[key]) {
        problems.push(
          `${theme}: TENANT_PALETTE.${key} is ${palette[key]} but ${token} is ${tokens[token] ?? "(absent)"}. One colour, two spellings (Principle 8).`,
        );
      }
    }

    for (const background of ["--bg", "--surface"]) {
      for (const token of TEXT_TOKENS) {
        const ratio = contrastRatio(tokens[token], tokens[background]);
        if (ratio < AA_TEXT) {
          problems.push(
            `${theme}: ${token} on ${background} is ${ratio.toFixed(2)}:1, below WCAG 2.2 AA's ${AA_TEXT}:1 for text.`,
          );
        }
      }
    }

    for (const token of STATUS_TOKENS) {
      const ratio = contrastRatio(tokens[token], tokens["--surface"]);
      if (ratio < AA_NON_TEXT) {
        problems.push(
          `${theme}: ${token} on --surface is ${ratio.toFixed(2)}:1, below WCAG 1.4.11's ${AA_NON_TEXT}:1 for non-text UI.`,
        );
      }
    }
  }
  return problems;
}

/** Every measured ratio, printed whether or not anything failed (ADR 22: report as well as gate). */
function report(css) {
  const lines = [];
  for (const theme of ["dark", "light"]) {
    const tokens = tokensForTheme(css, theme);
    const measured = [...TEXT_TOKENS, ...STATUS_TOKENS].map(
      (token) =>
        `${token.replace("--", "")} ${contrastRatio(tokens[token], tokens["--surface"]).toFixed(2)}`,
    );
    lines.push(`  ${theme} on --surface: ${measured.join(" · ")}`);
  }
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [css, paletteSource] = await Promise.all([
    readFile(TOKENS, "utf8"),
    readFile(PALETTE, "utf8"),
  ]);
  const problems = findTokenProblems(css, paletteSource);
  console.log(report(css));
  if (problems.length > 0) {
    console.error(`\nToken problems:\n${problems.map((line) => `  - ${line}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("\nTokens agree with the palette, and every measured ratio clears WCAG 2.2 AA.");
  }
}
