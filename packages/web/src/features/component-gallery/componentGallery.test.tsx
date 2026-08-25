import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createTheme } from "@mui/material/styles";

import { TENANT_THEME_PREVIEWS } from "@/config/tenant";
import type { TenantTheme } from "@/config/tenantTheme";
import { ComponentGallery } from "./componentGallery";

const buildTestTheme = (mode: TenantTheme) => createTheme({ palette: { mode } });

function renderGallery(): void {
  render(<ComponentGallery buildTheme={buildTestTheme} />);
}

describe("ComponentGallery", () => {
  it("documents every shared UI component as a named section", () => {
    renderGallery();

    for (const name of [
      "StatusChip",
      "FreshnessLabel",
      "Stat",
      "PersonaToggle",
      "ConnectionBanner",
      "EmptyState",
      "DataPlate",
      "SectionLabel",
    ]) {
      expect(
        screen.getByRole("heading", { name: new RegExp(`^${name}\\b`, "i") }),
      ).toBeInTheDocument();
    }
  });

  it("lists every component's complete public prop names", () => {
    renderGallery();

    const propsTable = screen.getByRole("table", { name: "Shared UI public props" });
    for (const prop of [
      "lastEventAt?",
      "terminalCause?",
      "as?",
      "action?",
      "receivedAt?",
      "isDisabled?",
      "children",
      "tone?",
      "isCurrent",
      "className?",
    ]) {
      expect(
        within(propsTable).getAllByText(new RegExp(prop.replace("?", "\\?"))).length,
      ).toBeGreaterThan(0);
    }
  });

  it("shows both StatusChip sizes and current/last-known states", () => {
    renderGallery();

    const sizes = screen.getByRole("region", { name: "Sizes" });
    const currency = screen.getByRole("region", { name: "Current vs. last known" });
    expect(within(sizes).getByText("Medium")).toBeVisible();
    expect(within(sizes).getByText("Small")).toBeVisible();
    expect(within(currency).getByText("Busy (last known)")).toBeVisible();
  });

  it("shows never-observed and receipt-time FreshnessLabel examples", () => {
    renderGallery();

    const neverObserved = screen.getByRole("region", { name: "Never observed example" });
    const receiptTime = screen.getByRole("region", { name: "Receipt time example" });
    expect(neverObserved).toHaveTextContent(/^Unknown$/);
    expect(receiptTime).toHaveTextContent("recv:");
  });

  it("exercises every ConnectionBanner state and retry behavior", async () => {
    const user = userEvent.setup();
    renderGallery();

    const section = screen.getByRole("region", {
      name: "ConnectionBanner states and retry",
    });
    expect(within(section).getByRole("status")).toHaveAttribute("data-connected", "true");

    await user.click(within(section).getByRole("button", { name: "Reconnecting" }));
    expect(within(section).getByRole("status")).toHaveTextContent("attempt 1");

    await user.click(within(section).getByRole("button", { name: "Retry now" }));
    expect(within(section).getByRole("status")).toHaveTextContent("attempt 2");

    await user.click(within(section).getByRole("button", { name: "Disconnected" }));
    expect(within(section).getByRole("status")).toHaveTextContent("showing last known state");
  });

  it("demonstrates every terminal connection cause interactively", async () => {
    const user = userEvent.setup();
    renderGallery();

    const section = screen.getByRole("region", {
      name: "ConnectionBanner states and retry",
    });
    await user.click(within(section).getByRole("button", { name: "Disconnected" }));
    await user.click(within(section).getByRole("button", { name: "Handshake exhausted" }));
    expect(within(section).getByRole("status")).toHaveTextContent(
      "Unable to connect to stream after 3 attempts",
    );

    await user.click(within(section).getByRole("button", { name: "Session mismatch" }));
    expect(within(section).getByRole("status")).toHaveTextContent("Stream integrity error");

    await user.click(within(section).getByRole("button", { name: "Contract error" }));
    expect(within(section).getByRole("status")).toHaveTextContent(
      "Stream disconnected · showing last known state",
    );
  });

  it("switches its nested theme without changing the document tenant theme", async () => {
    const user = userEvent.setup();
    document.documentElement.setAttribute("data-theme", "dark");
    renderGallery();

    for (const { label } of TENANT_THEME_PREVIEWS) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }

    await user.click(screen.getByRole("button", { name: "Tenant B · light" }));

    expect(screen.getByRole("article", { name: "Component demo" })).toHaveAttribute(
      "data-theme",
      "light",
    );
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("shows every supported DataPlate element", () => {
    renderGallery();

    expect(screen.getByText(/^Default div/).tagName).toBe("DIV");
    expect(screen.getByText(/^Footer/).tagName).toBe("FOOTER");
    expect(screen.getByText(/^Figcaption/).tagName).toBe("FIGCAPTION");
  });
});
