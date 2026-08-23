// What the fleet table actually does at the committed scale point, and what is
// still unknown about it (ADR 24, register D14).
//
// Principle 12 asks for a table that stays usable at several hundred robots, and
// this page renders `filteredRobots.map(...)` with no windowing. ADR 24 decided
// not to virtualize yet, and this file is the evidence that decision rests on:
// at 500 robots the page is **correct** — every robot has a row, the counts are
// right, and filtering still narrows to one — which is what makes the narrowed
// claim in `PRINCIPLES.md` and `README.md` § 10 defensible rather than hopeful.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not assert a duration, and it
// does not publish one as a ceiling. This runs in jsdom, which has no layout, no
// paint and no compositor, so a millisecond figure from here says nothing about
// a browser and would be worse than no number at all — a measurement taken
// against a fixture, which is exactly what ADR 24 refused to decide on. The
// number that decides virtualization is delta-apply cost under a live stream at
// 500 robots, and it cannot be taken until `packages/server` fans out (server
// **I2**, register D10's deferred half).
//
// This file is also the tripwire for that future change. Virtualizing the table
// makes the row-count assertion below fail, which forces whoever does it to come
// back and restate the claim in the same commit rather than leaving the docs
// describing a table that no longer exists.
//
// THE TIMEOUT IS DELIBERATELY LOOSE, AND THAT IS THE POINT. Rendering 500 rows in
// jsdom costs 3–4 s unloaded here and crosses Vitest's 5 s default when the rest of
// the suite is competing for the machine — so this file, which refuses to assert a
// duration, was failing on an undeclared one. `packages/FIXME.md` F14 warns against
// widening a timeout to make a transient failure go away, and this is not that: the
// cause is known and measured, and the 5 s being replaced is Vitest's default, a
// number nobody derived. 30 s is roughly eight times the unloaded cost, chosen to be
// unreachable by scheduling noise and therefore never a performance gate. If these
// tests ever approach it, the answer is to investigate the render, not to raise it.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { Robot } from "@/entities/robot/model";
import type { FleetResourceState } from "@/entities/robot/fleetStore";

/** The scale point ADR 2 commits to measuring, and the one Principle 12 names. */
const FLEET_SIZE = 500;

const fleet = vi.hoisted((): { state: FleetResourceState } => ({
  state: { kind: "loading" },
}));

vi.mock("@/entities/robot/useFleetRobots", () => ({
  useFleetRobots: (): FleetResourceState => fleet.state,
}));

const { FleetPage } = await import("./fleetPage");

/**
 * A fleet of `size` robots with a deterministic spread of freshness states.
 *
 * Every fourth robot takes the next state, so the summary counts are known
 * arithmetic rather than something the test has to recount from the fixture.
 */
function buildFleet(size: number): Robot[] {
  const freshness = ["live", "stale", "unreachable", "unknown"] as const;
  return Array.from({ length: size }, (_, index) => ({
    id: `R-${String(index).padStart(4, "0")}`,
    vendor: (["A", "B", "C"] as const)[index % 3] ?? "A",
    siteId: index % 2 === 0 ? "zone-a" : "zone-b",
    observed: true,
    model: "Model X",
    connectivity: "online" as const,
    position: null,
    capabilities: {},
    status: "idle" as const,
    health: { severity: "nominal" as const },
    freshness: freshness[index % freshness.length] ?? "live",
    batteryPercent: 50,
    lastSeenAt: "2026-08-19T10:00:00.000Z",
  }));
}

function renderFleet(size: number): void {
  fleet.state = {
    kind: "ready",
    data: {
      robots: buildFleet(size),
      sites: [
        { siteId: "zone-a", label: "Zone A" },
        { siteId: "zone-b", label: "Zone B" },
      ],
      capturedAt: Date.UTC(2026, 7, 19, 10, 0, 5),
      latestFrameAt: null,
    },
  };
  render(
    <MemoryRouter>
      <FleetPage />
    </MemoryRouter>,
  );
}

/**
 * Eight times the unloaded cost of the slowest case. Not a performance budget — see the
 * file comment; it exists so that Vitest's undeclared 5 s default cannot become one.
 */
const RENDER_TIMEOUT_MS = 30_000;

describe(`fleet table at ${String(FLEET_SIZE)} robots`, () => {
  it(
    "renders one row per robot — the table is not windowed, and that is the claim",
    () => {
      renderFleet(FLEET_SIZE);

      const rows = within(screen.getByRole("table", { name: "Fleet" })).getAllByRole("row");

      // Header row plus one body row per robot. If this fails because the number
      // dropped to roughly a screenful, the table has been virtualized: that is a
      // decision, not a refactor, and it changes ADR 24, PRINCIPLES.md § 12 and
      // README § 10 along with this line.
      expect(rows).toHaveLength(FLEET_SIZE + 1);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    "keeps exactly one activation path per row at that size",
    () => {
      renderFleet(FLEET_SIZE);

      // Page spec §2: the robot id link is the only way into a robot, and a row is
      // neither clickable nor focusable. At ten rows that is easy to hold; at 500
      // it is the difference between a keyboard user tabbing 500 times and 1,000.
      const links = within(screen.getByRole("table", { name: "Fleet" })).getAllByRole("link");

      expect(links).toHaveLength(FLEET_SIZE);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    "summarises the whole fleet correctly at that size",
    () => {
      renderFleet(FLEET_SIZE);

      // 500 robots, four states, every fourth robot: 125 each. Read through the
      // documented `stat__*` selectors, as `fleetPage.test.tsx` does — "Live" is
      // both a summary label and a freshness label on every row, so a text query
      // finds 126 of them.
      const stats = [...document.querySelectorAll<HTMLElement>(".stat")];
      const counts = Object.fromEntries(
        stats.map((stat) => [
          stat.querySelector(".stat__label")?.textContent ?? "",
          Number(stat.querySelector(".stat__value")?.textContent ?? "0"),
        ]),
      );

      expect(counts).toEqual({ Live: 125, Stale: 125, Unreachable: 125, Unknown: 125 });
      expect(screen.getByText(`of ${String(FLEET_SIZE)}`)).toBeInTheDocument();
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    "still narrows to a single robot through the search filter",
    async () => {
      const user = userEvent.setup();
      renderFleet(FLEET_SIZE);

      await user.type(screen.getByLabelText("Search"), "R-0499");

      const rows = within(screen.getByRole("table", { name: "Fleet" })).getAllByRole("row");

      expect(rows).toHaveLength(2);
      expect(screen.getByRole("link", { name: "R-0499" })).toBeInTheDocument();
    },
    RENDER_TIMEOUT_MS,
  );
});
