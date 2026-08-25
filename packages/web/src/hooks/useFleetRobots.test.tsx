import { act, render, renderHook } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SCHEMA_VERSION, type FleetSnapshot } from "@fleet/contracts";

import { createFleetStore, type FleetStore } from "@/stores/fleetStore";
import { FleetStoreContext } from "@/stores/fleetStoreContext";
import { useFleetRobot, useFleetRobots, useFleetSites } from "./useFleetRobots";

type CommitPhase = Parameters<ProfilerOnRenderCallback>[1];

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

function buildStoreWrapper(store: FleetStore) {
  return ({ children }: { readonly children: ReactNode }): ReactNode => (
    <FleetStoreContext.Provider value={store}>{children}</FleetStoreContext.Provider>
  );
}

describe("useFleetRobots", () => {
  it("reports loading without a provider, because nothing is known", () => {
    const { result } = renderHook(() => useFleetRobots());

    expect(result.current).toStrictEqual({ kind: "loading" });
  });

  it("reads the store the transport is filling", () => {
    const store = createFleetStore();
    store.applySnapshot(buildSnapshot([buildRegisteredRobot("R-001")]));

    const { result } = renderHook(() => useFleetRobots(), { wrapper: buildStoreWrapper(store) });

    const state = result.current;
    if (state.kind !== "ready") throw new Error(`unexpected ${state.kind}`);
    expect(state.data.robots.map((robot) => robot.id)).toStrictEqual(["R-001"]);
    expect(state.data.sites).toStrictEqual([{ siteId: "SITE-NORTH", label: "North site" }]);
  });

  it("re-renders when a later snapshot changes the fleet", async () => {
    const store = createFleetStore();
    const { result } = renderHook(() => useFleetRobots(), { wrapper: buildStoreWrapper(store) });
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
  it("returns one robot's row by id, and undefined for an id the fleet never carried", () => {
    const store = createFleetStore();
    store.applySnapshot(buildSnapshot([buildRegisteredRobot("R-001")]));
    const wrapper = buildStoreWrapper(store);

    const known = renderHook(() => useFleetRobot("R-001"), { wrapper });
    const unknown = renderHook(() => useFleetRobot("R-999"), { wrapper });

    expect(known.result.current?.id).toBe("R-001");
    expect(unknown.result.current).toBeUndefined();
  });
});

describe("useFleetSites", () => {
  it("does not commit again when a resource transition retains the site directory", () => {
    const store = createFleetStore((notify) => {
      notify();
    });
    store.applySnapshot(buildSnapshot([]));
    const committedPhases: CommitPhase[] = [];
    const recordCommit: ProfilerOnRenderCallback = (_id, phase) => {
      committedPhases.push(phase);
    };
    const SiteDirectorySubscriber = (): null => {
      useFleetSites();
      return null;
    };

    render(
      <FleetStoreContext.Provider value={store}>
        <Profiler id="site-directory" onRender={recordCommit}>
          <SiteDirectorySubscriber />
        </Profiler>
      </FleetStoreContext.Provider>,
    );
    expect(committedPhases).toStrictEqual(["mount"]);

    act(() => {
      store.snapshotStart();
    });

    expect(committedPhases).toStrictEqual(["mount"]);
  });
});
