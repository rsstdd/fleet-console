import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // `src/__boundary-violation__/enforcement.test.ts` lints files on disk, so its
    // input is the working tree rather than a fixture value — the one suite here
    // that can fail for reasons unrelated to what it asserts. The root `test`
    // script runs packages one at a time so nothing else is writing the tree
    // while it runs (`packages/FIXME.md` F14, closed 20 August 2026). Restoring
    // parallelism there, or giving this package a test that writes files, puts
    // that failure mode back.

    environment: "node",
    include: ["src/**/*.test.ts"],
    // Freshness transitions, late-tick detection, coalescing and shutdown are all
    // timing behaviour. They are tested with fake timers and injected clocks, never
    // with wall-clock sleeps (AGENTS.md § Tests).
    fakeTimers: { toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"] },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__fixtures__/**"],
    },
  },
});
