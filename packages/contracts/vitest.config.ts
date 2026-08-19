import { defineConfig } from "vitest/config";

/**
 * Node-environment test configuration for the contracts package.
 *
 * Coverage thresholds are set on branches deliberately: the value of this
 * package is in its rejection paths — malformed input, boundary thresholds,
 * unsupported versions — and a line-coverage target would be satisfied by the
 * happy path alone (Principle 10).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The barrel re-exports and is verified by the public-API smoke test;
      // counting it as coverable source measures nothing.
      exclude: ["src/index.ts", "src/**/*.test.ts"],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
