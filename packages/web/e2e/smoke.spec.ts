import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures.ts";

/**
 * The browser smoke suite: the claims that only a real engine can make (ADR 32).
 *
 * Everything here runs against the real stack — actual server, actual simulator, actual
 * Vite proxy — in Chromium, Firefox, and WebKit. Assertions use accessible roles and
 * names, because the accessibility tree is the surface the specs are written against
 * (Principle 6), and every wait is a bounded Playwright poll rather than a sleep.
 *
 * The timings leaned on here are production configuration, not test knobs:
 * `config/freshness.json` degrades a silent robot to stale at 2 s and unreachable at
 * 10 s, and ADR 31's recovery schedule starts immediately and backs off under a
 * 30-second ceiling. The generous `toPass`/`expect` timeouts bound those real clocks.
 */

/** The fleet table's data rows, addressed by the row-activation links the spec requires. */
function getRobotLinks(page: Page): Locator {
  return page.getByRole("link", { name: /^R-\d{3}$/ });
}

function getRobotRow(page: Page, robotId: string): Locator {
  return page.getByRole("row", { name: new RegExp(`^${robotId}\\b`) });
}

/** Waits for all 50 manifest rows so later assertions cannot pass during partial startup. */
async function openFleet(page: Page, consoleUrl: string): Promise<void> {
  await page.goto(consoleUrl);
  await expect(page.getByRole("heading", { name: "Fleet overview" })).toBeVisible();
  await expect(getRobotLinks(page)).toHaveCount(50, { timeout: 15_000 });
}

test.describe("fleet console against the real stack", () => {
  test("renders the live 50-robot fleet and streams deltas into rows", async ({
    page,
    stack,
  }, testInfo) => {
    await openFleet(page, stack.consoleUrl);

    // The stream, observed: the row's "last seen" cell advances with each emission,
    // which no snapshot alone can explain.
    const lastSeen = getRobotRow(page, "R-001").getByRole("cell").last();
    const before = await lastSeen.textContent();
    await expect(lastSeen).not.toHaveText(before ?? "", { timeout: 10_000 });

    // The connected banner is present but empty; the header label carries the state.
    await expect(page.getByText("Stream connected")).toBeVisible();
    await expect(page.getByRole("status")).toBeEmpty();

    // Portfolio evidence, per plan: an artifact, never a regression baseline.
    await testInfo.attach(`fleet-${testInfo.project.name}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
  });

  test("normalizes all three vendors into one table with distinct capability panels", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);

    // One table, three dialects: the manifest's first three robots are A, B, and C.
    for (const [robotId, vendor] of [
      ["R-001", "A"],
      ["R-002", "B"],
      ["R-003", "C"],
    ] as const) {
      await expect(getRobotRow(page, robotId)).toContainText(vendor);
    }

    // Each vendor's declared capabilities, and only those: absence is the interface.
    const panelsByRobot = [
      { robotId: "R-001", present: ["Dock", "Lidar"], absent: ["Water level"] },
      { robotId: "R-002", present: ["Dock"], absent: ["Lidar", "Water level"] },
      { robotId: "R-003", present: ["Dock", "Water level"], absent: ["Lidar"] },
    ];
    for (const { robotId, present, absent } of panelsByRobot) {
      await getRobotLinks(page).filter({ hasText: robotId }).click();
      await expect(page.getByRole("heading", { name: robotId })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Capabilities" })).toBeVisible();
      for (const title of present) {
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      }
      for (const title of absent) {
        await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
      }
      await page.getByRole("link", { name: "← Fleet" }).click();
      await expect(getRobotLinks(page)).toHaveCount(50, { timeout: 15_000 });
    }
  });

  test("is keyboard operable end to end, and streaming updates never steal focus", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);

    // The skip link is the first tab stop and lands focus on main content.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("main")).toBeFocused();

    // Filter from the keyboard; the table narrows without touching a pointer.
    const search = page.getByRole("textbox", { name: "Search" });
    await search.click();
    await search.fill("R-002");
    await expect(getRobotLinks(page)).toHaveCount(1);

    // Deltas keep streaming while the operator types; focus must not move (spec § 9).
    await expect(search).toBeFocused();
    const lastSeen = getRobotRow(page, "R-002").getByRole("cell").last();
    const before = await lastSeen.textContent();
    await expect(lastSeen).not.toHaveText(before ?? "", { timeout: 10_000 });
    await expect(search).toBeFocused();

    // Row activation and detail navigation, still from the keyboard.
    await page.keyboard.press("Tab");
    await expect(getRobotLinks(page).first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "R-002" })).toBeVisible();
  });

  test("degrades freshness when a robot goes silent, while the stream stays connected", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);
    await expect(getRobotRow(page, "R-001").getByText("Live")).toBeVisible({ timeout: 10_000 });

    await stack.stopSimulator();

    // Robot absence, not console blindness: the sweep runs on `receivedAt` alone, so
    // rows degrade Live → Stale → Unreachable while the banner still says connected.
    await expect(getRobotRow(page, "R-001").getByText("Stale")).toBeVisible({ timeout: 10_000 });
    await expect(getRobotRow(page, "R-001").getByText("Unreachable")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Stream connected")).toBeVisible();
    await expect(page.getByRole("status")).toBeEmpty();
  });

  test("retains rows and suppresses freshness labels when the server is lost", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);
    const fleetTable = page.getByRole("table", { name: "Fleet" });
    await expect(fleetTable.getByText("Live").first()).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Fleet reporting status", exact: true }),
    ).toBeVisible();

    await stack.stopServer();

    // Console blindness, honestly reported: last-known rows stay, per-robot freshness
    // disappears, and the banner carries the connection-level truth (ADR 3).
    await expect(page.getByText("Stream reconnecting")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("status")).toContainText("Reconnecting to stream");
    await expect(getRobotLinks(page)).toHaveCount(50);
    await expect(fleetTable.getByText("Live")).toHaveCount(0);
    await expect(fleetTable.getByText("Unreachable")).toHaveCount(0);

    // The summary keeps its four counts but withdraws the currency claim: one shared
    // heading qualifies the whole group as last known (ADR 23, fleet spec § 2).
    const summary = page.getByRole("region", { name: "Fleet reporting status · last known" });
    await expect(summary.getByRole("heading")).toHaveText("Fleet reporting status · last known");
    for (const label of ["Live", "Stale", "Unreachable", "Unknown"]) {
      await expect(summary.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("charts battery history from retained readings, and keeps it when the robot goes silent", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);
    // Let the simulator produce several readings so the window holds a real trend.
    const lastSeen = getRobotRow(page, "R-001").getByRole("cell").last();
    const before = await lastSeen.textContent();
    await expect(lastSeen).not.toHaveText(before ?? "", { timeout: 10_000 });

    await getRobotLinks(page).filter({ hasText: "R-001" }).click();
    await expect(page.getByRole("heading", { name: "Battery history" })).toBeVisible();

    // The real endpoint, decimated and decoded: an accessible chart plus its textual
    // summary, extremes and sample count included (ADR 33).
    const section = page.getByRole("region", { name: "Battery history" });
    await expect(section.getByRole("img", { name: /battery history for R-001/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(section.getByText(/minimum .*maximum .*latest /)).toBeVisible();
    await expect(section.getByText(/samples retained/)).toBeVisible();
    await expect(section.getByText(/server receipt times/i)).toBeVisible();

    await stack.stopSimulator();

    // Freshness is live state and degrades on the streaming fleet rows; the chart is
    // explicitly historical, so a fresh visit still serves the retained window after
    // the robot goes silent — the two facts move independently (Principle 4, ADR 33).
    await page.getByRole("link", { name: "← Fleet" }).click();
    await expect(getRobotRow(page, "R-001").getByText("Stale")).toBeVisible({ timeout: 10_000 });

    await getRobotLinks(page).filter({ hasText: "R-001" }).click();
    await expect(section.getByRole("img", { name: /battery history for R-001/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(section.getByText(/samples retained/)).toBeVisible();
  });

  test("updates robot detail live from stream deltas, without navigation or reload", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);
    await getRobotLinks(page).filter({ hasText: "R-001" }).click();
    await expect(page.getByRole("heading", { name: "Robot R-001" })).toBeVisible();

    // The one fetch happened; from here every change is a delta reconciled over
    // it. "Last seen" is the field every emission moves.
    const summary = page.getByRole("region", { name: "Summary" });
    const lastSeen = summary.getByText(/^\d{2}:\d{2}:\d{2}Z$/).last();
    const before = await lastSeen.textContent();
    await expect(lastSeen).not.toHaveText(before ?? "", { timeout: 10_000 });

    // Still the same page — live by overlay, not by reload or re-navigation.
    await expect(page).toHaveURL(/\/robots\/R-001$/);
    await expect(page.getByRole("heading", { name: "Robot R-001" })).toBeVisible();
  });

  test("labels sites from the manifest directory and filters by them", async ({ page, stack }) => {
    await openFleet(page, stack.consoleUrl);

    // The labels are configuration, decoded off the snapshot — never a fixture
    // table in the console (ADR 34).
    await page.getByRole("combobox", { name: "Site" }).click();
    for (const label of ["All sites", "North site", "South site", "East site"]) {
      await expect(page.getByRole("option", { name: label })).toBeVisible();
    }
    await page.getByRole("option", { name: "North site" }).click();

    // The table narrows to the north rows, and every visible Site cell carries
    // the directory's label rather than the raw SITE-NORTH identifier.
    await expect(getRobotLinks(page)).not.toHaveCount(50);
    const rows = page.getByRole("table", { name: "Fleet" }).getByRole("row");
    await expect(rows.nth(1).getByText("North site")).toBeVisible();
    await expect(page.getByRole("table", { name: "Fleet" }).getByText("South site")).toHaveCount(0);
  });

  test("shows a first-load failure with a working retry when the server is down from the start", async ({
    page,
    stack,
  }) => {
    // A console opened against a dead server: the initial probe exhausts its
    // three attempts and the fleet resource reports a recoverable failure with
    // nothing retained (Principle 5, ADR 31).
    await stack.stopServer();
    await page.goto(stack.consoleUrl);

    const failure = page.getByRole("alert").filter({ hasText: "could not be loaded" });
    await expect(failure).toBeVisible({ timeout: 20_000 });
    await expect(failure.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Fleet" })).toHaveCount(0);

    // The operator's retry, against a server that has come back, joins for real.
    await stack.startServer();
    await failure.getByRole("button", { name: "Retry" }).click();

    await expect(getRobotLinks(page)).toHaveCount(50, { timeout: 20_000 });
    await expect(page.getByText("Stream connected")).toBeVisible();
  });

  test("renders a malformed snapshot as a terminal contract failure, with no retry", async ({
    page,
    stack,
  }) => {
    // Controlled corruption at the one boundary: the real server answers, the
    // route hands the console a body missing its site directory. Malformed
    // snapshots are terminal — retrying returns the same bytes (ADR 20).
    await page.route("**/api/fleet", async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as Record<string, unknown>;
      delete body["sites"];
      await route.fulfill({ response, json: body });
    });
    await page.goto(stack.consoleUrl);

    const failure = page
      .getByRole("alert")
      .filter({ hasText: "did not match the canonical contract" });
    await expect(failure).toBeVisible({ timeout: 20_000 });
    // The decoder's own issue path and code, never a rejected value (ADR 20).
    await expect(failure.getByText(/sites/)).toBeVisible();
    await expect(failure.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect(page.getByText("Stream disconnected", { exact: true })).toBeVisible();
  });

  test("recovers automatically after a server restart, without Retry or reload", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);
    const fleetTable = page.getByRole("table", { name: "Fleet" });
    await expect(fleetTable.getByText("Live").first()).toBeVisible({ timeout: 10_000 });

    await stack.stopServer();
    await expect(page.getByText("Stream reconnecting")).toBeVisible({ timeout: 15_000 });

    // The restart ADR 31 exists for: new process, new session, flush counter back at
    // zero. The console must re-join by itself — no Retry click, no reload.
    await stack.startServer();

    await expect(page.getByText("Stream connected")).toBeVisible({ timeout: 45_000 });
    await expect(fleetTable.getByText("Live").first()).toBeVisible({ timeout: 15_000 });

    // A connected label alone could pass while a replacement socket delivers nothing;
    // advancing row content proves recovery restored the data path, not only its banner.
    const lastSeen = getRobotRow(page, "R-001").getByRole("cell").last();
    const before = await lastSeen.textContent();
    await expect(lastSeen).not.toHaveText(before ?? "", { timeout: 10_000 });
  });

  test("plots the selected site's robots on the map and activates through the side list", async ({
    page,
    stack,
  }) => {
    await openFleet(page, stack.consoleUrl);

    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Map" })
      .click();
    await expect(page.getByRole("heading", { level: 1, name: "Map" })).toBeVisible();

    // The canvas is one labelled image for the default (first directory) site,
    // named with the manifest label and the positioned accounting (ADR 34, ADR 35).
    const canvas = page.getByRole("img", {
      name: /^Map of North site: \d+ of \d+ robots positioned$/,
    });
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Live robots are drawn as markers; the count matches the accounting line.
    const accounting = page.getByText(/^\d+ of \d+ robots positioned$/);
    await expect(accounting).toBeVisible();
    const positioned = Number(/^(\d+) of/.exec((await accounting.textContent()) ?? "")?.[1]);
    expect(positioned).toBeGreaterThan(0);
    await expect(canvas.locator("circle")).toHaveCount(positioned);

    // The side list is the activation path: a robot link opens its detail page.
    const list = page.getByRole("region", { name: "Robots" });
    await list
      .getByRole("link", { name: /^R-\d{3}$/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /^Robot R-\d{3}$/ })).toBeVisible({
      timeout: 10_000,
    });
  });
});
