import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import { informativeDocsRule } from "../../config/eslint/informativeDocs.js";

/**
 * Lint policy for @fleet/contracts.
 *
 * The one package-specific rule is the import ban: contracts sits at the bottom
 * of the dependency graph and every other workspace package depends on it, so an
 * import in the other direction is a cycle. `packages/web` enforces its layering
 * with eslint-plugin-boundaries (ADR 7); here there is only one edge to forbid,
 * so a `no-restricted-imports` pattern is the proportionate mechanism rather than
 * a second resolver-backed plugin (Principle 15).
 */
export default tseslint.config(
  { ignores: ["dist", "coverage"] },

  {
    files: ["**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // Self-reference is exempt: importing "@fleet/contracts" from
              // inside this package is how the public-API smoke test proves the
              // exports map resolves, and it is not an upward edge.
              group: ["@fleet/*", "!@fleet/contracts", "**/packages/*"],
              message:
                "Contracts is the bottom of the dependency graph. Higher packages import it, never the reverse (PRINCIPLES.md 9; packages/contracts/AGENTS.md).",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "Use a union of string literals rather than an enum.",
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            "Contracts reads no clock. Freshness takes `now` as an argument so it stays a pure function (ADR 3).",
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            "Contracts reads no clock and formats no dates. Timestamps are epoch milliseconds end to end (ADR 1, ADR 3).",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-console": "error",
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
    },
  },

  // Tests are allowed the clock helpers the production code is denied: a test
  // asserting a threshold boundary needs to construct instants.
  {
    files: ["**/*.test.ts"],
    rules: { "no-restricted-syntax": "off" },
  },

  {
    files: ["eslint.config.js", "vitest.config.ts"],
    extends: [tseslint.configs.disableTypeChecked],
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
