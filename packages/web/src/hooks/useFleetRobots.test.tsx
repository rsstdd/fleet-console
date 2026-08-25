import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SCHEMA_VERSION, type FleetSnapshot } from "@fleet/contracts";

import { createFleetStore } from "@/stores/fleetStore";
import { FleetStoreContext } from "@/stores/fleetStoreContext";
import { useFleetRobot, useFleetRobots } from "./useFleetRobots";

/**
 * The join between the transport boundary in `app` and the hooks here, which
 * cannot see each other through the import graph (ADR 4).
 */
describe("useFleetRobots", () => {
  function buildRegisteredRobot(robotId: string) {
    return {
      schemaVersion: SCHEMA_VERSION,
      robotId,
      siteId: "SITE-NORTH",
      vendorId: "A",
      freshness: "unknown",
    } as const;
  }

  function buildSnapshot(robots: FleetSnapshot["robots"], flushSequence = 0): FleetSnapshot {
    return {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence,
      capturedAt: 0,
      sites: [{ siteId: "SITE-NORTH", label: "North site" }],
      robots,
    };
  }

  it("reports loading without a provider, because nothing is known", () => {
    // A fixture default would make a missing provider invisible; a visible loading state
    // is the same asymmetry that made `disconnected` the connection default.
    const { result } = renderHook(() => useFleetRobots());

    expect(result.current).toStrictEqual({ kind: "loading" });
  });

  it("reads the store the transport is filling", () => {
    const store = createFleetStore();
    store.applySnapshot(buildSnapshot([buildRegisteredRobot("R-001")]));
    const Wrapper = ({ children }: { readonly children: ReactNode }): ReactNode => (
      <FleetStoreContext.Provider value={store}>{children}</FleetStoreContext.Provider>
    );

    const { result } = renderHook(() => useFleetRobots(), { wrapper: Wrapper });

    const state = result.current;
    if (state.kind !== "ready") throw new Error(`unexpected ${state.kind}`);
    expect(state.data.robots.map((robot) => robot.id)).toStrictEqual(["R-001"]);
    expect(state.data.sites).toStrictEqual([{ siteId: "SITE-NORTH", label: "North site" }]);
  });

  it("re-renders when a later snapshot changes the fleet", async () => {
    const store = createFleetStore();
    const Wrapper = ({ children }: { readonly children: ReactNode }): ReactNode => (
      <FleetStoreContext.Provider value={store}>{children}</FleetStoreContext.Provider>
    );
    const { result } = renderHook(() => useFleetRobots(), { wrapper: Wrapper });
    expect(result.current.kind).toBe("loading");

    store.applySnapshot(
      buildSnapshot([buildRegisteredRobot("R-001"), buildRegisteredRobot("R-002")], 1),
    );

    await vi.waitFor(() => {
      const state = result.current;
      if (state.kind !== "ready") throw new Error(`unexpected ${state.kind}`);
      expect(state.data.robots).toHaveLength(2);
    });
  });
});

describe("useFleetRobot", () => {
  function buildSnapshotWithRobots(robotIds: readonly string[]): FleetSnapshot {
    return {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence: 0,
      capturedAt: 0,
      sites: [{ siteId: "SITE-NORTH", label: "North site" }],
      robots: robotIds.map((robotId) => ({
        schemaVersion: SCHEMA_VERSION,
        robotId,
        siteId: "SITE-NORTH",
        vendorId: "A",
        freshness: "unknown" as const,
      })),
    };
  }

  it("returns one robot's row by id, and undefined for an id the fleet never carried", () => {
    const store = createFleetStore();
    store.applySnapshot(buildSnapshotWithRobots(["R-001"]));
    const Wrapper = ({ children }: { readonly children: ReactNode }): ReactNode => (
      <FleetStoreContext.Provider value={store}>{children}</FleetStoreContext.Provider>
    );

    const known = renderHook(() => useFleetRobot("R-001"), { wrapper: Wrapper });
    const unknown = renderHook(() => useFleetRobot("R-999"), { wrapper: Wrapper });

    expect(known.result.current?.id).toBe("R-001");
    expect(unknown.result.current).toBeUndefined();
  });
});
