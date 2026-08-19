// Principle 15: the rules this package lives by are enforced here, not in review.
// Each block corresponds to a rule stated in AGENTS.md or an ADR; if a rule moves,
// move the block with it so the two cannot drift.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import { informativeDocsRule } from "../../config/eslint/informativeDocs.js";

/**
 * The one module permitted to read the wall clock.
 *
 * ADR 3 puts the freshness sweep on the server and AGENTS.md requires `receivedAt`
 * to be stamped from the server clock at ingest, so this package genuinely owns a
 * clock — unlike `packages/adapters`, which has none. Confining the read to one
 * module is what makes every other unit testable with an injected clock instead of
 * a wall-clock sleep (AGENTS.md § Tests).
 */
const CLOCK_MODULE = "src/runtime/clock.ts";

const CLOCK_MESSAGE =
  "Read time through the injected `Clock` from src/runtime/clock.ts. Only that module " +
  "touches the wall clock, so freshness, late-tick detection and coalescing stay testable " +
  "with fake timers (ADR 3, AGENTS.md § Tests).";

/** Persistence and broker packages ADR 6 and ADR 2 decided against adding. */
const STORAGE_AND_BROKER = [
  "better-sqlite3",
  "sqlite3",
  "node:sqlite",
  "redis",
  "ioredis",
  "mqtt",
  "amqplib",
  "nats",
  "kafkajs",
];

const STORAGE_MESSAGE =
  "ADR 6 decides there is no database in this package, and ADR 2 decides no broker is " +
  "introduced at this scale. Both name the conditions for revisiting. Amend the ADR first; " +
  "do not add the dependency and backfill the record.";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "src/__boundary-violation__/**"] },

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
        {
          object: "process",
          property: "env",
          message:
            "Deployment values are read once, validated, and typed in src/config (Principle 13). " +
            "A `process.env` read elsewhere is an undeclared configuration input.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // `packages/web` is currently named `web`, not `@fleet/web`; both are
              // banned so the rule survives the rename tracked in TODO.md § H4.
              group: ["@fleet/web", "@fleet/web/*", "web", "web/*"],
              message:
                "The server never imports the console or reproduces its presentation logic " +
                "(AGENTS.md § Dependency and ownership boundaries).",
            },
            {
              group: ["@fleet/adapters/*", "**/packages/adapters/src/**"],
              message:
                "Dispatch through the adapters package's public entry point. A deep import into a " +
                "vendor module is vendor-specific knowledge in a server handler (AGENTS.md § Ingest boundary), " +
                "and @fleet/adapters/testing is recorded fixtures for tests, not runtime behaviour (ADR 11). " +
                "This ban covers test files too: an ingest test that wants those fixtures needs an explicit " +
                "test-file exception first, the way packages/web has one.",
            },
            ...STORAGE_AND_BROKER.map((name) => ({
              group: [name, `${name}/*`],
              message: STORAGE_MESSAGE,
            })),
          ],
        },
      ],
      // Principle 12: incidents must be diagnosable from structured events with stable
      // names, not from strings that happen to be on stdout.
      "no-console": "error",
      // Principle 2: request bodies, parameters, headers and configuration are `unknown`
      // until a schema has decoded them. Asserting one into shape is the coercion the
      // ingest boundary exists to prevent.
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // An unawaited promise in ingest or fan-out is a lost rejection and a lost metric.
      "@typescript-eslint/no-floating-promises": "error",
    },
  },

  // The single sanctioned wall-clock read.
  {
    files: [CLOCK_MODULE],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
    },
  },

  // Configuration is where `process.env` and file reads are declared, validated and typed.
  {
    files: ["src/config/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: CLOCK_MESSAGE },
      ],
    },
  },

  // Tests inject their own clocks and fixtures, and may name a literal instant.
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
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
