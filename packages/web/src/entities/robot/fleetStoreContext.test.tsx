import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";

import { createFleetStore } from "./fleetStore";
import { FleetStoreContext } from "./fleetStoreContext";
import { useFleetRobots } from "./useFleetRobots";

/**
 * The join between the transport boundary in `app` and the hooks in `entities`, which
 * cannot see each other through the import graph (ADR 4).
 */
describe("useFleetRobots", () => {
  function registered(robotId: string) {
    return {
      schemaVersion: SCHEMA_VERSION,
      robotId,
      siteId: "SITE-NORTH",
      vendorId: "A",
      freshness: "unknown",
    } as const;
  }

  it("knows about no robots without a provider", () => {
    // A fixture default would make a missing provider invisible; emptiness shows on the
    // screen, which is the same asymmetry that made `disconnected` the connection default.
    const { result } = renderHook(() => useFleetRobots());

    expect(result.current).toStrictEqual([]);
  });

  it("reads the store the transport is filling", () => {
    const store = createFleetStore();
    store.applySnapshot({
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence: 0,
      capturedAt: 0,
      robots: [registered("R-001")],
    });
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <FleetStoreContext.Provider value={store}>{children}</FleetStoreContext.Provider>
    );

    const { result } = renderHook(() => useFleetRobots(), { wrapper });

    expect(result.current.map((robot) => robot.id)).toStrictEqual(["R-001"]);
  });

  it("re-renders when a later snapshot changes the fleet", async () => {
    const store = createFleetStore();
    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <FleetStoreContext.Provider value={store}>{children}</FleetStoreContext.Provider>
    );
    const { result } = renderHook(() => useFleetRobots(), { wrapper });
    expect(result.current).toHaveLength(0);

    store.applySnapshot({
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence: 1,
      capturedAt: 0,
      robots: [registered("R-001"), registered("R-002")],
    });

    await vi.waitFor(() => {
      expect(result.current).toHaveLength(2);
    });
  });
});
