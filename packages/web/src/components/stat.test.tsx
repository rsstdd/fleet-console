import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Stat } from "./stat";

function getStat(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".stat");
  if (element === null) {
    throw new Error("Expected a stat");
  }
  return element;
}

describe("Stat", () => {
  it("renders value then label in visual and DOM order without redundant ARIA", () => {
    render(<Stat label="Live" value={44} />);

    expect(getStat()).not.toHaveAttribute("aria-label");
    expect(getStat().children[0]).toHaveClass("stat__value", "mono");
    expect(getStat().children[0]).toHaveTextContent("44");
    expect(getStat().children[1]).toHaveClass("stat__label");
    expect(getStat().children[1]).toHaveTextContent("Live");
  });

  it("renders a non-empty hint after the label", () => {
    render(<Stat label="Live" value="44" hint="of 50" />);

    expect(getStat().children[2]).toHaveClass("stat__hint");
    expect(getStat().children[2]).toHaveTextContent("of 50");
  });

  it("omits an empty hint", () => {
    render(<Stat label="Unknown" value={0} hint="" />);

    expect(getStat().querySelector(".stat__hint")).toBeNull();
  });

  it.each([
    ["warning", "stat--warning"],
    ["critical", "stat--critical"],
  ] as const)("maps the %s feedback tone to its class", (tone, toneClass) => {
    render(<Stat label="Attention" value={2} tone={tone} />);

    expect(getStat()).toHaveClass("stat", toneClass);
  });

  it("adds no tone class by default and appends the caller class last", () => {
    render(<Stat label="Live" value={44} className="summary-cell" />);

    expect(getStat().className).toBe("stat summary-cell");
  });
});
