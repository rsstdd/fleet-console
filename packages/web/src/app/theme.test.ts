import { describe, expect, it } from "vitest";

import { applyTenantTheme } from "./theme";

describe("document theme bridge", () => {
  it("selects the tenant CSS profile on the document root", () => {
    applyTenantTheme("light");

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
