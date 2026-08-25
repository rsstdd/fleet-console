import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { AppRouter } from "./appRouter";

/**
 * Proves the router is the application. Until 19 August 2026 `main.tsx` rendered
 * the component gallery and `appRouter.tsx` was an orphaned module that did not
 * compile, so nothing here was reachable at any URL. The app-shell spec now owns the
 * route contract this regression test protects.
 */
function renderAt(path: string): void {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>,
  );
}

describe("AppRouter", () => {
  it("renders the fleet page inside the shell at /", () => {
    renderAt("/");

    expect(screen.getByRole("heading", { name: /fleet overview/i })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("renders the map page inside the shell at /map", () => {
    renderAt("/map");

    expect(screen.getByRole("heading", { level: 1, name: "Map" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("renders the development component gallery inside the shell at /dev/ui", () => {
    renderAt("/dev/ui");

    const gallery = screen.getByRole("article", { name: "Component demo" });
    expect(gallery).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Component demo" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(gallery);
  });

  it("puts the skip link before the content it skips", () => {
    renderAt("/");

    const skipLink = screen.getByRole("link", { name: /skip to main content/i });
    expect(skipLink).toHaveAttribute("href", "#main");
    // DOCUMENT_POSITION_FOLLOWING is relative to the argument: main follows skipLink.
    expect(skipLink.compareDocumentPosition(screen.getByRole("main"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("renders the shell around an unmatched route rather than a bare error", () => {
    renderAt("/nope");

    expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /return to fleet/i })).toHaveAttribute("href", "/");
  });
});
