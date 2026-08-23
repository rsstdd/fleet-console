import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Robot } from "@/entities/robot/model";
import type { FleetData, FleetResourceState } from "@/entities/robot/fleetStore";
import { ConnectionContext, type StreamConnectionState } from "@/context/connectionContext";

/**
 * Contract test for docs/01_page-specs/04_MAP.md §§ 2, 9, 10 and 11. The hook
 * is mocked so every resource state is drivable (Principle 5); fixture
 * freshness is data, never derived (ADR 3).
 */
const fleet = vi.hoisted((): { state: FleetResourceState } => ({
  state: { kind: "loading" },
}));

vi.mock("@/entities/robot/useFleetRobots", () => ({
  useFleetRobots: (): FleetResourceState => fleet.state,
}));

const { MapPage } = await import("./mapPage");

function robot(overrides: Partial<Robot> & Pick<Robot, "id">): Robot {
  return {
    vendor: "A",
    siteId: "zone-a",
    observed: true,
    model: "Model A",
    connectivity: "online",
    position: { frame: "zone-a", x: 0, y: 0 },
    capabilities: {},
    status: "idle",
    health: { severity: "nominal" },
    freshness: "live",
    batteryPercent: 90,
    lastSeenAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

const FIXTURE: readonly Robot[] = [
  robot({ id: "R-118", position: { frame: "zone-a", x: -20, y: 10 }, status: "busy" }),
  robot({ id: "R-204", position: { frame: "zone-a", x: 15, y: -5 }, freshness: "stale" }),
  // Registered, never reported: no position, so it must be listed, not plotted.
  robot({ id: "R-402", position: null, freshness: "unknown", status: "unknown", lastSeenAt: null }),
  // The other site's robot must never appear while zone-a is selected.
  robot({ id: "R-301", siteId: "zone-b", position: { frame: "zone-b", x: 3, y: 4 } }),
];

/** The directory the fixture robots reference; the only source of labels (ADR 34). */
const SITES = [
  { siteId: "zone-a", label: "Zone A" },
  { siteId: "zone-b", label: "Zone B" },
];

/** 2026-08-19T10:00:05Z, a moment after the newest fixture reading. */
const CAPTURED_AT = Date.UTC(2026, 7, 19, 10, 0, 5);

/** Builds the retained data the ready and error states carry. */
function fleetData(robots: readonly Robot[], over: Partial<FleetData> = {}): FleetData {
  return { robots, sites: SITES, capturedAt: CAPTURED_AT, latestFrameAt: null, ...over };
}

/** Builds the ready state most cases render from. */
function ready(robots: readonly Robot[], over: Partial<FleetData> = {}): FleetResourceState {
  return { kind: "ready", data: fleetData(robots, over) };
}

/**
 * Renders the page with an explicit stream connection state; `connected` is
 * the stated default for the same reason the fleet test states it (ADR 23).
 */
function renderPage(connection: StreamConnectionState = "connected"): void {
  render(
    <ConnectionContext.Provider value={connection}>
      <MemoryRouter>
        <MapPage />
      </MemoryRouter>
    </ConnectionContext.Provider>,
  );
}

/** The canvas image for the selected site, found by its computed name. */
function canvas(): HTMLElement {
  return screen.getByRole("img", { name: /Map of Zone A/ });
}

beforeEach(() => {
  fleet.state = { kind: "loading" };
});

describe("resource states (page spec 04 § 10)", () => {
  it("renders a busy skeleton while loading, never an empty map", () => {
    renderPage();

    expect(screen.getByText("Loading map…")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders the empty-roster state without an error", () => {
    fleet.state = ready([]);
    renderPage();

    expect(screen.getByText("No robots registered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps last-known content under a quiet line while refreshing", () => {
    fleet.state = { kind: "refreshing", data: fleetData(FIXTURE) };
    renderPage();

    expect(screen.getByText(/showing last-known positions/)).toBeInTheDocument();
    expect(canvas()).toBeInTheDocument();
  });

  it("offers the one Retry on a recoverable failure and keeps retained content", () => {
    const retry = vi.fn();
    fleet.state = {
      kind: "recoverable-error",
      data: fleetData(FIXTURE),
      failure: { cause: "handshake-exhausted" },
      retry,
    };
    renderPage();

    expect(screen.getByText(/could not be refreshed/)).toBeInTheDocument();
    expect(canvas()).toBeInTheDocument();
  });

  it("names issue paths and codes on a terminal failure and offers no retry", () => {
    fleet.state = {
      kind: "terminal-error",
      data: null,
      issues: [{ path: "(root)", code: "invalid_type", message: "not an object" }],
    };
    renderPage();

    expect(screen.getByText("(root): invalid_type")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});

describe("site facet (page spec 04 § 2)", () => {
  it("defaults to the first directory site and plots only its robots", () => {
    fleet.state = ready(FIXTURE);
    renderPage();

    expect(screen.getByRole("heading", { name: "Positions · Zone A" })).toBeInTheDocument();
    expect(screen.getByText("2 of 3 robots positioned")).toBeInTheDocument();
    // Markers are not interactive; the only per-robot controls are list links.
    const list = screen.getByRole("region", { name: "Robots" });
    expect(within(list).getByRole("link", { name: "R-118" })).toHaveAttribute(
      "href",
      "/robots/R-118",
    );
    expect(within(list).queryByRole("link", { name: "R-301" })).toBeNull();
  });

  it("switches the plotted and listed robots when a site is selected", async () => {
    fleet.state = ready(FIXTURE);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Zone B" }));

    expect(screen.getByRole("heading", { name: "Positions · Zone B" })).toBeInTheDocument();
    expect(screen.getByText("1 of 1 robots positioned")).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Robots" });
    expect(within(list).getByRole("link", { name: "R-301" })).toBeInTheDocument();
    expect(within(list).queryByRole("link", { name: "R-118" })).toBeNull();
  });

  it("labels the toggle group from the visible Site label", () => {
    fleet.state = ready(FIXTURE);
    renderPage();

    expect(screen.getByRole("group", { name: "Site" })).toBeInTheDocument();
  });
});

describe("accounting for unpositioned robots (page spec 04 § 2)", () => {
  it("lists a never-reported robot under No position with an em dash", () => {
    fleet.state = ready(FIXTURE);
    renderPage();

    expect(screen.getByRole("heading", { name: "No position" })).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Robots" });
    const row = within(list).getByRole("link", { name: "R-402" }).closest("li");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("—");
  });

  it("shows the empty-canvas message when no robot in the site has a position", () => {
    fleet.state = ready([robot({ id: "R-402", position: null, freshness: "unknown" })]);
    renderPage();

    expect(screen.getByText("No positioned robots in Zone A.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("stream suppression (page spec 04 § 2, ADR 3)", () => {
  it("qualifies the heading and suppresses list freshness while disconnected", () => {
    fleet.state = ready(FIXTURE);
    renderPage("disconnected");

    expect(
      screen.getByRole("heading", { name: "Positions · Zone A · last known" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Robots" });
    expect(within(list).queryByText(/Live/)).toBeNull();
    // Retained markers stay drawn — hollow, which is a fill rule, not removal.
    expect(canvas()).toBeInTheDocument();
  });

  it("shows freshness labels and the unqualified heading while connected", () => {
    fleet.state = ready(FIXTURE);
    renderPage();

    expect(screen.getByRole("heading", { name: "Positions · Zone A" })).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Robots" });
    expect(within(list).getAllByText("Live").length).toBeGreaterThan(0);
  });
});

describe("marker encoding (page spec 04 § 2)", () => {
  it("fills live markers with their status token and hollows the rest", () => {
    fleet.state = ready(FIXTURE);
    renderPage();

    const circles = [...canvas().querySelectorAll("circle")];
    expect(circles).toHaveLength(2);
    const fills = circles.map((circle) => circle.getAttribute("fill"));
    // R-118 is live and busy → filled with its status token; R-204 is stale → hollow.
    expect(fills).toContain("var(--status-active)");
    expect(fills).toContain("none");
  });

  it("renders the derived-frame caption the wireframe carries", () => {
    fleet.state = ready(FIXTURE);
    renderPage();

    expect(screen.getByText("derived site frame · metres · no floor plan")).toBeInTheDocument();
  });

  it("hollows every marker while the stream is down", () => {
    fleet.state = ready(FIXTURE);
    renderPage("disconnected");

    const fills = [...canvas().querySelectorAll("circle")].map((c) => c.getAttribute("fill"));
    expect(fills).toEqual(["none", "none"]);
  });
});

describe("canvas accessibility (page spec 04 § 9)", () => {
  it("names the image with the site and the positioned count", () => {
    fleet.state = ready(FIXTURE);
    renderPage();

    expect(
      screen.getByRole("img", { name: "Map of Zone A: 2 of 3 robots positioned" }),
    ).toBeInTheDocument();
  });

  it("keeps the page to one h1 followed by section h2s", () => {
    fleet.state = ready(FIXTURE);
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Map" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Positions/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Robots" })).toBeInTheDocument();
  });
});
