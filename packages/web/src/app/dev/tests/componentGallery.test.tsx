import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ComponentGallery } from "../componentGallery";

describe("ComponentGallery", () => {
  it("documents every shared UI component as a named section", () => {
    render(<ComponentGallery />);

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
    render(<ComponentGallery />);

    const propsTable = screen.getByRole("table", { name: "Shared UI public props" });
    for (const prop of [
      "lastEventAt?",
      "as?",
      "action?",
      "receivedAt?",
      "disabled?",
      "children",
      "tone?",
      "current",
      "className?",
    ]) {
      expect(
        within(propsTable).getAllByText(new RegExp(prop.replace("?", "\\?"))).length,
      ).toBeGreaterThan(0);
    }
  });

  it("shows both StatusChip sizes and current/last-known states", () => {
    render(<ComponentGallery />);

    expect(screen.getByText("Medium", { selector: ".status" })).toBeInTheDocument();
    expect(screen.getByText("Small", { selector: ".status" })).toHaveClass("status--small");
    expect(screen.getAllByText("Busy (last known)")[0]).toHaveClass("status--last-known");
  });

  it("shows never-observed and receipt-time FreshnessLabel examples", () => {
    render(<ComponentGallery />);

    const neverObserved = screen.getByTestId("freshness-never-observed");
    expect(neverObserved).toHaveTextContent("Unknown");
    expect(neverObserved.querySelector(".freshness__asOf")).toBeNull();
    expect(screen.getByTestId("freshness-received-at")).toHaveTextContent("recv:");
  });

  it("exercises every ConnectionBanner state and retry behavior", async () => {
    const user = userEvent.setup();
    render(<ComponentGallery />);

    const section = screen.getByTestId("connection-banner-gallery");
    expect(within(section).getByRole("status")).toHaveAttribute("data-connected", "true");

    await user.click(within(section).getByRole("button", { name: "Reconnecting" }));
    expect(within(section).getByRole("status")).toHaveTextContent("attempt 1");

    await user.click(within(section).getByRole("button", { name: "Retry now" }));
    expect(within(section).getByRole("status")).toHaveTextContent("attempt 2");

    await user.click(within(section).getByRole("button", { name: "Disconnected" }));
    expect(within(section).getByRole("status")).toHaveTextContent("showing last known state");
  });

  it("shows every supported DataPlate element", () => {
    render(<ComponentGallery />);

    expect(document.querySelector(".gallery-data-plate-div")?.tagName).toBe("DIV");
    expect(document.querySelector(".gallery-data-plate-footer")?.tagName).toBe("FOOTER");
    expect(document.querySelector(".gallery-data-plate-figcaption")?.tagName).toBe("FIGCAPTION");
  });
});
