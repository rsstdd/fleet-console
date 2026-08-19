import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Generation, scheduling and transport are all pure over injected time; no
    // test in this package sleeps against the wall clock (AGENTS.md § Tests).
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Lint fixtures under __enforcement__ are named *.fixture.test.ts so ESLint's
    // `**/*.test.ts` override classifies them the way the real file they stand in
    // for is classified. They are inputs to a test, not tests, so vitest must not
    // collect them — `enforcement.test.ts` in the same directory still runs
    // (ADR 16; the convention comes from packages/web under ADR 12).
    exclude: ["**/node_modules/**", "src/__enforcement__/**/*.fixture.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/__enforcement__/**"],
    },
  },
});
