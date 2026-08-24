import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";

/**
 * The tenant-B production build, driven for real in Chromium (ADR 17, ADR 32).
 *
 * White-label deployment is a build-time claim — `VITE_TENANT` is replaced by a
 * constant in the shipped bundle — so nothing short of building tenant B and
 * loading that bundle in a browser can verify it. This suite builds
 * `dist-tenant-b` once, and its Playwright project points the preview stack at
 * that directory (`viteOutDir` in `playwright.config.ts`).
 *
 * Chromium-only, like the scale project: the claim is about the tenant
 * profile's effect on one build, not about engine compatibility, which the
 * smoke projects already cover across all three engines.
 */

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The light palette's page background from `tenantTheme.ts`, as CSS resolves it. */
const LIGHT_BG_RGB = "rgb(244, 242, 236)";

test.beforeAll(async () => {
  // A fresh tenant-B bundle for this run, mirroring globalSetup's reasoning:
  // a stale directory would make every green run a lie about today's code.
  await new Promise<void>((resolve, reject) => {
    const build = spawn(
      path.join(WEB_DIR, "node_modules", ".bin", "vite"),
      ["build", "--outDir", "dist-tenant-b"],
      {
        cwd: WEB_DIR,
        env: { ...process.env, VITE_TENANT: "tenant-b" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const output: string[] = [];
    build.stdout.on("data", (chunk: unknown) => output.push(String(chunk)));
    build.stderr.on("data", (chunk: unknown) => output.push(String(chunk)));
    build.once("error", reject);
    build.once("exit", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`tenant-b vite build exited with ${String(code)}:\n${output.join("")}`));
    });
  });
});

/** Loads the tenant-B console and waits for the live fleet. */
async function openFleet(page: Page, consoleUrl: string): Promise<void> {
  await page.goto(consoleUrl);
  await expect(page.getByRole("heading", { name: "Fleet overview" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^R-\d{3}$/ })).toHaveCount(50, { timeout: 15_000 });
}

test.describe("tenant-B production build", () => {
  test("ships the tenant's wordmark and light theme, from configuration alone", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);

    // The brand is the profile's, with no tenant conditional in any component
    // (Principle 13): wordmark, then the light palette painted for real.
    await expect(page.getByText("Northwind Robotics")).toBeVisible();
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(background).toBe(LIGHT_BG_RGB);
  });

  test("disables the lidar panel by flag while the same robot still declares it", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);

    // R-001 is vendor A and declares dock + lidarHealth; tenant B's flag turns
    // the lidar panel off without touching the declaration (ADR 17).
    await page.getByRole("link", { name: "R-001" }).click();
    await expect(page.getByRole("heading", { name: "Robot R-001" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Capabilities" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dock", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Lidar", exact: true })).toHaveCount(0);
  });

  test("stays usable at a narrow viewport", async ({ page, stack }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFleet(page, stack.consoleUrl);

    // The filter stack collapses to a column and the table scrolls within the
    // page rather than forcing the whole document wide.
    await expect(page.getByRole("combobox", { name: "Site" })).toBeVisible();
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(390);

    // The fleet-width assertion cannot catch a detail route that overflows after
    // navigation, so the same narrow viewport has to exercise that second layout too.
    await page.getByRole("link", { name: "R-001" }).click();
    await expect(page.getByRole("heading", { name: "Robot R-001" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Summary" })).toBeVisible();
  });
});
