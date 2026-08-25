import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import boundaries from "eslint-plugin-boundaries";
import jsdoc from "eslint-plugin-jsdoc";
import { informativeDocsRule } from "../../config/eslint/informativeDocs.js";
import webTokenLint from "../../scripts/webTokenLint.mjs";

export default tseslint.config(
  // playwright-report and test-results are Playwright's generated diagnostics (ADR 32).
  {
    ignores: [
      "dist",
      // The tenant-B production bundle the e2e tenant project builds (ADR 17, ADR 32).
      "dist-tenant-b",
      "coverage",
      "playwright-report",
      "test-results",
      "**/__boundary-violation__/**",
    ],
  },

  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },

  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      boundaries,
      "web-tokens": webTokenLint,
    },
    settings: {
      // eslint-plugin-boundaries resolves each import to a file path before it can
      // classify the dependency's element type. The default node resolver follows
      // neither the "@/" alias nor ".ts" extensions, so every dependency classified
      // as "unknown" and boundaries/dependencies skipped it silently (TODO B11).
      // Without this block the dependency rule enforces nothing at all.
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.app.json", "./tsconfig.node.json"],
          noWarnOnMultipleProjects: true,
        },
      },
      "boundaries/include": ["src/**/*"],
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "feature", pattern: "src/features/*/**", capture: ["feature"] },
        { type: "hooks", pattern: "src/hooks/**" },
        { type: "stores", pattern: "src/stores/**" },
        { type: "types", pattern: "src/types/**" },
        { type: "components", pattern: "src/components/**" },
        { type: "lib", pattern: "src/lib/**" },
        { type: "context", pattern: "src/context/**" },
        { type: "utils", pattern: "src/utils/**" },
        { type: "config", pattern: "src/config/**" },
        // The authored token module is configuration data; its CSS sibling is generated.
        { type: "config", pattern: "src/styles/**" },
        { type: "test", pattern: "src/test/**" },
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          // Inspect external packages too, so the layer restrictions below apply
          // to them. Every layer therefore needs an explicit external allowance.
          checkAllOrigins: true,
          // An import the rule cannot resolve is an error, not a skip. Silence is
          // the failure mode ADR 7 exists because of: the dependency rule reported
          // nothing for months and nothing is indistinguishable from passing.
          // Enabled 19 August 2026 after a survey found zero unclassifiable imports
          // in the tree; the cost of turning it on later only grows.
          checkUnknownLocals: true,
          // v7 renders these with Handlebars and names the two sides `from` and
          // `to`. The v6 names (`file`, `dependency`) and the legacy ${...}
          // syntax both still parse but render empty, which is how this message
          // read "may not import  (PRINCIPLES.md 9)" for its whole life.
          message: "{{from.type}} may not import {{to.type}} (PRINCIPLES.md 9).",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: [
                { to: { element: { type: "app" } } },
                { to: { element: { type: "feature" } } },
                { to: { element: { type: "hooks" } } },
                { to: { element: { type: "stores" } } },
                { to: { element: { type: "types" } } },
                { to: { element: { type: "components" } } },
                { to: { element: { type: "lib" } } },
                { to: { element: { type: "context" } } },
                { to: { element: { type: "utils" } } },
                { to: { element: { type: "config" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              from: { element: { type: "feature" } },
              allow: [
                {
                  to: {
                    element: {
                      type: "feature",
                      captured: { feature: "{{from.captured.feature}}" },
                    },
                  },
                },
                { to: { element: { type: "hooks" } } },
                { to: { element: { type: "stores" } } },
                { to: { element: { type: "types" } } },
                { to: { element: { type: "components" } } },
                { to: { element: { type: "lib" } } },
                { to: { element: { type: "context" } } },
                { to: { element: { type: "utils" } } },
                { to: { element: { type: "config" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              from: { element: { type: "hooks" } },
              allow: [
                { to: { element: { type: "hooks" } } },
                { to: { element: { type: "stores" } } },
                { to: { element: { type: "types" } } },
                { to: { element: { type: "lib" } } },
                { to: { element: { type: "utils" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              from: { element: { type: "stores" } },
              allow: [
                { to: { element: { type: "stores" } } },
                { to: { element: { type: "types" } } },
                { to: { element: { type: "utils" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              from: { element: { type: "types" } },
              allow: [
                { to: { element: { type: "types" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              from: { element: { type: "components" } },
              allow: [
                { to: { element: { type: "components" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              // `lib → context` carries exactly one dependency today: the transport
              // and its retry schedule import the `StreamConnectionState` type from
              // `context/connectionContext`, the one authority on that union (ADR 23).
              from: { element: { type: "lib" } },
              allow: [
                { to: { element: { type: "lib" } } },
                { to: { element: { type: "context" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              // `context → config` exists for `tenantConfigContext`, which carries
              // the typed tenant configuration down to the shell (ADR 17).
              from: { element: { type: "context" } },
              allow: [
                { to: { element: { type: "context" } } },
                { to: { element: { type: "config" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              from: { element: { type: "utils" } },
              allow: [
                { to: { element: { type: "utils" } } },
                { to: { element: { type: "types" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              from: { element: { type: "config" } },
              allow: [
                { to: { element: { type: "config" } } },
                { to: { module: { origin: "external" } } },
              ],
            },
            {
              from: { element: { type: "test" } },
              allow: [
                { to: { element: { type: "app" } } },
                { to: { element: { type: "feature" } } },
                { to: { element: { type: "hooks" } } },
                { to: { element: { type: "stores" } } },
                { to: { element: { type: "types" } } },
                { to: { element: { type: "components" } } },
                { to: { element: { type: "lib" } } },
                { to: { element: { type: "context" } } },
                { to: { element: { type: "utils" } } },
                { to: { element: { type: "config" } } },
                { to: { module: { origin: "external" } } },
              ],
            },

            // ---- External dependencies by layer ----
            // These follow the allow policies above deliberately: a later
            // matching policy wins, so the blanket external allowance each
            // layer carries is narrowed here rather than replaced.
            //
            // ADR 4, amended 19 August 2026 (layer names per ADR 36): bare
            // "react" is allowed in the data layers — a hook needs `react` for
            // useMemo/useSyncExternalStore without producing JSX. JSX itself
            // is already blocked by these layers' .ts-only file convention
            // (a .ts file cannot contain JSX syntax; Vite rejects it as a
            // parse error independent of this rule). The real
            // framework-coupling risk — rendering and routing — is forbidden
            // below via react-dom, @mui/*, and react-router*, for each of the
            // four non-JSX data layers the former entity layer became.
            {
              from: { element: { type: "hooks" } },
              disallow: {
                to: {
                  module: {
                    origin: "external",
                    // A plain array, not { anyOf: [...] }: the anyOf form throws
                    // "template.replaceAll is not a function" inside
                    // @boundaries/elements@3.1.1 when the origin is external,
                    // and the rule then silently matches nothing.
                    source: ["react-dom", "@mui/*", "react-router*"],
                  },
                },
              },
              message:
                "The data layers render nothing and route nothing. No react-dom, no MUI, no router (PRINCIPLES.md 1; ADR 4; ADR 36).",
            },
            {
              from: { element: { type: "stores" } },
              disallow: {
                to: {
                  module: {
                    origin: "external",
                    source: ["react-dom", "@mui/*", "react-router*"],
                  },
                },
              },
              message:
                "The data layers render nothing and route nothing. No react-dom, no MUI, no router (PRINCIPLES.md 1; ADR 4; ADR 36).",
            },
            {
              from: { element: { type: "utils" } },
              disallow: {
                to: {
                  module: {
                    origin: "external",
                    source: ["react-dom", "@mui/*", "react-router*"],
                  },
                },
              },
              message:
                "The data layers render nothing and route nothing. No react-dom, no MUI, no router (PRINCIPLES.md 1; ADR 4; ADR 36).",
            },
            {
              from: { element: { type: "types" } },
              disallow: {
                to: {
                  module: {
                    origin: "external",
                    source: ["react-dom", "@mui/*", "react-router*"],
                  },
                },
              },
              message:
                "The data layers render nothing and route nothing. No react-dom, no MUI, no router (PRINCIPLES.md 1; ADR 4; ADR 36).",
            },
            {
              from: { element: { type: "components" } },
              disallow: {
                to: {
                  module: { origin: "external", source: "@fleet/contracts" },
                },
              },
              message:
                "Presentational primitives take presentational unions, never contract types. " +
                "The mapping is a tested selector in utils/robotSelectors (PRINCIPLES.md 9).",
            },
            {
              from: { element: { type: "config" } },
              disallow: {
                to: {
                  module: {
                    origin: "external",
                    source: ["react", "@mui/*"],
                  },
                },
              },
              message: "Configuration is data. Logic of any kind belongs elsewhere.",
            },
          ],
        },
      ],

      /*
       * `@fleet/adapters` decodes untrusted vendor dialects and belongs to the
       * server. The console consumes canonical envelopes from
       * `@fleet/contracts` and must never pull vendor decoding into a browser
       * bundle (ADR 1, Principle 3). Ratified as ADR 12; register stub D3.
       *
       * Not expressed through `boundaries/dependencies`, deliberately. That
       * rule classifies a file by the element it sits in, so
       * `utils/fromEnvelope.test.ts` is a `utils` module like its
       * neighbours — there is no way to say "except in tests" without
       * inventing a test-file element type and reclassifying every existing
       * test. ESLint's own file scoping says it in one line instead: the ban
       * lives here and the override block at the bottom of this file lifts it
       * for `*.test.*`, which is where the end-to-end contract path joins the
       * vendor half (ADR 12 § Decision).
       *
       * Both fixtures under `src/utils/__boundary-violation__/` are
       * asserted by `features/fleet/__boundary-violation__/violation.test.ts`:
       * one proves the ban fires, the other proves the exception holds.
       */
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@fleet/adapters",
              message:
                "Vendor decoding is server-side. Consume canonical envelopes from @fleet/contracts instead; only test files may import the adapters (ADR 12).",
            },
          ],
          // `paths` matches an exact specifier, so the subpath ADR 11 added
          // would otherwise walk straight past the ban above. A test-only
          // surface reaching production code is the failure that subpath was
          // designed to make impossible, so the pattern closes it here rather
          // than relying on nobody noticing the gap.
          patterns: [
            {
              group: ["@fleet/adapters/*"],
              message:
                "@fleet/adapters/testing is recorded fixtures for tests. Production code must not import it, and no other adapters subpath is public (ADR 11).",
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
      ],
      "web-tokens/no-raw-visual-units": "error",

      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
    },
  },

  {
    files: ["src/styles/tokens.ts"],
    rules: { "web-tokens/no-raw-visual-units": "off" },
  },

  {
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": "off",
      "web-tokens/no-raw-visual-units": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      // The end-to-end contract path runs a recorded vendor fixture through a
      // real adapter and asserts the read model the console renders. That is
      // the one legitimate reason for this package to touch @fleet/adapters,
      // and it is confined to test files by this override rather than by
      // convention (ADR 12 § Decision). Widening this glob is an ADR amendment,
      // not a config tidy-up: a shared test helper importing adapters is banned
      // on purpose (ADR 12 § Implications).
      "no-restricted-imports": "off",
    },
  },

  /*
   * A doc comment must say something the signature does not (ADR 28). The tuned word
   * lists are shared from `config/eslint/informativeDocs.js` because they are data, not
   * policy; every other rule in this file is stated here on purpose.
   */
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { jsdoc },
    rules: { "jsdoc/informative-docs": informativeDocsRule },
  },
);
