import { expect, test } from "@playwright/test";

test.describe("fleet console against the real stack", () => {
  test("shows a live fleet normalized from three vendors", async ({ page }) => {
    await page.goto("/");

    const table = page.getByRole("table", { name: "Fleet" });
    await expect(table.getByRole("row")).toHaveCount(25, { timeout: 20_000 });

    // All three vendors reach one table without a vendor branch in the UI.
    for (const vendor of ["A", "B", "C"]) {
      await expect(table.getByRole("cell", { name: vendor, exact: true }).first()).toBeVisible();
    }
    await expect(table.getByText("LIVE").first()).toBeVisible();
  });

  test("filters the fleet down to one site", async ({ page }) => {
    await page.goto("/");
    const table = page.getByRole("table", { name: "Fleet" });
    await expect(table.getByRole("row")).toHaveCount(25, { timeout: 20_000 });

    await page.getByRole("combobox", { name: "Site" }).click();
    await page.getByRole("option", { name: "North site" }).click();

    await expect(page.getByText(/Showing \d+ of 24 robots/)).toBeVisible();
    await expect(table.getByRole("row")).not.toHaveCount(25);
  });

  test("renders only the capabilities a robot declares", async ({ page }) => {
    await page.goto("/");
    // R-002 is vendor B: it declares a dock and nothing else.
    await page.getByRole("link", { name: "R-002" }).click();

    await expect(page.getByRole("heading", { name: "R-002" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dock" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Water" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Lidar" })).toHaveCount(0);
  });

  test("keeps diagnostics behind a toggle and calls vendor B continuity unevaluated", async ({
    page,
  }) => {
    await page.goto("/robots/R-002");
    await expect(page.getByRole("heading", { name: "R-002" })).toBeVisible();

    await expect(page.getByText("vendor-b")).toHaveCount(0);
    await page.getByLabel("Technician diagnostics").check();

    await expect(page.getByText("vendor-b")).toBeVisible();
    // Vendor B sends no sequence, so gaps must read as unevaluated, never as 0.
    await expect(page.getByText("Not evaluated").first()).toBeVisible();
  });
});
