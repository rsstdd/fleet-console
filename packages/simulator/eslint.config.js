// Principle 15: the rules this package lives by are enforced here, not in review.
// Each block below corresponds to a rule stated in AGENTS.md; if a rule moves,
// move the block with it so the two cannot drift.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import { informativeDocsRule } from "../../config/eslint/informativeDocs.js";

/**
 * AGENTS.md § Robot and telemetry generation: generation uses an injected clock
 * and seeded randomness so a demo run and a test observe the same sequence. A
 * module that reads the wall clock or `Math.random()` directly has silently made
 * the workload irreproducible.
 */
const DETERMINISM_MESSAGE =
  "Generation is deterministic: take a Clock and a seeded RandomSource instead of reading " +
  "ambient time or randomness. `src/runtime/` is the one place these are read (AGENTS.md " +
  "§ Robot and telemetry generation).";

/** Packages this one may not reach into at all; the ingest endpoint is the boundary. */
const FORBIDDEN_PACKAGES = [
  { group: ["@fleet/web", "@fleet/web/*"] },
  { group: ["@fleet/server", "@fleet/server/*"] },
].map(({ group }) => ({
  group,
  message:
    "The simulator talks to the server over HTTP ingest and never imports it, and it knows " +
    "nothing about the console (AGENTS.md § Dependency and ownership boundaries).",
}));

/**
 * ADR 16: `@fleet/adapters` is a dev dependency, banned in production code and
 * permitted in tests.
 *
 * The simulator restates the three vendor identifiers rather than importing them,
 * because a production import would invert the dependency this package exists to
 * exercise — it must be able to emit a payload the adapters reject. The one thing
 * that duplication needs is a test proving the two lists agree, and that test has
 * to import both. This ban is what keeps the import confined to it.
 *
 * The message names the test, because the only legitimate reason to reach for this
 * specifier is to extend that comparison.
 */
const TEST_ONLY_ADAPTERS = {
  group: ["@fleet/adapters", "@fleet/adapters/*"],
  message:
    "Production code here must not import @fleet/adapters: the simulator emits raw dialects " +
    "and must stay able to produce payloads the adapters reject. It is a dev dependency for " +
    "one purpose — the vendor-set comparison in src/fleet/vendorId.test.ts (ADR 16, D7).",
};

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "src/__enforcement__"] },

  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },

  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Principles 2 and 15: use precise types or `unknown` plus validation;
      // explicit `any` would opt this producer out of static analysis.
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: DETERMINISM_MESSAGE },
        { object: "Date", property: "now", message: DETERMINISM_MESSAGE },
        { object: "performance", property: "now", message: DETERMINISM_MESSAGE },
      ],
      "no-restricted-imports": ["error", { patterns: [...FORBIDDEN_PACKAGES, TEST_ONLY_ADAPTERS] }],
      // A dropped floating promise in the emission loop is an unbounded queue
      // that nothing counts — the specific failure AGENTS.md § Scheduling and
      // transport names.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // Principle 2: an HTTP response body is untrusted until it has been read
      // deliberately. Asserting one into shape is the coercion we reject.
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },

  // `src/runtime/` adapts the ambient platform — the real clock, the real random
  // source, the real timers — into the injectable interfaces every other module
  // takes. It is the one place the determinism ban is lifted; move the directory
  // and this exception moves with it.
  {
    files: ["src/runtime/**/*.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  // `src/index.ts` is the executable boundary: process argv, env, signals and
  // exit codes live here and nowhere else (TODO § 16).
  {
    files: ["src/index.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  {
    files: ["**/*.test.ts"],
    rules: {
      // @fleet/adapters is permitted here and only here (ADR 16). The packages
      // this simulator may never import stay banned, so the exception is narrow
      // rather than a blanket lift of the import rule.
      "no-restricted-imports": ["error", { patterns: FORBIDDEN_PACKAGES }],
      "@typescript-eslint/no-non-null-assertion": "off",
      // Tests may reach for the real clock to assert that production code does not.
      "no-restricted-properties": "off",
      // `expect.any(String)` and friends are typed `any` by the assertion
      // library, so an object literal containing one trips this rule. The
      // narrow exception is for that; production code keeps the rule, which is
      // where Principle 2 actually needs it.
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  /*
   * A doc comment must say something the signature does not (ADR 28). The tuned word
   * lists are shared from `config/eslint/informativeDocs.js` because they are data, not
   * policy; every other rule in this file is stated here on purpose.
   */
  {
    files: ["**/*.ts"],
    plugins: { jsdoc },
    rules: { "jsdoc/informative-docs": informativeDocsRule },
  },
);
