import { defineConfig } from "@playwright/test";

const SERVER_PORT = 8099;
const APP_PORT = 5199;

/** Runs against the real stack: simulator to server to console, with nothing mocked between. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${String(APP_PORT)}`, trace: "retain-on-failure" },
  webServer: [
    {
      command: "pnpm --filter @fleet/server start:stack",
      env: {
        FLEET_PORT: String(SERVER_PORT),
        FLEET_ALLOWED_ORIGINS: `http://127.0.0.1:${String(APP_PORT)}`,
      },
      url: `http://127.0.0.1:${String(SERVER_PORT)}/api/health`,
      reuseExistingServer: false,
      stdout: "ignore",
    },
    {
      command: `pnpm --filter web dev --port ${String(APP_PORT)} --strictPort`,
      env: { VITE_DEV_SERVER_TARGET: `http://127.0.0.1:${String(SERVER_PORT)}` },
      url: `http://127.0.0.1:${String(APP_PORT)}`,
      reuseExistingServer: false,
      stdout: "ignore",
    },
  ],
});
