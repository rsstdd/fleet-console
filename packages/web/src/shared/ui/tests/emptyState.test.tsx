import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "../emptyState";

/**
 * Contract test for docs/02_component-specs/06_EMPTY_STATE.md §4, §9, §10 and
 * §11. Two rules carry weight beyond markup: the title is a real h2 so the state
 * appears in the document outline (Principle 6), and a terminal error renders no
 * action while a recoverable one does (Principle 5) — the difference between
 * offering a retry and pretending one exists.
 */
function root(): HTMLElement {
  const element = document.querySelector<HTMLElement>("div.empty-state");
  if (element === null) throw new Error("empty-state root not rendered");
  return element;
}

describe("EmptyState", () => {
  it("renders the title as a real h2 carrying the title class", () => {
    render(<EmptyState title="No robots match these filters" />);

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("No robots match these filters");
    expect(heading.tagName).toBe("H2");
    expect(heading).toHaveClass("empty-state__title");
  });

  it("omits the description and action containers when not supplied", () => {
    render(<EmptyState title="No robots match these filters" />);

    expect(root().querySelector(".empty-state__description")).toBeNull();
    expect(root().querySelector(".empty-state__action")).toBeNull();
  });

  it("renders the description as a paragraph after the heading in DOM order", () => {
    render(
      <EmptyState
        title="No robots match these filters"
        description="Clear filters or change site."
      />,
    );

    const description = screen.getByText("Clear filters or change site.");
    expect(description.tagName).toBe("P");
    expect(description).toHaveClass("empty-state__description");
    // §9: the description follows the heading, so no aria-describedby is needed.
    expect(description).not.toHaveAttribute("id");
    expect(screen.getByRole("heading", { level: 2 }).compareDocumentPosition(description)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("slots a recoverable error's retry control, and renders none for a terminal error", () => {
    const { unmount } = render(
      <EmptyState
        title="Could not load the fleet"
        description="The console lost the stream. The last known table is still below."
        action={<button type="button">Retry</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    unmount();

    render(<EmptyState title="This robot is not in the fleet manifest" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("appends a caller class without displacing its own", () => {
    render(<EmptyState title="No robots" className="u-mt-3" />);

    expect(root().className).toBe("empty-state u-mt-3");
  });

  it("does not move focus on render, so a filter keystroke cannot steal it", () => {
    render(
      <EmptyState
        title="No robots match these filters"
        action={<button type="button">Clear filters</button>}
      />,
    );

    expect(document.activeElement).toBe(document.body);
  });
});
