import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { TENANT } from "@/config/tenant";
import { useConnectionState } from "@/context/connectionContext";

import { AppShell } from "./appShell";

function ConnectionProbe(): React.ReactElement {
  return <p>child sees: {useConnectionState()}</p>;
}

function renderShell(
  state: "connecting" | "connected" | "reconnecting" | "disconnected" = "connected",
  child: React.ReactElement = <h1>Route content</h1>,
  terminalCause?: "handshake-exhausted" | "contract" | "session-mismatch",
): void {
  render(
    <MemoryRouter>
      <Routes>
        <Route
          element={<AppShell connectionState={state} attempt={2} connectionTerminalCause={terminalCause} />}
        >
          <Route index element={child} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function renderShellWithoutState(child: React.ReactElement): void {
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={child} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppShell", () => {
  it("puts the skip link first and gives it a focusable main target", () => {
    renderShell();

    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    const main = screen.getByRole("main");
    expect(skipLink).toHaveAttribute("href", "#main");
    expect(skipLink.compareDocumentPosition(main)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("reads the wordmark from tenant config and provides primary Fleet and Map navigation", () => {
    renderShell();

    expect(screen.getByRole("link", { name: TENANT.wordmark })).toHaveAttribute("href", "/");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toContainElement(screen.getByRole("link", { name: "Fleet" }));
    const mapLink = screen.getByRole("link", { name: "Map" });
    expect(nav).toContainElement(mapLink);
    expect(mapLink).toHaveAttribute("href", "/map");
  });

  it("always mounts the connection live region above main content", () => {
    renderShell();

    const banner = screen.getByRole("status");
    expect(banner).toHaveAttribute("data-connected", "true");
    expect(banner).toBeEmptyDOMElement();
    expect(banner.compareDocumentPosition(screen.getByRole("main"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("passes reconnecting state and attempt to the banner", () => {
    renderShell("reconnecting");

    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting to stream · attempt 2");
    expect(screen.getByText("Stream reconnecting")).toBeInTheDocument();
  });

  it("passes connecting state to the banner and labels the header to match", () => {
    // ADR 31's fourth published value: a first attempt is not a recovery, and both
    // surfaces must say so from the same state.
    renderShell("connecting");

    expect(screen.getByRole("status")).toHaveTextContent("Connecting to stream · attempt 2");
    expect(screen.getByText("Stream connecting")).toBeInTheDocument();
  });

  it("forwards the terminal cause so the banner names why retrying stopped", () => {
    renderShell("disconnected", <h1>Route content</h1>, "session-mismatch");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Stream integrity error · showing last known state (may be stale)",
    );
  });

  it("renders routed page content inside the single main landmark", () => {
    renderShell();

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: "Route content" }),
    );
  });

  it("publishes its connection state to routed children (ADR 23)", () => {
    // The dependency rule forbids `features` importing `app`, so the routes below
    // `Outlet` cannot read this shell's prop. `ConnectionContext` in `context` is
    // the only legal channel, and this asserts the shell is actually providing it —
    // the banner rendering correctly proves nothing about what the children see.
    renderShell("reconnecting", <ConnectionProbe />);

    expect(screen.getByText("child sees: reconnecting")).toBeInTheDocument();
  });

  it("publishes disconnected, not connected, when nothing supplies a state", () => {
    // Missing composition must still fail closed even though the production router now
    // supplies a real transport state. An optimistic default would make every row assert
    // a currency nothing is delivering, which is the defect ADR 23 replaced.
    renderShellWithoutState(<ConnectionProbe />);

    expect(screen.getByText("child sees: disconnected")).toBeInTheDocument();
  });

  it("shows the banner and the header label from the same state", () => {
    // One value, two surfaces. If these could disagree there would be two
    // authorities for one fact (Principle 1).
    renderShell("disconnected", <ConnectionProbe />);

    expect(screen.getByText("Stream disconnected")).toBeInTheDocument();
    expect(screen.getByText("child sees: disconnected")).toBeInTheDocument();
  });
});
