import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionLabel } from "./sectionLabel";

/**
 * Contract test for docs/02_component-specs/03_SECTION_LABEL.md §4 and §9. The
 * accessibility rule is the load-bearing one: this component looks like a heading
 * and must not be one, because robot detail's sections are navigable by heading and
 * a label that claimed the role would leave the real outline empty (Principle 6).
 */
function getLabel(): HTMLElement {
  const element = screen.getByText(/./, { selector: "div.section-label" });
  return element;
}

describe("SectionLabel", () => {
  it("renders the index text in a div carrying the section-label class", () => {
    render(<SectionLabel>01 — Capabilities</SectionLabel>);

    expect(getLabel().tagName).toBe("DIV");
    expect(getLabel()).toHaveTextContent("01 — Capabilities");
    expect(getLabel().className).toBe("section-label");
  });

  it("appends a caller class without displacing its own", () => {
    render(<SectionLabel className="u-mt-3">02 — Diagnostics</SectionLabel>);

    expect(getLabel().className).toBe("section-label u-mt-3");
  });

  it("is not a heading, and does not claim the role by any other means", () => {
    render(<SectionLabel>03 — Raw payload</SectionLabel>);

    expect(screen.queryByRole("heading")).toBeNull();
    expect(getLabel()).not.toHaveAttribute("role");
    expect(getLabel()).not.toHaveAttribute("aria-label");
    expect(getLabel()).not.toHaveAttribute("aria-labelledby");
  });

  it("leaves the paired heading as the only entry in the document outline", () => {
    render(
      <section>
        <SectionLabel>01 — Capabilities</SectionLabel>
        <h2>Capabilities</h2>
      </section>,
    );

    const headings = screen.getAllByRole("heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Capabilities");
  });

  it("adds no elements of its own, so the tick stays out of the accessibility tree", () => {
    render(<SectionLabel>04 — Summary</SectionLabel>);

    expect(getLabel().children).toHaveLength(0);
  });
});
