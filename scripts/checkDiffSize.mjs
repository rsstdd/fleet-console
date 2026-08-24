// The reviewable-diff budget, and the check that fails a pull request exceeding it.
//
// ADR 27 decided this. `AGENTS.md` already asked for "small focused diffs"; Principle 15
// says a review-only rule is a convention rather than a guarantee, and ADR 7 records what
// this repository paid the last time it trusted one. This is the mechanism.
//
// THE DERIVATION (ADR 27 § Argument). ADR 22's standing rule is that a threshold without
// a derivation is worse than none, because it is raised the first time it fails. So the
// number below is a consequence of a named claim about a reader, and moving it means
// changing that claim in the open.
//
//   Unit: one reviewer, one uninterrupted sitting, taken as 60 minutes. Past that the
//     reviewer is interrupted or tired, and either one ends the careful reading.
//
//   Rate: 300 lines per hour of careful, defect-seeking reading — the pace at which a
//     reader is checking a change rather than confirming its shape. Skim rates are
//     several times higher, which is exactly the point: above this rate the reading that
//     happens is not the reading this gate is trying to buy. This is the softest input
//     in the derivation, and ADR 27 states its falsifier.
//
//   Therefore: 60 min x 300 lines/h = 300 lines. One pull request is one sitting.
//     => LINE_BUDGET = 300, additions + deletions, across the whole PR range.
//
// WHAT THIS GATE IS FOR. It stops the large, plausible, agent-written change that nobody
// reads closely — where the defect is hidden by the same volume that exhausts the
// reviewer. It is not a style rule about how much code a change may contain: a 900-line
// change is not forbidden, it is required to say that it is one.
//
// THE OVERRIDE. `Oversized-diff: <reason>` in any commit message in the range passes the
// gate. Some necessary changes are indivisible — the initial import (TODO.md P0.3) is
// ~27,000 lines, and a tree-wide rename has no smaller form — and a gate a necessary
// change cannot pass is bypassed once and then always. The trailer converts an
// unavoidable exception into a recorded one: `git log --grep='Oversized-diff:'` returns
// every change that ever claimed it, with its stated reason. It is author-asserted and
// verifies nothing; it buys deliberation and an audit trail, not authorization.
//
// EXCLUSIONS. Generated output does not count, because nobody wrote it and nobody reads
// it: the lockfile, the recorded vendor fixtures (ADR 13) and the generated decision
// index, which AGENTS.md forbids editing by hand. Counting them would spend a reviewer's
// budget on the output of `pnpm record:fixtures` and `pnpm docs:decisions`, both of which
// other ADRs require to be run.
//
// Coupling: `docs/decisions.json` registers this file under `mechanicalRules` against
// ADR 27; `scripts/checkDiffSize.test.mjs` owns the behaviour below.
import { execFileSync } from "node:child_process";

/** Additions plus deletions a single pull request may change before CI fails it (ADR 27). */
export const LINE_BUDGET = 300;

/** The commit trailer that passes an oversized change, with the author's stated reason. */
export const OVERRIDE_TRAILER = "Oversized-diff:";

/**
 * Paths whose lines are generated rather than written, and so are not counted.
 * Each entry names the command or ADR that produces it; nothing goes here merely
 * because it is large.
 */
const GENERATED = [
  /^pnpm-lock\.yaml$/, // pnpm install
  /^packages\/adapters\/src\/vendors\/[^/]+\/__fixtures__\/.*\.json$/, // pnpm record:fixtures (ADR 13)
  /^packages\/web\/src\/styles\/tokens\.css$/, // pnpm --filter web tokens:generate (ADR 5)
  /^docs\/PENDING_ARCHITECTURE_DECISIONS\.md$/, // pnpm docs:decisions
];

/** Extensions that are read by a human and therefore counted (ADR 27 § Decision). */
const COUNTED = new Set([".ts", ".tsx", ".mjs", ".js", ".jsx", ".css", ".md"]);

/** True when a repository-relative path is generated output rather than authored lines. */
export function isGenerated(filePath) {
  return GENERATED.some((pattern) => pattern.test(filePath));
}

/** True when a path's lines count against the budget: authored, and of a read extension. */
export function isCounted(filePath) {
  if (isGenerated(filePath)) return false;
  const dot = filePath.lastIndexOf(".");
  return dot === -1 ? false : COUNTED.has(filePath.slice(dot));
}

/**
 * Sums additions and deletions over `git diff --numstat` output, skipping generated and
 * uncounted paths. Binary files report `-` for both counts and contribute nothing.
 */
export function countChangedLines(numstat) {
  const counted = [];
  let total = 0;

  for (const line of numstat.split("\n")) {
    if (line.trim() === "") continue;
    const [added, removed, ...rest] = line.split("\t");
    const filePath = rest.join("\t");
    if (!isCounted(filePath)) continue;
    if (added === "-" || removed === "-") continue;

    const lines = Number(added) + Number(removed);
    total += lines;
    counted.push({ filePath, lines });
  }

  counted.sort((a, b) => b.lines - a.lines);
  return { total, counted };
}

/**
 * Finds the override reason in a range's commit messages, or null when none claims it.
 * The reason must be non-empty: a bare trailer asserts nothing a reader can weigh.
 */
export function findOverride(commitMessages) {
  for (const line of commitMessages.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.toLowerCase().startsWith(OVERRIDE_TRAILER.toLowerCase())) continue;
    const reason = trimmed.slice(OVERRIDE_TRAILER.length).trim();
    if (reason !== "") return reason;
  }
  return null;
}

const git = (args) => execFileSync("git", args, { encoding: "utf8" });

/**
 * Resolves the commit this change is measured against: the pull request's base on CI,
 * and the merge base with the default branch locally.
 */
function resolveBase() {
  const baseRef = process.env.GITHUB_BASE_REF;
  const candidates = baseRef
    ? [`origin/${baseRef}`, baseRef]
    : ["origin/main", "main", "origin/master", "master"];

  for (const candidate of candidates) {
    try {
      return git(["merge-base", "HEAD", candidate]).trim();
    } catch {
      // Not every candidate exists in a shallow or freshly cloned checkout.
    }
  }
  return null;
}

function main() {
  const base = resolveBase();
  if (base === null) {
    // No base to compare against is not a violation. Saying so beats inventing a number.
    console.log("check:diff-size — no base branch resolved; nothing to measure.");
    return;
  }

  const { total, counted } = countChangedLines(git(["diff", "--numstat", `${base}...HEAD`]));
  const override = findOverride(git(["log", "--format=%B", `${base}..HEAD`]));

  for (const { filePath, lines } of counted.slice(0, 10)) {
    console.log(`  ${String(lines).padStart(6)}  ${filePath}`);
  }
  if (counted.length > 10) {
    console.log(`  ${String(counted.length - 10).padStart(6)}  more files`);
  }
  console.log(`\nreviewable diff: ${total} lines changed  (budget ${LINE_BUDGET}, ADR 27)`);

  if (total <= LINE_BUDGET) return;

  if (override !== null) {
    console.log(`\nOver budget, and claimed as an exception:\n  ${OVERRIDE_TRAILER} ${override}`);
    return;
  }

  console.error(
    [
      ``,
      `This change is ${total - LINE_BUDGET} lines over the reviewable-diff budget (ADR 27).`,
      ``,
      `Split it at a natural seam — one package, one decision, or one behaviour with its`,
      `tests. If it genuinely cannot be split, say so in a commit trailer:`,
      ``,
      `    ${OVERRIDE_TRAILER} <why this change has no smaller form>`,
      ``,
      `The trailer passes this gate and stays in the history as the reason.`,
    ].join("\n"),
  );
  process.exit(1);
}

// Importable for tests; only the direct invocation touches git or exits.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
