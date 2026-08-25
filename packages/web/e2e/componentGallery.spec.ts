import { expect, test } from "./fixtures.ts";

test.describe("development component gallery", () => {
  test("reflows non-table content without widening a narrow document", async ({ page, stack }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(new URL("/dev/ui", stack.consoleUrl).toString());

    await expect(page.getByRole("heading", { name: "Component demo" })).toBeVisible();
    await expect(page.getByRole("region", { name: "FreshnessLabel states" })).toBeVisible();

    const reflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    expect(reflow.documentWidth).toBeLessThanOrEqual(reflow.viewportWidth);
    await expect(page.getByRole("article", { name: "Component demo" })).toBeVisible();
  });

  test("renders status size and currency differences through computed styles", async ({
    page,
    stack,
  }) => {
    await page.goto(new URL("/dev/ui", stack.consoleUrl).toString());

    const sizes = page.getByRole("region", { name: "Sizes" });
    const currency = page.getByRole("region", { name: "Current vs. last known" });
    const medium = sizes.getByText("Medium", { exact: true });
    const small = sizes.getByText("Small", { exact: true });
    const current = currency.getByText("Busy", { exact: true });
    const lastKnown = currency.getByText("Busy (last known)", { exact: true });

    await expect(medium).not.toHaveCSS("font-size", await small.evaluate(getFontSize));
    await expect(current).not.toHaveCSS(
      "background-color",
      await lastKnown.evaluate(getBackgroundColor),
    );
  });
});

function getFontSize(element: HTMLElement): string {
  return getComputedStyle(element).fontSize;
}

function getBackgroundColor(element: HTMLElement): string {
  return getComputedStyle(element).backgroundColor;
}
