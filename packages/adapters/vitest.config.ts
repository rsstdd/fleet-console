import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Adapters are pure functions over decoded payloads; no DOM, no wall clock.
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Enforcement fixtures are deliberate violations, not shipped behaviour;
      // counting them as uncovered source would distort the reported number.
      exclude: ["src/**/*.test.ts", "src/**/__fixtures__/**", "src/**/__enforcement__/**"],
      reporter: ["text", "text-summary"],
      // No `thresholds` key, on purpose (ADR 22). This package once proposed
      // failing under 90% for `src/vendors/**`, and its own TODO recorded that
      // the number had no derivation. Two things were wrong with it: an
      // undefended threshold is raised the first time it fails, and
      // `src/vendors/**` holds no TypeScript at all today, so the gate would
      // have reported a pass while measuring nothing — the ADR 7 failure, where
      // silence is indistinguishable from a passing check.
      //
      // The number is printed by CI on every run instead. Add a threshold here
      // only alongside a derivation, in ADR 22, of what it is protecting.
    },
  },
});
