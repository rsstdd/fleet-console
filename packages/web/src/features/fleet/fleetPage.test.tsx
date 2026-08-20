import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";

import type { Robot } from "@/entities/robot/model";
import { ConnectionContext, type StreamConnectionState } from "@/shared/lib/connectionContext";

/**
 * Contract test for docs/01_page-specs/02_FLEET.md §2, §9, §10 and §11.
 *
 * The hook is mocked so the fixtures are deterministic: the real
 * `useFleetRobots` builds timestamps from `Date.now()`, and a table asserting on
 * rendered times cannot be stable against a moving clock (Principle 10).
 */
const fleet = vi.hoisted(() => ({ robots: [] as Robot[] }));

vi.mock("@/entities/robot/useFleetRobots", () => ({
  useFleetRobots: (): readonly Robot[] => fleet.robots,
}));

const { FleetPage } = await import("./fleetPage");

function robot(overrides: Partial<Robot> & Pick<Robot, "id">): Robot {
  return {
    vendor: "A",
    siteId: "zone-a",
    status: "idle",
    health: { severity: "nominal" },
    freshness: "live",
    batteryPercent: 90,
    lastSeenAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

const FIXTURE: readonly Robot[] = [
  robot({ id: "R-118", vendor: "A", siteId: "zone-a", freshness: "live" }),
  robot({ id: "R-204", vendor: "B", siteId: "zone-b", freshness: "stale" }),
  robot({
    id: "R-301",
    vendor: "C",
    siteId: "zone-b",
    freshness: "unreachable",
    lastSeenAt: "2026-08-19T09:58:00.000Z",
  }),
  robot({ id: "R-402", vendor: "A", siteId: "zone-a", freshness: "unknown", lastSeenAt: null }),
];

/** Reports the router's current path so navigation can be asserted, or its absence. */
function LocationProbe(): ReactNode {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

/**
 * Renders the page with an explicit stream connection state.
 *
 * The default is `connected` rather than the context's own `disconnected`, because every
 * assertion below except the suppression tests is about a console that is receiving data.
 * Stating it here rather than relying on a default is the point: ADR 23 made the default
 * fail closed precisely so that "which case is this test covering" has to be answered.
 */
function renderPage(connection: StreamConnectionState = "connected"): void {
  render(
    <ConnectionContext.Provider value={connection}>
      <MemoryRouter>
        <FleetPage />
        <LocationProbe />
      </MemoryRouter>
    </ConnectionContext.Provider>,
  );
}

/**
 * Freshness cells in body rows.
 *
 * Indexed against `th, td` rather than `getAllByRole("cell")`, because the robot id is a
 * row header and so is excluded from the `cell` role — an off-by-one that reads as
 * plausible and silently returns the Site column. The index is the locked column order
 * asserted above: id, vendor, status, **freshness**, site, battery, last seen.
 */
function freshnessCells(): readonly HTMLElement[] {
  return within(fleetTable())
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.querySelectorAll<HTMLElement>("th, td")[3])
    .filter((cell): cell is HTMLElement => cell !== undefined);
}

/**
 * Reads the four summary metrics by Stat's documented `stat__*` selectors
 * (component spec 05 §4). Querying by visible text cannot work here: "Live"
 * appears both as a summary label and as a freshness label in every row.
 */
function summaryCounts(): Record<string, number> {
  const stats = [...document.querySelectorAll<HTMLElement>(".stat")];
  return Object.fromEntries(
    stats.map((stat) => [
      stat.querySelector(".stat__label")?.textContent ?? "",
      Number(stat.querySelector(".stat__value")?.textContent ?? "0"),
    ]),
  );
}

function fleetTable(): HTMLElement {
  return screen.getByRole("table", { name: "Fleet" });
}

beforeEach(() => {
  fleet.robots = [...FIXTURE];
});

describe("FleetPage", () => {
  it("owns the single h1 and renders one row per robot, keyed by id", () => {
    renderPage();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Fleet overview");
    expect(within(fleetTable()).getAllByRole("row")).toHaveLength(FIXTURE.length + 1);
  });

  it("renders the seven locked columns in spec order", () => {
    renderPage();

    const headers = within(fleetTable()).getAllByRole("columnheader");
    expect(headers.map((cell) => cell.textContent)).toEqual([
      "Robot id",
      "Vendor",
      "Status",
      "Freshness",
      "Site",
      "Battery",
      "Last seen",
    ]);
  });

  it("makes the robot id cell the row header and the only link in the row", () => {
    renderPage();

    const row = within(fleetTable()).getByRole("row", { name: /R-118/ });
    const rowHeader = within(row).getByRole("rowheader");

    expect(within(rowHeader).getByRole("link", { name: "R-118" })).toHaveAttribute(
      "href",
      "/robots/R-118",
    );
    expect(within(row).getAllByRole("link")).toHaveLength(1);
  });

  it("does not navigate when a non-link cell is clicked, so one pointer activation cannot fire twice", async () => {
    const user = userEvent.setup();
    renderPage();

    const row = within(fleetTable()).getByRole("row", { name: /R-118/ });
    const vendorCell = within(row).getAllByRole("cell")[0];
    expect(vendorCell).toBeDefined();

    // Spec §2: activation is the link and nothing else. A row-level handler
    // would fire alongside the link on one pointer click, and would still offer
    // no keyboard path, because a <tr> is not focusable.
    await user.click(vendorCell as HTMLElement);

    // Exact, not toHaveTextContent: that matches substrings, and "/robots/R-118"
    // contains "/", so the assertion would pass against the very defect it guards.
    expect(screen.getByTestId("location").textContent).toBe("/");
    expect(row).not.toHaveAttribute("tabindex");
  });

  it("keeps every robot reachable by keyboard through the id link alone", () => {
    renderPage();

    const links = within(fleetTable()).getAllByRole("link");
    expect(links).toHaveLength(FIXTURE.length);
    for (const link of links) {
      link.focus();
      expect(document.activeElement).toBe(link);
    }
  });

  it("shows a freshness label per row while the stream is connected", () => {
    renderPage("connected");

    const cells = freshnessCells();
    expect(cells).toHaveLength(FIXTURE.length);
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "Live",
      "Stale",
      "Unreachable",
      "Unknown",
    ]);
  });

  it("suppresses every per-robot freshness label while the stream is down (ADR 3)", () => {
    // The rows stay — the table retains last-known data (fleet spec § 8). What is
    // withdrawn is the claim about how current that data is. Note what is *not*
    // rendered instead: no "unreachable", no em dash, no placeholder. Substituting a
    // per-robot state would blame every machine for the console's own dead socket.
    renderPage("disconnected");

    expect(within(fleetTable()).getAllByRole("row")).toHaveLength(FIXTURE.length + 1);
    expect(freshnessCells().map((cell) => cell.textContent)).toEqual(["", "", "", ""]);
  });

  it("suppresses them while reconnecting too, not only when fully disconnected", () => {
    // The case most likely to be waved through. Nothing is updating freshness during
    // a reconnect, so a label left standing ages silently.
    renderPage("reconnecting");

    expect(freshnessCells().map((cell) => cell.textContent)).toEqual(["", "", "", ""]);
  });

  it("fails if the suppression is removed", () => {
    // Guards against the assertion above passing vacuously — if the cells were empty
    // for some unrelated reason, the connected case would be empty too.
    renderPage("connected");
    const connected = freshnessCells().map((cell) => cell.textContent);
    expect(connected.every((text) => text !== "")).toBe(true);
  });

  it("labels the summary Fleet freshness, without qualification, while connected (ADR 23)", () => {
    renderPage("connected");

    expect(screen.getByRole("heading", { level: 2, name: "Fleet freshness" })).toBeInTheDocument();
    // Scoped to headings: rows legitimately say "(last known)" per non-live status chip.
    expect(screen.queryByRole("heading", { name: /last known/ })).not.toBeInTheDocument();
  });

  it("qualifies the whole summary as last known while disconnected (ADR 23)", () => {
    // The counts stay useful during an outage; what is withdrawn is the claim that
    // they are current. One shared heading qualifies the group — never a per-metric
    // tag, and never a client-derived timestamp (fleet spec § 2).
    renderPage("disconnected");

    expect(
      screen.getByRole("heading", { level: 2, name: "Fleet freshness · last known" }),
    ).toBeInTheDocument();
  });

  it("qualifies it while reconnecting too — only connected removes the qualification", () => {
    renderPage("reconnecting");

    expect(
      screen.getByRole("heading", { level: 2, name: "Fleet freshness · last known" }),
    ).toBeInTheDocument();
  });

  it("keeps all four counts visible and unchanged while disconnected", () => {
    renderPage("disconnected");

    const counts = summaryCounts();
    expect(counts).toEqual({ Live: 1, Stale: 1, Unreachable: 1, Unknown: 1 });
  });

  it("keeps the qualified summary fleet-wide when a filter narrows the table while down", async () => {
    const user = userEvent.setup();
    renderPage("disconnected");

    const before = summaryCounts();
    await user.type(screen.getByLabelText("Search"), "R-204");

    expect(within(fleetTable()).getAllByRole("row")).toHaveLength(2);
    expect(summaryCounts()).toEqual(before);
    expect(
      screen.getByRole("heading", { level: 2, name: "Fleet freshness · last known" }),
    ).toBeInTheDocument();
  });

  it("keeps the page's heading order: one h1, then the summary h2", () => {
    renderPage("connected");

    const headings = screen.getAllByRole("heading");
    expect(headings[0]).toHaveTextContent("Fleet overview");
    expect(headings[0]?.tagName).toBe("H1");
    expect(headings[1]).toHaveTextContent("Fleet freshness");
    expect(headings[1]?.tagName).toBe("H2");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("counts the four freshness states so they total the fleet exactly", () => {
    renderPage();

    const counts = summaryCounts();
    expect(counts).toEqual({ Live: 1, Stale: 1, Unreachable: 1, Unknown: 1 });
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(FIXTURE.length);
  });

  it("keeps the summary fleet-wide when a filter narrows the table", async () => {
    const user = userEvent.setup();
    renderPage();

    const before = summaryCounts();
    expect(within(fleetTable()).getAllByRole("row")).toHaveLength(FIXTURE.length + 1);

    await user.click(screen.getByLabelText("Vendor"));
    await user.click(screen.getByRole("option", { name: "Vendor B" }));

    // Spec §2: an operator narrowing the table to find one robot must not watch
    // the fleet totals move underneath them.
    expect(within(fleetTable()).getAllByRole("row")).toHaveLength(2);
    expect(summaryCounts()).toEqual(before);
  });

  it("filters by site", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByLabelText("Site"));
    await user.click(screen.getByRole("option", { name: /Zone B/i }));

    const rows = within(fleetTable()).getAllByRole("row");
    expect(rows).toHaveLength(3);
  });

  it("offers a clear action when filters exclude every robot", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Search"), "no-such-robot");

    expect(screen.getByRole("heading", { name: "No robots match these filters" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(within(fleetTable()).getAllByRole("row")).toHaveLength(FIXTURE.length + 1);
  });

  it("states an unregistered fleet as a fact, without a clear action that would do nothing", () => {
    fleet.robots = [];
    renderPage();

    expect(screen.getByRole("heading", { name: "No robots registered" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Clear filters" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows an em dash rather than a number for battery once a robot is not live", () => {
    renderPage();

    const stale = within(fleetTable()).getByRole("row", { name: /R-204/ });
    expect(
      within(stale)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toContain("—");
  });

  it("dates the data plate from the newest reading, not from render time", () => {
    renderPage();

    // 10:00:00Z is the newest lastSeenAt in the fixture; R-402 has never reported.
    expect(screen.getByText(/Fleet snapshot/)).toHaveTextContent("latest reading 10:00:00Z");
  });
});
