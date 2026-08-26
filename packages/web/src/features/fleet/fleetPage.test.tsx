import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { SCHEMA_VERSION, type CanonicalEnvelope, type FleetSnapshot } from "@fleet/contracts";
import { createFleetStore } from "@/stores/fleetStore";
import { FleetProvider } from "@/context/fleetContext";
import type { ConnectionState } from "@/lib/fleetTransport";
import { FleetPage } from "@/features/fleet/fleetPage";

const SESSION = "3f1a5d2c-8b7e-4c9a-9f2d-6e5b4a3c2d1e";

const observed = (
  robotId: string,
  overrides: Partial<CanonicalEnvelope["core"]> & {
    freshness?: CanonicalEnvelope["freshness"];
  } = {},
): CanonicalEnvelope => {
  const { freshness = "live", ...core } = overrides;
  return {
    schemaVersion: SCHEMA_VERSION,
    robotId,
    siteId: "SITE-NORTH",
    vendorId: "A",
    model: "AX-200",
    adapterId: "vendor-a",
    adapterVersion: "1.0.0",
    reportedAt: 1000,
    receivedAt: 1000,
    freshness,
    capabilities: {},
    core: {
      connectivity: "unknown",
      batteryPercent: 80,
      position: { frame: "SITE-NORTH", x: 1, y: 2 },
      status: "busy",
      health: { severity: "nominal" },
      ...core,
    },
  };
};

const snapshot: FleetSnapshot = {
  schemaVersion: SCHEMA_VERSION,
  serverSessionId: SESSION,
  flushSequence: 1,
  capturedAt: 1000,
  sites: [
    { siteId: "SITE-NORTH", label: "North site" },
    { siteId: "SITE-SOUTH", label: "South site" },
  ],
  robots: [observed("R-001"), observed("R-002", { freshness: "stale" })],
};

function renderPage(connection: ConnectionState = "connected") {
  const store = createFleetStore((notify) => {
    notify();
  });
  store.applySnapshot(snapshot);
  return render(
    <MemoryRouter>
      <FleetProvider value={{ store, connection, rejectedFrames: 0 }}>
        <FleetPage />
      </FleetProvider>
    </MemoryRouter>,
  );
}

describe("FleetPage", () => {
  const table = () => within(screen.getByRole("table", { name: "Fleet" }));

  it("filters the table by freshness", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("combobox", { name: "Freshness" }));
    await userEvent.click(screen.getByRole("option", { name: "STALE" }));

    expect(table().queryByRole("link", { name: "R-001" })).not.toBeInTheDocument();
    expect(table().getByRole("link", { name: "R-002" })).toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 2 robots/)).toBeInTheDocument();
  });

  it("explains an empty result rather than showing a blank table", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("Search"), "nothing-matches");
    expect(screen.getByText("No robots match these filters.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
