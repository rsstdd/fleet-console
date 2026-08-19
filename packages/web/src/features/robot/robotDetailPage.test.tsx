import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";

import { ConnectionContext, type StreamConnectionState } from "@/shared/lib/connectionContext";

import { RobotDetailPage } from "./robotDetailPage";

/**
 * Verification table from docs/01_page-specs/03_ROBOT_DETAIL.md §11.
 *
 * Fixture ids come from `entities/robot` and are chosen for what they declare:
 * R-118 (vendor A) and R-055 (vendor B) declare dock + lidar, R-301 (vendor C)
 * declares dock + water level and omits lidar, R-055 alone is sequence-less,
 * and R-233 has never reported. That contrast is the point of the surface — a
 * panel exists because a robot declared the capability, never because of the
 * vendor's name.
 */
function renderRobot(id: string, connection: StreamConnectionState = "connected"): void {
  render(
    <ConnectionContext.Provider value={connection}>
      <MemoryRouter initialEntries={[`/robots/${id}`]}>
        <Routes>
          <Route path="/robots/:id" element={<RobotDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ConnectionContext.Provider>,
  );
}

async function showTechnicianView(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Technician" }));
}

function capabilitiesSection(): HTMLElement {
  return screen.getByRole("region", { name: "Capabilities" });
}

describe("RobotDetailPage", () => {
  it("names the robot in a single h1 and offers the route back to fleet", () => {
    renderRobot("R-118");

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Robot R-118");
    expect(screen.getByRole("link", { name: /fleet/i })).toHaveAttribute("href", "/");
  });

  it("shows status and freshness in the header (Principle 4)", () => {
    renderRobot("R-118");

    const header = screen.getByRole("heading", { level: 1 }).parentElement;
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByText("Busy")).toBeInTheDocument();
    expect(within(header as HTMLElement).getByText("Live")).toBeInTheDocument();
  });

  it("suppresses the freshness label while the stream is down (ADR 3)", () => {
    // The summary values below freeze at last known — the spec says so. What is
    // withdrawn is only the claim about how current they are, and nothing is put in
    // its place: no "unreachable", no em dash. Substituting a per-robot state would
    // attribute the console's own dead socket to the machine.
    renderRobot("R-118", "disconnected");

    const header = screen.getByRole("heading", { level: 1 }).parentElement;
    expect(header).not.toBeNull();
    expect(within(header as HTMLElement).getByText("Busy")).toBeInTheDocument();
    expect(within(header as HTMLElement).queryByText("Live")).toBeNull();
    expect(within(header as HTMLElement).queryByText("Unreachable")).toBeNull();
  });

  it("suppresses it while reconnecting too", () => {
    renderRobot("R-118", "reconnecting");

    const header = screen.getByRole("heading", { level: 1 }).parentElement;
    expect(within(header as HTMLElement).queryByText("Live")).toBeNull();
  });

  it("keeps the frozen values visible while the label is suppressed", () => {
    // Suppression is not a blank page. The operator still needs the last known
    // reading; what they must not get is a currency claim about it.
    renderRobot("R-118", "disconnected");

    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("Last seen")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("R-118");
  });

  it("renders a panel only for a declared capability", () => {
    renderRobot("R-055");

    const section = capabilitiesSection();
    expect(within(section).getByRole("heading", { name: "Dock" })).toBeInTheDocument();
    expect(within(section).getByRole("heading", { name: "Lidar" })).toBeInTheDocument();
    // Undeclared: omitted entirely, not a disabled placeholder (spec §2).
    expect(within(section).queryByRole("heading", { name: "Water level" })).toBeNull();
  });

  it("renders the vendor's own capability set without a vendor branch", () => {
    renderRobot("R-301");

    const section = capabilitiesSection();
    expect(within(section).getByRole("heading", { name: "Water level" })).toBeInTheDocument();
    expect(within(section).queryByRole("heading", { name: "Lidar" })).toBeNull();
  });

  it("keeps core fields out of the capabilities section (spec §6)", () => {
    renderRobot("R-118");

    const section = capabilitiesSection();
    for (const coreField of ["Battery", "Position", "Status", "Health", "Last seen"]) {
      expect(within(section).queryByText(coreField)).toBeNull();
    }
    // They are on the page — in Summary, where they belong.
    const summary = screen.getByRole("region", { name: "Summary" });
    for (const coreField of ["Battery", "Position", "Status", "Health", "Last seen"]) {
      expect(within(summary).getByText(coreField)).toBeInTheDocument();
    }
  });

  it("gives sequence no panel, because it is diagnostic rather than operational", async () => {
    // R-118 declares `sequence`; it must not become a panel (spec §6).
    renderRobot("R-118");
    expect(within(capabilitiesSection()).queryByRole("heading", { name: /sequence/i })).toBeNull();

    await showTechnicianView();
    const diagnostics = screen.getByRole("region", { name: "Diagnostics" });
    expect(within(diagnostics).getByText("Sequence")).toBeInTheDocument();
  });

  it("renders health as its own field, not appended to status text", () => {
    renderRobot("R-301");

    const summary = screen.getByRole("region", { name: "Summary" });
    const health = within(summary).getByText("Health").parentElement;
    expect(health).not.toBeNull();
    expect(health).toHaveTextContent("critical — Obstacle sensor unresponsive");
    // Status keeps its own word; the two facts are not collapsed (spec §6).
    const status = within(summary).getByText("Status").parentElement;
    expect(status).toHaveTextContent("Fault");
    expect(status).not.toHaveTextContent("critical");
  });

  it("stamps the retained payload with the robot it belongs to", async () => {
    renderRobot("R-301");
    await showTechnicianView();

    const raw = screen.getByRole("region", { name: "Raw payload" });
    expect(raw).toHaveTextContent('"id": "R-301"');
  });

  it("defaults to operator and hides technician sections", () => {
    renderRobot("R-118");

    expect(screen.getByRole("button", { name: "Operator" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("region", { name: "Diagnostics" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Raw payload" })).toBeNull();
  });

  it("adds diagnostics and raw payload for the technician", async () => {
    renderRobot("R-118");
    await showTechnicianView();

    expect(screen.getByRole("region", { name: "Diagnostics" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Raw payload" })).toBeInTheDocument();
    // Summary stays: technician content is additive, not a second layout.
    expect(screen.getByRole("region", { name: "Summary" })).toBeInTheDocument();
  });

  it("labels the unknown-field count as per-adapter, not per-robot", async () => {
    renderRobot("R-118");
    await showTechnicianView();

    expect(screen.getByText("Unknown fields (adapter, fleet-wide)")).toBeInTheDocument();
  });

  it("distinguishes gaps not evaluated from no gaps observed", async () => {
    // Vendor B sends no sequence, so gaps cannot be counted for it.
    renderRobot("R-055");
    await showTechnicianView();

    const diagnostics = screen.getByRole("region", { name: "Diagnostics" });
    // Both continuity rows, because they read one discriminated field and so
    // cannot disagree about whether it was evaluated (ADR 25).
    expect(within(diagnostics).getAllByText("Not evaluated")).toHaveLength(2);
    expect(within(diagnostics).getByText("Not reported")).toBeInTheDocument();
    // The number this surface must never show for an uncounted robot.
    expect(within(diagnostics).queryByText("0 gaps")).toBeNull();
  });

  it("shows counts, not 'not evaluated', for a robot whose sequence is counted", async () => {
    // The complementary case. Without it, "Not evaluated" everywhere would pass
    // the assertion above for the wrong reason.
    renderRobot("R-301");
    await showTechnicianView();

    const diagnostics = screen.getByRole("region", { name: "Diagnostics" });
    expect(within(diagnostics).queryByText("Not evaluated")).toBeNull();
    const gaps = within(diagnostics).getByText("Sequence gaps (since start)").parentElement;
    expect(gaps).toHaveTextContent("3");
  });

  it("states the raw payload's exposure rather than implying protection (ADR 26)", async () => {
    // The notice is the honest half of a decision to ship unredacted vendor content
    // with no access rule. It must be visible wherever the payload is, including when
    // there is no payload to show — the endpoint is equally unprotected either way.
    renderRobot("R-118");
    await showTechnicianView();

    const notice = screen.getByTestId("raw-payload-exposure");
    expect(notice).toHaveTextContent("nothing removed");
    expect(notice).toHaveTextContent("not access-controlled");
  });

  it("keeps the exposure notice for a robot with no retained payload", async () => {
    renderRobot("R-233");
    await showTechnicianView();

    expect(screen.getByTestId("raw-payload-exposure")).toBeInTheDocument();
    expect(screen.getByText("No payload was retained for this robot.")).toBeInTheDocument();
  });

  it("hides the raw payload and its notice from the operator view", () => {
    // Presentation only — the toggle is not a permission and the ADR says so. What
    // this asserts is that the default view does not surface it, not that it is
    // protected.
    renderRobot("R-118");

    expect(screen.queryByTestId("raw-payload-exposure")).toBeNull();
  });

  it("fabricates nothing for a robot that has never reported", async () => {
    renderRobot("R-233");

    const summary = screen.getByRole("region", { name: "Summary" });
    // Freshness state word, no date, no zeroes standing in for readings.
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    const lastSeen = within(summary).getByText("Last seen").parentElement;
    expect(lastSeen).not.toBeNull();
    expect(lastSeen).toHaveTextContent("—");

    await showTechnicianView();
    expect(screen.getByText("No payload was retained for this robot.")).toBeInTheDocument();
  });

  it("keeps the heading outline unbroken (Principle 6)", async () => {
    renderRobot("R-118");
    await showTechnicianView();

    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));

    expect(levels[0]).toBe(1);
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1] ?? 1;
      const current = levels[index] ?? 1;
      expect(current).toBeLessThanOrEqual(previous + 1);
    }
    // Capability panels sit at h3 under the Capabilities h2.
    expect(
      within(capabilitiesSection()).getByRole("heading", { level: 3, name: "Dock" }),
    ).toBeInTheDocument();
  });

  it("answers an unknown id with an empty state, not an error banner", () => {
    renderRobot("R-999");

    expect(screen.getByText("Robot not found")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to fleet" })).toHaveAttribute("href", "/");
  });
});
