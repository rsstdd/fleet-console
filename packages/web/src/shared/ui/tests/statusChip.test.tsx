import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusChip, type StatusVariant } from "./statusChip";

/**
 * Contract test for the required output in
 * docs/02_component-specs/01_STATUS_CHIP.md §4, §9 and §10. The chip carries a
 * safety signal — whether a status is current — so the class composition that
 * drives the last-known treatment is asserted directly.
 */
const ALL_VARIANTS: readonly StatusVariant[] = [
  "neutral",
  "active",
  "charging",
  "degraded",
  "fault",
  "unknown",
];

function chip(): HTMLElement {
  return screen.getByText(/./, { selector: "span.status" });
}

describe("StatusChip", () => {
  it("renders the label as visible text for every variant", () => {
    for (const variant of ALL_VARIANTS) {
      const { unmount } = render(<StatusChip variant={variant} label={variant} current />);
      expect(chip()).toHaveClass("status", `status--${variant}`);
      expect(chip()).toHaveTextContent(variant);
      unmount();
    }
  });

  it("adds the last-known class when the status is not current", () => {
    render(<StatusChip variant="active" label="Busy (last known)" current={false} />);

    expect(chip()).toHaveClass("status--last-known");
    // The qualification is the caller's, never appended here (§5).
    expect(chip()).toHaveTextContent("Busy (last known)");
  });

  it("omits the last-known class when the status is current", () => {
    render(<StatusChip variant="active" label="Busy" current />);

    expect(chip()).not.toHaveClass("status--last-known");
  });

  it("expresses size as a class, not an inline style (Principle 8)", () => {
    const { rerender } = render(<StatusChip variant="neutral" label="Idle" current size="small" />);
    expect(chip()).toHaveClass("status--small");
    expect(chip().getAttribute("style")).toBeNull();

    rerender(<StatusChip variant="neutral" label="Idle" current />);
    expect(chip()).not.toHaveClass("status--small");
  });

  it("appends the caller's className last", () => {
    render(<StatusChip variant="fault" label="Fault" current className="extra" />);

    expect(chip().className).toBe("status status--fault extra");
  });

  it("renders nothing rather than an unlabelled dot (§10)", () => {
    const { container } = render(<StatusChip variant="unknown" label="" current />);

    expect(container).toBeEmptyDOMElement();
  });

  it("carries no role, no aria-label and no dot element (§9)", () => {
    render(<StatusChip variant="charging" label="Charging" current />);

    expect(chip()).not.toHaveAttribute("role");
    expect(chip()).not.toHaveAttribute("aria-label");
    // The dot is .status::before, so the chip has no element children at all.
    expect(chip().children).toHaveLength(0);
  });
});
