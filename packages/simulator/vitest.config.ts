import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // `src/__enforcement__/enforcement.test.ts` lints files on disk, so its
    // input is the working tree rather than a fixture value — the one suite here
    // that can fail for reasons unrelated to what it asserts. The root `test`
    // script runs packages one at a time so nothing else is writing the tree
    // while it runs (`packages/FIXME.md` F14, closed 20 August 2026). Restoring
    // parallelism there, or giving this package a test that writes files, puts
    // that failure mode back.

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
