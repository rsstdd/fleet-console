import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

import { devServerTarget } from "./src/config/devServerTarget.ts";
import { resolveTenantId } from "./src/config/tenantSelection.ts";

// One deployment tenant per build, checked here so an unknown VITE_TENANT fails
// the build rather than the browser (ADR 17). Without this call the bundle still
// compiles and the console white-screens on load, which is the runtime failure
// mode a build-time decision was chosen to avoid.
resolveTenantId(process.env.VITE_TENANT);

// The console talks to its own origin and Vite forwards to the server, so nothing in
// development is cross-origin and no CORS policy is exercised there (ADR 21). The two keys
// are the tenant profile's `endpoints`; changing one without the other leaves the console
// requesting a path this proxy does not forward.
const DEV_PROXY_TARGET = devServerTarget(process.env);

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: DEV_PROXY_TARGET },
      // `ws: true` is what upgrades the delta stream rather than proxying the
      // handshake as an ordinary GET and leaving the socket to fail on open.
      "/ws": { target: DEV_PROXY_TARGET, ws: true },
    },
  },
  preview: {
    // The same forwarding for `vite preview`, which serves the production build to the
    // browser test harness (`e2e/stack.ts`). The dev server renders every delta through
    // React's development build, which is measured to saturate a core at 10 Hz × 50 rows
    // and starves the browser evidence; preview serves what users actually get (ADR 32).
    proxy: {
      "/api": { target: DEV_PROXY_TARGET },
      "/ws": { target: DEV_PROXY_TARGET, ws: true },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // `src/features/fleet/__boundary-violation__/violation.test.ts` lints files on disk, so its
    // input is the working tree rather than a fixture value — the one suite here
    // that can fail for reasons unrelated to what it asserts. The root `test`
    // script runs packages one at a time so nothing else is writing the tree
    // while it runs (`packages/FIXME.md` F14, closed 20 August 2026). Restoring
    // parallelism there, or giving this package a test that writes files, puts
    // that failure mode back.

    // Lint fixtures under __boundary-violation__ are named *.fixture.test.ts so
    // ESLint's `**/*.test.*` override classifies them the way the real file they
    // stand in for is classified. They are inputs to a test, not tests, so
    // vitest must not collect them — `violation.test.ts`, the enforcement suite
    // in the same directory, still runs.
    // e2e/ is Playwright's, not vitest's; its specs import @playwright/test and run
    // against real processes (ADR 32).
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**",
      "**/__boundary-violation__/**/*.fixture.test.ts",
    ],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
