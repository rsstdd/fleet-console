/**
 * Shared options for `jsdoc/informative-docs`: a doc comment must say something the
 * signature does not.
 *
 * This repository leans hard on prose — the architecture audit counts roughly 8,400 lines
 * of documentation against 7,500 of source — and that only pays off while the prose
 * carries reasoning the code cannot. A comment restating its own signature costs the same
 * to read as one explaining a coupling, and teaches the reader to skim past both. This is
 * the mechanical form of the house rule already in every package's AGENTS.md: document the
 * *why* and the non-obvious coupling, never the *what* (ADR 28).
 *
 * **Only the word lists are shared.** Every other lint rule in this repository is stated
 * per package, deliberately, because each package's policy is its own. These lists are the
 * exception because they are tuned data rather than policy, and five copies of a tuned
 * word list is five things that drift (Principle 1). The plugin itself is imported by each
 * package's config, so nothing here needs a root dependency.
 *
 * A package that ever needs to differ overrides the rule in its own config and says why
 * there — the override is visible, which a silently diverged copy would not be.
 */

/**
 * Verb and noun forms treated as the same word when a description is compared to a name.
 *
 * Measured, not guessed. With the rule's defaults alone, one of six deliberately redundant
 * fixtures was caught: it flags a restated noun (`The robot id.` on `robotId`) and **misses
 * the canonical case** — `Sets the user name.` on `setUserName` — because "sets" and "set"
 * are different strings to it. These entries close that gap.
 *
 * Each key is the form that appears in an identifier; the values are the forms that appear
 * in prose. Adding a word makes the rule stricter, so add one when a redundant comment gets
 * through, not pre-emptively.
 */
export const INFORMATIVE_DOCS_ALIASES = {
  // The rule's own default, restated because supplying `aliases` replaces it entirely
  // rather than merging — dropping this line would quietly weaken the rule.
  a: ["an", "our"],
  build: ["builds", "building", "construct", "constructs"],
  create: ["creates", "creating", "make", "makes"],
  decode: ["decodes", "decoding", "parse", "parses", "parsing"],
  encode: ["encodes", "encoding", "serialize", "serializes"],
  get: ["gets", "getting", "return", "returns", "read", "reads"],
  id: ["identifier"],
  is: ["whether", "checks", "check"],
  set: ["sets", "setting", "write", "writes"],
  to: ["convert", "converts", "converting"],
};

/**
 * Words carrying no information, stripped before the comparison.
 *
 * The rule's seven defaults plus filler this codebase's own comments use. Everything here
 * must be a word that can never make a comment informative by itself: "value" and "given"
 * qualify; "vendor", "raw" and "freshness" would not, and adding one of those would start
 * flagging comments that are doing real work.
 */
export const INFORMATIVE_DOCS_USELESS_WORDS = [
  "a",
  "an",
  "i",
  "in",
  "of",
  "s",
  "the",
  "this",
  "for",
  "to",
  "value",
  "given",
  "from",
];

/**
 * The rule entry each package spreads into its own config.
 *
 * Severity is `error` rather than `warn`, and that was safe to choose because it was
 * measured first: the rule reports **zero** findings across every package's `src/`, so
 * nothing is grandfathered and no baseline file exists to rot. A warning nobody must fix
 * is a rule that never fires — ADR 7's recorded failure mode, one layer up.
 */
export const informativeDocsRule = [
  "error",
  { aliases: INFORMATIVE_DOCS_ALIASES, uselessWords: INFORMATIVE_DOCS_USELESS_WORDS },
];
