import { describe, expect, it } from "vitest";
import {
  NO_HONEST_VALUE,
  selectBatteryDisplay,
  selectFreshnessSummary,
  selectPanelCapabilities,
  selectSequenceDisplay,
  selectStatusPresentation,
} from "@/utils/robotSelectors";
import type { Robot, RobotDetail } from "@/types/robot";

function robot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: "R-001",
    vendor: "A",
    siteId: "SITE-NORTH",
    observed: true,
    model: "AX-200",
    connectivity: "unknown",
    position: { frame: "SITE-NORTH", x: 1, y: 2 },
    capabilities: { dock: { docked: false, dockId: null } },
    status: "busy",
    health: { severity: "nominal" },
    freshness: "live",
    batteryPercent: 80,
    lastSeenAt: "2026-08-26T10:00:00.000Z",
    ...overrides,
  };
}

describe("selectStatusPresentation", () => {
  it("shows a live status plainly", () => {
    expect(selectStatusPresentation(robot())).toMatchObject({ label: "Busy", isCurrent: true });
  });

  it("marks a status the server no longer vouches for as last known", () => {
    const presentation = selectStatusPresentation(robot({ freshness: "stale" }));
    expect(presentation.label).toBe("Busy (last known)");
    expect(presentation.isCurrent).toBe(false);
  });

  it("lets critical health override the status colour", () => {
    expect(selectStatusPresentation(robot({ health: { severity: "critical" } })).variant).toBe(
      "fault",
    );
  });
});

describe("selectBatteryDisplay", () => {
  it("shows a reading only when it is live and the stream is up", () => {
    expect(selectBatteryDisplay(robot(), true)).toBe("80%");
  });

  it("withholds the reading while the stream is down", () => {
    expect(selectBatteryDisplay(robot(), false)).toBe(NO_HONEST_VALUE);
  });

  it("withholds a stale reading even while connected", () => {
    expect(selectBatteryDisplay(robot({ freshness: "stale" }), true)).toBe(NO_HONEST_VALUE);
  });
});

describe("selectFreshnessSummary", () => {
  it("counts each freshness state across the fleet", () => {
    const summary = selectFreshnessSummary([
      robot({ freshness: "live" }),
      robot({ freshness: "stale" }),
      robot({ freshness: "stale" }),
    ]);
    expect(summary).toEqual({ live: 1, stale: 2, unreachable: 0, unknown: 0 });
  });
});

describe("selectPanelCapabilities", () => {
  it("returns only the operator capabilities a robot declares", () => {
    expect(selectPanelCapabilities(robot())).toEqual(["dock"]);
  });

  it("never surfaces a diagnostic capability as an operator panel", () => {
    expect(selectPanelCapabilities(robot({ capabilities: { sequence: { value: 3 } } }))).toEqual(
      [],
    );
  });
});

describe("selectSequenceDisplay", () => {
  const detail = (evaluated: boolean): RobotDetail => ({
    ...robot(),
    rawPayload: null,
    diagnostics: {
      adapterId: "vendor-a",
      adapterVersion: "1.0.0",
      sequence: 3,
      sequenceHealth: evaluated
        ? { evaluated: true, gaps: 0, duplicates: 0 }
        : { evaluated: false },
      vendorReportedAt: null,
      receivedAt: null,
      clockDeltaMs: null,
      schemaVersion: "3",
    },
  });

  it("says so when continuity was never evaluated, rather than reporting zero", () => {
    expect(selectSequenceDisplay(detail(false), "gaps")).toBe("Not evaluated");
  });

  it("reports a real zero when continuity was evaluated", () => {
    expect(selectSequenceDisplay(detail(true), "gaps")).toBe("0");
  });
});
