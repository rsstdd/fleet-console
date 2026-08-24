import { describe, expect, it } from "vitest";

import { applyTenantTheme, buildMuiTheme } from "./theme";

describe("theme bridge", () => {
  it("maps every Typography variant used by the console to its authored token", () => {
    const theme = buildMuiTheme("dark");

    expect(theme.typography).toMatchObject({
      h1: { fontSize: "var(--text-h1)", lineHeight: "var(--leading-tight)" },
      h2: { fontSize: "var(--text-h2)", lineHeight: "var(--leading-snug)" },
      h3: { fontSize: "var(--text-h3)", lineHeight: "var(--leading-snug)" },
      body1: { fontSize: "var(--text-body)", lineHeight: "var(--leading-normal)" },
      body2: { fontSize: "var(--text-small)", lineHeight: "var(--leading-normal)" },
      caption: { fontSize: "var(--text-caption)", fontFamily: "var(--font-mono)" },
      overline: {
        fontSize: "var(--text-overline)",
        fontFamily: "var(--font-mono)",
        letterSpacing: "var(--tracking-overline)",
      },
    });
  });

  it("selects the tenant CSS profile on the document root", () => {
    applyTenantTheme("light");

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
  });
});
