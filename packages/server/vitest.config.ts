import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
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
