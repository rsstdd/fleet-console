// Structural claims at the committed scale point (page spec 04 § 11, ADR 35;
// `fleetScale.test.tsx` is the precedent). No duration is asserted: jsdom has
// no layout or paint.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { Robot } from "@/entities/robot/model";
import type { FleetResourceState } from "@/entities/robot/fleetStore";
import { ConnectionContext } from "@/shared/lib/connectionContext";

/** The scale point ADR 2 commits to measuring, and the one Principle 12 names. */
const FLEET_SIZE = 500;

/** Sites in the fixture directory; robots are spread round-robin across them. */
const SITE_COUNT = 3;

const fleet = vi.hoisted((): { state: FleetResourceState } => ({
  state: { kind: "loading" },
}));

vi.mock("@/entities/robot/useFleetRobots", () => ({
  useFleetRobots: (): FleetResourceState => fleet.state,
}));

const { MapPage } = await import("./mapPage");

/**
 * A fleet of `size` robots round-robin across three sites, every robot
 * positioned on a deterministic grid inside the simulator's ±40 m box.
 */
function buildFleet(size: number): Robot[] {
  const sites = ["zone-a", "zone-b", "zone-c"] as const;
  return Array.from({ length: size }, (_, index) => {
    const siteId = sites[index % SITE_COUNT] ?? "zone-a";
    return {
      id: `R-${String(index).padStart(4, "0")}`,
      vendor: (["A", "B", "C"] as const)[index % 3] ?? "A",
      siteId,
      observed: true,
      model: "Model X",
      connectivity: "online" as const,
      position: { frame: siteId, x: (index % 80) - 40, y: (index % 60) - 30 },
      capabilities: {},
      status: "idle" as const,
      health: { severity: "nominal" as const },
      freshness: "live" as const,
      batteryPercent: 50,
      lastSeenAt: "2026-08-19T10:00:00.000Z",
    };
  });
}

function renderMap(size: number): void {
  fleet.state = {
    kind: "ready",
    data: {
      robots: buildFleet(size),
      sites: [
        { siteId: "zone-a", label: "Zone A" },
        { siteId: "zone-b", label: "Zone B" },
        { siteId: "zone-c", label: "Zone C" },
      ],
      capturedAt: Date.UTC(2026, 7, 19, 10, 0, 5),
      latestFrameAt: null,
    },
  };
  render(
    <ConnectionContext.Provider value="connected">
      <MemoryRouter>
        <MapPage />
      </MemoryRouter>
    </ConnectionContext.Provider>,
  );
}

/** Loose for the same reason fleetScale's is: never a performance gate. */
const RENDER_TIMEOUT_MS = 30_000;

/** 500 across three sites round-robin: zone-a takes the extra robot. */
const SELECTED_SITE_SIZE = Math.ceil(FLEET_SIZE / SITE_COUNT);

describe(`map at ${String(FLEET_SIZE)} robots`, () => {
  it(
    "draws markers for the selected site only",
    () => {
      renderMap(FLEET_SIZE);

      const markers = screen.getByRole("img", { name: /Map of Zone A/ }).querySelectorAll("circle");

      expect(markers).toHaveLength(SELECTED_SITE_SIZE);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    "keeps the keyboard cost at one list link per robot, with zero marker tab stops",
    () => {
      renderMap(FLEET_SIZE);

      // The side list is the sole activation path; markers are not focusable (page spec 04 § 2).
      const list = screen.getByRole("region", { name: "Robots" });
      const links = within(list).getAllByRole("link");
      expect(links).toHaveLength(SELECTED_SITE_SIZE);

      const canvas = screen.getByRole("img", { name: /Map of Zone A/ });
      expect(canvas.querySelectorAll("a, [tabindex]")).toHaveLength(0);
    },
    RENDER_TIMEOUT_MS,
  );

  it(
    "states the positioned accounting for the selected site",
    () => {
      renderMap(FLEET_SIZE);

      const count = String(SELECTED_SITE_SIZE);
      expect(screen.getByText(`${count} of ${count} robots positioned`)).toBeInTheDocument();
    },
    RENDER_TIMEOUT_MS,
  );
});
