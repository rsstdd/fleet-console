import { render, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionContext, type StreamConnectionState } from "@/context/connectionContext";
import { StreamDiagnosticsContext } from "@/context/streamDiagnosticsContext";
import { SCHEMA_VERSION, type CanonicalEnvelope } from "@fleet/contracts";
import { createFleetStore } from "@/stores/fleetStore";
import { FleetStoreContext } from "@/stores/fleetStoreContext";

import { RobotDetailPage } from "./robotDetailPage";
import { createFixtureFetch } from "./robotDetailFixtures";

/**
 * The page fetches; these tests stub `fetch` rather than the hook.
 *
 * Stubbing the hook would delete the coverage this suite exists for — the true path
 * from wire bytes through the contract's parser and `fromEnvelope` to the panels — and
 * leave assertions about a value the test itself constructed.
 */
beforeEach(() => {
  vi.stubGlobal("fetch", createFixtureFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Verification table from docs/01_page-specs/03_ROBOT_DETAIL.md §11.
 *
 * Fixture ids come from `robotDetailFixtures.ts` and are chosen for what they declare:
 * R-118 (vendor A) declares dock + lidar, R-301 (vendor C) declares dock + water level
 * and omits lidar, R-055 (vendor B) declares dock alone and is sequence-less,
 * and R-233 has never reported. That contrast is the point of the surface — a
 * panel exists because a robot declared the capability, never because of the
 * vendor's name.
 */
/**
 * Renders and waits for the fetch to settle.
 *
 * The page loads asynchronously now, so a synchronous assertion would see the
 * loading state and report a missing element rather than a slow one.
 */
async function renderRobot(
  id: string,
  connection: StreamConnectionState = "connected",
): Promise<void> {
  render(
    <ConnectionContext.Provider value={connection}>
      <MemoryRouter initialEntries={[`/robots/${id}`]}>
        <Routes>
          <Route path="/robots/:id" element={<RobotDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ConnectionContext.Provider>,
  );

  // The skeleton's own text, because it is the one thing every terminal state removes —
  // ready, not-found and both errors. Waiting on an h1 would hang on not-found.
  await waitForElementToBeRemoved(() => screen.queryByText("Loading robot…"));
}

async function showTechnicianView(): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: "Technician" }));
}

function getCapabilitiesSection(): HTMLElement {
  return screen.getByRole("region", { name: "Capabilities" });
}

describe("RobotDetailPage", () => {
  it("rejects an address without an id before any data hook can fetch on it", () => {
    // The guard lives at the route boundary, so the empty state is synchronous:
    // no skeleton, no request. `useRobotDetail`'s own not-found mapping never runs.
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <MemoryRouter initialEntries={["/robots"]}>
        <Routes>
          <Route path="/robots" element={<RobotDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("That address does not name a robot.")).toBeInTheDocument();
    expect(screen.queryByText("Loading robot…")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to fleet" })).toHaveAttribute("href", "/");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a route id outside the canonical identifier grammar before fetching", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <MemoryRouter initialEntries={["/robots/R%20invalid"]}>
        <Routes>
          <Route path="/robots/:id" element={<RobotDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("That address does not name a robot.")).toBeInTheDocument();
    expect(screen.queryByText("Loading robot…")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("names the robot in a single h1 and offers the route back to fleet", async () => {
    await renderRobot("R-118");

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Robot R-118");
    expect(screen.getByRole("link", { name: /fleet/i })).toHaveAttribute("href", "/");
  });

  it("shows status and freshness in the header (Principle 4)", async () => {
    await renderRobot("R-118");

    const header = screen.getByRole("heading", { level: 1 }).parentElement;
    if (header === null) throw new Error("robot heading must have a header container");
    expect(within(header).getByText("Busy")).toBeInTheDocument();
    expect(within(header).getByText("Live")).toBeInTheDocument();
  });

  it("suppresses the freshness label while the stream is down (ADR 3)", async () => {
    // The summary values below freeze at last known — the spec says so. What is
    // withdrawn is only the claim about how current they are, and nothing is put in
    // its place: no "unreachable", no em dash. Substituting a per-robot state would
    // attribute the console's own dead socket to the machine.
    await renderRobot("R-118", "disconnected");

    const header = screen.getByRole("heading", { level: 1 }).parentElement;
    if (header === null) throw new Error("robot heading must have a header container");
    expect(within(header).getByText("Busy")).toBeInTheDocument();
    expect(within(header).queryByText("Live")).toBeNull();
    expect(within(header).queryByText("Unreachable")).toBeNull();
  });

  it("suppresses it while reconnecting too", async () => {
    await renderRobot("R-118", "reconnecting");

    const header = screen.getByRole("heading", { level: 1 }).parentElement;
    if (header === null) throw new Error("robot heading must have a header container");
    expect(within(header).queryByText("Live")).toBeNull();
  });

  it("keeps the frozen values visible while the label is suppressed", async () => {
    // Suppression is not a blank page. The operator still needs the last known
    // reading; what they must not get is a currency claim about it.
    await renderRobot("R-118", "disconnected");

    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("Last seen")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("R-118");
  });

  it("renders a panel only for a declared capability", async () => {
    await renderRobot("R-118");

    const section = getCapabilitiesSection();
    expect(within(section).getByRole("heading", { name: "Dock" })).toBeInTheDocument();
    expect(within(section).getByRole("heading", { name: "Lidar" })).toBeInTheDocument();
    // Undeclared: omitted entirely, not a disabled placeholder (spec §2).
    expect(within(section).queryByRole("heading", { name: "Water level" })).toBeNull();
  });

  it("gives vendor B a dock panel and nothing else, as its dialect declares", async () => {
    // The narrowest profile of the three, and the one that proves absence is the
    // interface: B's payload carries no lidar source data at all (ADR 1 § Observed
    // consequences), so there is no panel rather than an empty one.
    await renderRobot("R-055");

    const section = getCapabilitiesSection();
    expect(within(section).getByRole("heading", { name: "Dock" })).toBeInTheDocument();
    expect(within(section).queryByRole("heading", { name: "Lidar" })).toBeNull();
    expect(within(section).queryByRole("heading", { name: "Water level" })).toBeNull();
  });

  it("renders the vendor's own capability set without a vendor branch", async () => {
    await renderRobot("R-301");

    const section = getCapabilitiesSection();
    expect(within(section).getByRole("heading", { name: "Water level" })).toBeInTheDocument();
    expect(within(section).queryByRole("heading", { name: "Lidar" })).toBeNull();
  });

  it("keeps core fields out of the capabilities section (spec §6)", async () => {
    await renderRobot("R-118");

    const section = getCapabilitiesSection();
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
    await renderRobot("R-118");
    expect(
      within(getCapabilitiesSection()).queryByRole("heading", { name: /sequence/i }),
    ).toBeNull();

    await showTechnicianView();
    const diagnostics = screen.getByRole("region", { name: "Diagnostics" });
    expect(within(diagnostics).getByText("Sequence")).toBeInTheDocument();
  });

  it("renders health as its own field, not appended to status text", async () => {
    await renderRobot("R-301");

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
    await renderRobot("R-301");
    await showTechnicianView();

    const raw = screen.getByRole("region", { name: "Raw payload" });
    expect(raw).toHaveTextContent('"id": "R-301"');
  });

  it("defaults to operator and hides technician sections", async () => {
    await renderRobot("R-118");

    expect(screen.getByRole("button", { name: "Operator" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("region", { name: "Diagnostics" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Raw payload" })).toBeNull();
  });

  it("adds diagnostics and raw payload for the technician", async () => {
    await renderRobot("R-118");
    await showTechnicianView();

    expect(screen.getByRole("region", { name: "Diagnostics" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Raw payload" })).toBeInTheDocument();
    // Summary stays: technician content is additive, not a second layout.
    expect(screen.getByRole("region", { name: "Summary" })).toBeInTheDocument();
  });

  it("labels the unknown-field count as per-adapter, not per-robot", async () => {
    await renderRobot("R-118");
    await showTechnicianView();

    expect(screen.getByText("Unknown fields (adapter, fleet-wide)")).toBeInTheDocument();
  });

  it("distinguishes gaps not evaluated from no gaps observed", async () => {
    // Vendor B sends no sequence, so gaps cannot be counted for it.
    await renderRobot("R-055");
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
    await renderRobot("R-301");
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
    await renderRobot("R-118");
    await showTechnicianView();

    // Queried by its visible sentence, not a test id: the notice only does its
    // job if a person can read it, so the query asserts what the reader sees.
    const notice = screen.getByText(/Shown exactly as the vendor sent it/);
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent("nothing removed");
    expect(notice).toHaveTextContent("not access-controlled");
  });

  it("keeps the exposure notice for a robot with no retained payload", async () => {
    await renderRobot("R-233");
    await showTechnicianView();

    expect(screen.getByText(/Shown exactly as the vendor sent it/)).toBeVisible();
    expect(screen.getByText("No payload was retained for this robot.")).toBeInTheDocument();
  });

  it("hides the raw payload and its notice from the operator view", async () => {
    // Presentation only — the toggle is not a permission and the ADR says so. What
    // this asserts is that the default view does not surface it, not that it is
    // protected.
    await renderRobot("R-118");

    expect(screen.queryByText(/Shown exactly as the vendor sent it/)).toBeNull();
  });

  it("fabricates nothing for a robot that has never reported", async () => {
    await renderRobot("R-233");

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
    await renderRobot("R-118");
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
    expect(
      within(getCapabilitiesSection()).getByRole("heading", { level: 3, name: "Dock" }),
    ).toBeInTheDocument();
  });

  it("answers an unknown id with an empty state, not an error banner", async () => {
    await renderRobot("R-999");

    expect(screen.getByText("Robot not found")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to fleet" })).toHaveAttribute("href", "/");
  });

  it("shows battery history to the operator, directly after Summary", async () => {
    await renderRobot("R-118");

    const section = await screen.findByRole("region", { name: "Battery history" });
    expect(
      await within(section).findByRole("img", { name: /battery history for R-118/i }),
    ).toBeInTheDocument();
    // After Summary, before Capabilities: the spec's section order (ADR 33).
    const names = screen
      .getAllByRole("region")
      .map((region) => region.getAttribute("aria-labelledby"));
    expect(names.indexOf("section-battery-history")).toBeGreaterThan(
      names.indexOf("section-summary"),
    );
    expect(names.indexOf("section-battery-history")).toBeLessThan(
      names.indexOf("section-capabilities"),
    );
  });

  it("keeps the page standing when the history request fails, with an inline retry", async () => {
    vi.stubGlobal("fetch", createFixtureFetch({ historyFails: true }));
    await renderRobot("R-118");

    // The page's own data is untouched by the section's failure.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Robot R-118");
    expect(screen.getByRole("region", { name: "Summary" })).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Battery history" });
    expect(
      await within(section).findByText(/battery history could not be loaded/i),
    ).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Retry" })).toBeInTheDocument();

    // Retry, against a now-working stub, recovers the section in place.
    vi.stubGlobal("fetch", createFixtureFetch());
    await userEvent.click(within(section).getByRole("button", { name: "Retry" }));
    expect(
      await within(section).findByRole("img", { name: /battery history for R-118/i }),
    ).toBeInTheDocument();
  });

  it("renders a history contract failure terminally, with no retry", async () => {
    vi.stubGlobal("fetch", createFixtureFetch({ history: { schemaVersion: "999" } }));
    await renderRobot("R-118");

    const section = screen.getByRole("region", { name: "Battery history" });
    expect(await within(section).findByText(/battery history is unavailable/i)).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("says so when nothing was retained, rather than charting an empty window", async () => {
    // R-233 has never reported; its history is the contract's empty response.
    await renderRobot("R-233");

    const section = screen.getByRole("region", { name: "Battery history" });
    expect(
      await within(section).findByText(/no telemetry retained in the last 60 seconds/i),
    ).toBeInTheDocument();
  });

  it("leaves the technician toggle and its sections untouched by history", async () => {
    vi.stubGlobal("fetch", createFixtureFetch({ historyFails: true }));
    await renderRobot("R-118");
    await showTechnicianView();

    expect(screen.getByRole("region", { name: "Diagnostics" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Raw payload" })).toBeInTheDocument();
  });
});

describe("live detail reconciliation", () => {
  /** R-118's canonical envelope as a stream delta would carry it. */
  function buildLiveEnvelope(over: Partial<CanonicalEnvelope["core"]> = {}): CanonicalEnvelope {
    return {
      schemaVersion: SCHEMA_VERSION,
      robotId: "R-118",
      siteId: "zone-a",
      vendorId: "A",
      model: "Courier 4",
      adapterId: "vendor-a",
      adapterVersion: "1.4.0",
      reportedAt: Date.now(),
      receivedAt: Date.now(),
      freshness: "live",
      core: {
        connectivity: "online",
        batteryPercent: 42,
        position: null,
        status: "busy",
        health: { severity: "nominal" },
        ...over,
      },
      capabilities: {},
    };
  }

  async function renderWithStore(store: ReturnType<typeof createFleetStore>): Promise<void> {
    render(
      <FleetStoreContext.Provider value={store}>
        <ConnectionContext.Provider value="connected">
          <MemoryRouter initialEntries={["/robots/R-118"]}>
            <Routes>
              <Route path="/robots/:id" element={<RobotDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ConnectionContext.Provider>
      </FleetStoreContext.Provider>,
    );
    await waitForElementToBeRemoved(() => screen.queryByText("Loading robot…"));
  }

  it("updates core values from a stream delta without refetching", async () => {
    const fetchSpy = vi.fn(createFixtureFetch());
    vi.stubGlobal("fetch", fetchSpy);
    const store = createFleetStore();
    await renderWithStore(store);

    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("91%")).toBeInTheDocument();
    const fetchesAfterLoad = fetchSpy.mock.calls.length;

    // One delta naming this robot: the page's row subscription applies it over
    // the fetched detail, and no request leaves the console.
    store.applyBatch({
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence: 2,
      sentAt: Date.now(),
      robots: [buildLiveEnvelope()],
    });

    expect(await within(summary).findByText("42%")).toBeInTheDocument();
    expect(fetchSpy.mock.calls.length).toBe(fetchesAfterLoad);
  });
});

describe("stream diagnostics in the technician view", () => {
  it("shows the session-wide rejected-frame count with its scope stated", async () => {
    render(
      <StreamDiagnosticsContext.Provider value={{ rejectedFrames: 7 }}>
        <ConnectionContext.Provider value="connected">
          <MemoryRouter initialEntries={["/robots/R-118"]}>
            <Routes>
              <Route path="/robots/:id" element={<RobotDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ConnectionContext.Provider>
      </StreamDiagnosticsContext.Provider>,
    );
    await waitForElementToBeRemoved(() => screen.queryByText("Loading robot…"));
    await showTechnicianView();

    const diagnostics = screen.getByRole("region", { name: "Diagnostics" });
    // The label names the true scope: the console's own session, all robots —
    // never a per-robot precision the counter does not have (Principle 11).
    expect(
      within(diagnostics).getByText("Rejected stream frames (console session, all robots)"),
    ).toBeInTheDocument();
    expect(within(diagnostics).getByText("7")).toBeInTheDocument();
  });

  it("is absent from the operator view, like every diagnostics row", async () => {
    await renderRobot("R-118");

    expect(screen.queryByText(/Rejected stream frames/)).toBeNull();
  });
});
