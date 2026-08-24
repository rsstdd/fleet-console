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
  // A test here starts a real server, a real simulator and a preview build, then waits
  // on production clocks rather than test knobs: `config/freshness.json` degrades a
  // silent robot at 2s and 10s, and ADR 31's recovery backs off under a 30-second
  // ceiling, with the restart scenario spending most of one. 120s covers the longest of
  // those chains plus a cold stack start. A test needing more than this is waiting on
  // something it should be asserting.
  timeout: 120_000,
  // Per assertion, an order of magnitude under the test budget. A delta reaches the DOM
  // in milliseconds, so anything still failing at 10s is a defect rather than a loaded
  // CI box — which is why the scenarios that genuinely wait on a production clock pass
  // their own longer timeout at the call site instead of raising this one.
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
    {
      // The tenant-B production bundle, built by the spec's own beforeAll and
      // served from its own directory (ADR 17). Chromium-only: the claim is
      // about the profile, not engine compatibility.
      name: "tenant-b-chromium",
      testMatch: /tenantB\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        serverPort: 8396,
        vitePort: 5396,
        viteOutDir: "dist-tenant-b",
      },
    },
  ],
});
