// Principle 15: the rules this package lives by are enforced here, not in review.
// Each block below corresponds to a rule stated in AGENTS.md; if a rule moves,
// move the block with it so the two cannot drift.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import { informativeDocsRule } from "../../config/eslint/informativeDocs.js";

/**
 * Vendor dialect directory names under `src/vendors`; each is isolated from the
 * others. Lower-case here because these are paths; the identifiers themselves
 * are `VendorId` in `src/core/vendor.ts` and are upper-case.
 */
const VENDOR_DIRS = ["a", "b", "c"];

/**
 * ADR 3: freshness is derived by a server sweep over an injected `receivedAt`.
 * An adapter that reads the wall clock has quietly become a second authority.
 */
const CLOCK_MESSAGE =
  "Adapters never read the wall clock. `receivedAt` is supplied by the server boundary " +
  "and `reportedAt` comes from the vendor payload (ADR 3, AGENTS.md § Adapter contract).";

/**
 * ADR 11: `@fleet/adapters/testing` is imported by `packages/web`, which targets a
 * browser. A Node-only API in that directory breaks the console the moment its build
 * is not running under Node.
 *
 * The ADR named "the console's test run breaks" as the falsifier for this rule. It
 * does not: web's vitest runs in Node with a jsdom environment, so `node:fs` resolves
 * there and 208 tests stay green. The rule was documented in two comments and enforced
 * by nothing, which is the ADR 7 failure mode — silence indistinguishable from a pass.
 * This is the mechanism that was missing; `src/testing/__enforcement__/` is the proof
 * it fires.
 */
const NODE_FREE_MESSAGE =
  "The ./testing subpath is consumed by browser-targeted packages. It must stay free of " +
  "Node-only APIs; fixtures are static JSON imports, not filesystem reads (ADR 11).";

/** Node builtins, with and without the `node:` prefix, since either import resolves. */
const NODE_BUILTIN_PATTERNS = [
  "node:*",
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "fs",
  "fs/promises",
  "module",
  "os",
  "path",
  "process",
  "stream",
  "url",
  "util",
];

/**
 * Workspace imports, expressed as an allow-list rather than a deny-list.
 *
 * `@fleet/contracts` is the one workspace package this one may import. Naming the
 * three current siblings instead would admit a fourth package by omission, which is
 * the failure mode ADR 7 records: a rule that permits by silence is not a rule. The
 * `!` entries are gitignore-style negations, evaluated in order.
 *
 * `web` is listed unprefixed because `packages/web` is still named `web` rather than
 * `@fleet/web` — see TODO.md § H4 in packages/server.
 */
const FORBIDDEN_PACKAGES = [
  {
    group: ["@fleet/*", "!@fleet/contracts", "@fleet/*/*", "!@fleet/contracts/*"],
    message:
      "This package sits below transport, storage, and UI. It may import @fleet/contracts and nothing else " +
      "from the workspace (AGENTS.md § Package responsibilities).",
  },
  {
    group: ["web", "web/*"],
    message:
      "The adapter boundary never imports the console. Vendor differences travel as declared " +
      "capabilities, not as anything the UI hands back (AGENTS.md § Package responsibilities).",
  },
];

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "**/__enforcement__/**"] },

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
      // Principles 2 and 15: boundary values stay `unknown` until validation;
      // explicit `any` would opt this package out of the checked contract.
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-globals": [
        "error",
        { name: "Date", message: CLOCK_MESSAGE },
        { name: "performance", message: CLOCK_MESSAGE },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: CLOCK_MESSAGE },
      ],
      "no-restricted-imports": ["error", { patterns: FORBIDDEN_PACKAGES }],
      // Principle 2: vendor input is `unknown` until a schema has decoded it.
      // Asserting a payload into a canonical shape is exactly the coercion this
      // package exists to prevent, so the assertion itself is the error.
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },

  // One vendor adapter must never import another. A shared helper that two
  // vendors need belongs in `src/core`, where the sharing is visible (ADR 1).
  ...VENDOR_DIRS.map((vendor) => ({
    files: [`src/vendors/${vendor}/**/*.ts`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...FORBIDDEN_PACKAGES,
            // Both the relative form a sibling would actually write (`../b/...`)
            // and the absolute form. Matching only one of the two is the silent
            // no-op ADR 7 was written about.
            ...VENDOR_DIRS.filter((other) => other !== vendor).map((other) => ({
              group: [
                `../${other}`,
                `../${other}/**`,
                `**/vendors/${other}`,
                `**/vendors/${other}/**`,
              ],
              message: `Vendor ${vendor.toUpperCase()} must not import vendor ${other.toUpperCase()}. Shared behaviour belongs in src/core (ADR 1).`,
            })),
          ],
        },
      ],
    },
  })),

  // Fixtures are recorded vendor payloads. They are deliberately untyped and
  // deliberately malformed in places; the schemas are what judge them.
  {
    files: ["**/__fixtures__/**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "off",
    },
  },

  // ADR 11: nothing Node-only in the public fixture subpath. Applies to the test
  // files in that directory too — a Node API reached for in a test there is the same
  // module a browser consumer would resolve.
  {
    files: ["src/testing/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...FORBIDDEN_PACKAGES,
            { group: NODE_BUILTIN_PATTERNS, message: NODE_FREE_MESSAGE },
          ],
        },
      ],
      // `import.meta.dirname` and `.filename` are Node-only and are not imports, so
      // the ban above cannot see them. `fixtures.ts` names both in its own comment as
      // the things it must not reach for.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.type='MetaProperty'][property.name=/^(dirname|filename)$/]",
          message: NODE_FREE_MESSAGE,
        },
      ],
    },
  },

  // Tests assert on decoded output and may name the four freshness states,
  // but still must not reach for a real clock.
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
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
