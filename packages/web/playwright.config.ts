import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

import type { StackOptions } from "./e2e/fixtures.ts";

/**
 * Playwright configuration for the console's browser evidence (ADR 32).
 *
 * One worker and no parallelism, deliberately: every test drives one real stack whose
 * process state it mutates — stopping the simulator, killing and restarting the server —
 * and parallel tests sharing ports would turn real evidence into flake. The smoke
 * projects cover the three engines; the scale project is Chromium-only because its
 * output is a reported measurement, not a compatibility claim (see `e2e/scale.spec.ts`).
 *
 * CI gets one retry because a browser suite against real processes has irreducible
 * environmental noise; locally a failure should stay loud. Traces, video, and
 * screenshots are kept only on failure — they are diagnostics, not baselines, and no
 * visual snapshot is ever committed.
 */
export default defineConfig<StackOptions>({
  testDir: "./e2e",
  // One production build for the whole run; the stacks serve it via `vite preview`.
  globalSetup: "./e2e/globalSetup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  retries: process.env.CI === undefined ? 0 : 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "smoke-chromium",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "smoke-firefox",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "smoke-webkit",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      // Distinct ports so even an accidental overlap with a smoke run cannot collide.
      name: "scale-chromium",
      testMatch: /scale\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], serverPort: 8395, vitePort: 5395 },
    },
  ],
});
