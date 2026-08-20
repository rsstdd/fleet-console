import { describe, expect, it } from "vitest";

import type { Freshness, Robot, RobotDetail, RobotDiagnostics, RobotStatus } from "./model";
import {
  selectBatteryDisplay,
  selectClockDeltaDisplay,
  selectFreshnessSummary,
  selectPanelCapabilities,
  selectPositionDisplay,
  selectSequenceDuplicateDisplay,
  selectSequenceGapDisplay,
  selectStatusPresentation,
} from "./selectors";

/**
 * Unit tests for the robot presentation selectors, required by
 * docs/02_component-specs/01_STATUS_CHIP.md §11 ("Mapping") and
 * docs/01_page-specs/02_FLEET.md §6. These are pure functions over the read
 * model — no React, no clock, no fixtures beyond the literal below
 * (Principle 10). Freshness arrives as a field and is never derived here
 * (ADR 3), so there is nothing to inject a time into.
 */
function robot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: "r-1",
    vendor: "A",
    siteId: "site-1",
    observed: true,
    model: "Model A",
    connectivity: "online",
    position: null,
    capabilities: {},
    status: "idle",
    health: { severity: "nominal" },
    freshness: "live",
    batteryPercent: 50,
    lastSeenAt: "2026-08-19T10:00:00.000Z",
    ...overrides,
  };
}

const NOT_LIVE: readonly Freshness[] = ["stale", "unreachable", "unknown"];

describe("selectStatusPresentation", () => {
  it("maps each canonical status to its variant and label", () => {
    const expected: Record<RobotStatus, { variant: string; label: string }> = {
      idle: { variant: "neutral", label: "Idle" },
      busy: { variant: "active", label: "Busy" },
      charging: { variant: "charging", label: "Charging" },
      fault: { variant: "fault", label: "Fault" },
      unknown: { variant: "unknown", label: "Unknown" },
    };

    for (const [status, want] of Object.entries(expected) as [
      RobotStatus,
      { variant: string; label: string },
    ][]) {
      const presentation = selectStatusPresentation(robot({ status }));
      expect(presentation.variant).toBe(want.variant);
      expect(presentation.label).toBe(want.label);
    }
  });

  it("shows degraded health in place of a non-fault status", () => {
    for (const status of ["idle", "busy", "charging", "unknown"] as const) {
      const presentation = selectStatusPresentation(
        robot({ status, health: { severity: "degraded" } }),
      );
      // The variant reports the health severity; the label still names the
      // status, so the two facts are not collapsed into one word.
      expect(presentation.variant).toBe("degraded");
    }
  });

  it("keeps fault as fault when health is also degraded", () => {
    const presentation = selectStatusPresentation(
      robot({ status: "fault", health: { severity: "degraded" } }),
    );

    expect(presentation.variant).toBe("fault");
    expect(presentation.label).toBe("Fault");
  });

  it("shows critical health as fault whatever the status says", () => {
    // The chip is the only health signal on the fleet table (fleet spec §2),
    // so critical severity takes the danger colour rather than passing through
    // to the status colour (ADR 1, Observed consequences, 19 August 2026).
    for (const status of ["idle", "busy", "charging", "unknown"] as const) {
      const presentation = selectStatusPresentation(
        robot({ status, health: { severity: "critical" } }),
      );
      expect(presentation.variant).toBe("fault");
    }
  });

  it("keeps the status word in the label when critical health takes the variant", () => {
    const presentation = selectStatusPresentation(
      robot({ status: "idle", health: { severity: "critical" } }),
    );

    // Severity and status stay two facts. The label never claims the robot is
    // in fault status when what is critical is its health.
    expect(presentation).toEqual({ variant: "fault", label: "Idle", current: true });
  });

  it("ranks critical above degraded when both could apply", () => {
    // severity is a single field, so this guards the ordering of the branches
    // rather than a representable both-at-once state.
    expect(
      selectStatusPresentation(robot({ status: "busy", health: { severity: "critical" } })).variant,
    ).toBe("fault");
    expect(
      selectStatusPresentation(robot({ status: "busy", health: { severity: "degraded" } })).variant,
    ).toBe("degraded");
  });

  it("marks the presentation current only while freshness is live", () => {
    expect(selectStatusPresentation(robot({ freshness: "live" })).current).toBe(true);

    for (const freshness of NOT_LIVE) {
      expect(selectStatusPresentation(robot({ freshness })).current).toBe(false);
    }
  });

  it("qualifies the label with (last known) exactly once when not current", () => {
    for (const freshness of NOT_LIVE) {
      const presentation = selectStatusPresentation(robot({ status: "busy", freshness }));
      expect(presentation.label).toBe("Busy (last known)");
    }
  });

  it("leaves the label unqualified while live, so the chip is not falsely hedged", () => {
    expect(selectStatusPresentation(robot({ status: "busy" })).label).toBe("Busy");
  });

  it("qualifies the degraded variant's label with the status word, not the severity", () => {
    const presentation = selectStatusPresentation(
      robot({ status: "busy", freshness: "stale", health: { severity: "degraded" } }),
    );

    expect(presentation).toEqual({
      variant: "degraded",
      label: "Busy (last known)",
      current: false,
    });
  });
});

describe("selectBatteryDisplay", () => {
  it("renders the percentage while live", () => {
    expect(selectBatteryDisplay(robot({ batteryPercent: 0 }))).toBe("0%");
    expect(selectBatteryDisplay(robot({ batteryPercent: 87 }))).toBe("87%");
  });

  it("renders an em dash when the reading is not current", () => {
    for (const freshness of NOT_LIVE) {
      expect(selectBatteryDisplay(robot({ freshness, batteryPercent: 87 }))).toBe("—");
    }
  });

  it("renders an em dash when there is no reading at all", () => {
    expect(selectBatteryDisplay(robot({ batteryPercent: null }))).toBe("—");
  });
});

describe("selectFreshnessSummary", () => {
  it("returns zeroes for an empty fleet rather than an empty object", () => {
    expect(selectFreshnessSummary([])).toEqual({
      live: 0,
      stale: 0,
      unreachable: 0,
      unknown: 0,
    });
  });

  it("counts each state and totals the fleet exactly", () => {
    const fleet: readonly Robot[] = [
      robot({ id: "a", freshness: "live" }),
      robot({ id: "b", freshness: "live" }),
      robot({ id: "c", freshness: "stale" }),
      robot({ id: "d", freshness: "unreachable" }),
      robot({ id: "e", freshness: "unknown" }),
      robot({ id: "f", freshness: "unknown" }),
    ];

    const summary = selectFreshnessSummary(fleet);

    expect(summary).toEqual({ live: 2, stale: 1, unreachable: 1, unknown: 2 });
    // Mutually exclusive and exhaustive, per fleet spec §2.
    const total = summary.live + summary.stale + summary.unreachable + summary.unknown;
    expect(total).toBe(fleet.length);
  });

  it("counts freshness only, never status or health", () => {
    const fleet: readonly Robot[] = [
      robot({ id: "a", freshness: "live", status: "fault" }),
      robot({ id: "b", freshness: "live", health: { severity: "critical" } }),
    ];

    expect(selectFreshnessSummary(fleet)).toEqual({
      live: 2,
      stale: 0,
      unreachable: 0,
      unknown: 0,
    });
  });
});

function diagnostics(overrides: Partial<RobotDiagnostics> = {}): RobotDiagnostics {
  return {
    adapterId: "vendor-a",
    adapterVersion: "1.4.0",
    sequence: 12,
    sequenceHealth: { evaluated: true, gaps: 0, duplicates: 0 },
    vendorReportedAt: "2026-08-19T10:00:00.000Z",
    receivedAt: "2026-08-19T10:00:00.120Z",
    clockDeltaMs: 120,
    schemaVersion: "1",
    unknownFieldCount: 0,
    ...overrides,
  };
}

function detail(overrides: Partial<RobotDetail> = {}): RobotDetail {
  return {
    ...robot(),
    model: "Courier 4",
    connectivity: "online",
    position: { frame: "site-map", x: 41.24, y: 18.7 },
    capabilities: {},
    diagnostics: diagnostics(),
    rawPayload: null,
    ...overrides,
  };
}

describe("selectPanelCapabilities", () => {
  it("returns only the capabilities the robot declared", () => {
    const robotDetail = detail({
      capabilities: { dock: { docked: true, dockId: "dock-a3" } },
    });

    expect(selectPanelCapabilities(robotDetail)).toEqual(["dock"]);
  });

  it("excludes a panel the deployment disabled, even when the robot declares it", () => {
    // ADR 17's gate: declared by the robot AND enabled by the tenant. The
    // disabled list is injected rather than read from `config`, because the
    // dependency rule forbids entities importing it — and because whether a
    // panel is offered is a deployment question, not a domain one.
    const robotDetail = detail({
      capabilities: {
        dock: { docked: true, dockId: "dock-a3" },
        lidarHealth: { severity: "nominal", rpm: 600 },
      },
    });

    expect(selectPanelCapabilities(robotDetail, ["lidarHealth"])).toEqual(["dock"]);
  });

  it("offers every declared panel when nothing is disabled", () => {
    const robotDetail = detail({
      capabilities: {
        dock: { docked: true, dockId: "dock-a3" },
        lidarHealth: { severity: "nominal", rpm: 600 },
      },
    });

    expect(selectPanelCapabilities(robotDetail, [])).toEqual(["dock", "lidarHealth"]);
    expect(selectPanelCapabilities(robotDetail)).toEqual(["dock", "lidarHealth"]);
  });

  it("does not invent a panel a disabled flag would have hidden", () => {
    // Disabling a panel the robot never declared changes nothing. The two
    // conditions are independent, and neither one implies the other.
    const robotDetail = detail({
      capabilities: { dock: { docked: true, dockId: "dock-a3" } },
    });

    expect(selectPanelCapabilities(robotDetail, ["lidarHealth"])).toEqual(["dock"]);
  });

  it("excludes sequence, which is transport metadata rather than a panel", () => {
    const robotDetail = detail({
      capabilities: {
        dock: { docked: false, dockId: null },
        sequence: { value: 88_412 },
      },
    });

    expect(selectPanelCapabilities(robotDetail)).toEqual(["dock"]);
  });

  it("returns a stable order regardless of declaration order", () => {
    const declaredBackwards = detail({
      capabilities: {
        waterLevel: { percent: 62 },
        lidarHealth: { severity: "nominal", rpm: 600 },
        dock: { docked: false, dockId: null },
      },
    });

    // Fixed order: a delta that re-declares a capability must not reshuffle
    // the grid under the operator.
    expect(selectPanelCapabilities(declaredBackwards)).toEqual([
      "dock",
      "lidarHealth",
      "waterLevel",
    ]);
  });

  it("returns nothing for a robot that declares no capabilities", () => {
    expect(selectPanelCapabilities(detail())).toEqual([]);
  });
});

describe("selectPositionDisplay", () => {
  it("names the frame alongside the coordinates", () => {
    expect(selectPositionDisplay(detail())).toBe("site-map · 41.2, 18.7");
  });

  it("renders an em dash when the position is not current", () => {
    for (const freshness of NOT_LIVE) {
      expect(selectPositionDisplay(detail({ freshness }))).toBe("—");
    }
  });

  it("renders an em dash when there is no position at all", () => {
    expect(selectPositionDisplay(detail({ position: null }))).toBe("—");
  });
});

describe("selectClockDeltaDisplay", () => {
  it("signs the delta so the direction of the skew is readable", () => {
    expect(selectClockDeltaDisplay(detail())).toBe("+120 ms");
    expect(
      selectClockDeltaDisplay(detail({ diagnostics: diagnostics({ clockDeltaMs: -40 }) })),
    ).toBe("-40 ms");
  });

  it("renders an em dash when a timestamp is missing, never a zero", () => {
    expect(
      selectClockDeltaDisplay(detail({ diagnostics: diagnostics({ clockDeltaMs: null }) })),
    ).toBe("—");
  });
});

describe("selectSequenceGapDisplay", () => {
  it("reports a real count", () => {
    expect(
      selectSequenceGapDisplay(
        detail({
          diagnostics: diagnostics({
            sequenceHealth: { evaluated: true, gaps: 3, duplicates: 0 },
          }),
        }),
      ),
    ).toBe("3");
    expect(selectSequenceGapDisplay(detail())).toBe("0");
  });

  it("says not evaluated rather than zero when gaps are not checked", () => {
    // "0 gaps" for a robot nobody checks is a false statement to an operator
    // (ADR 1, Implications). Since ADR 25 the wrong answer is not reachable by
    // forgetting a check: there is no count on the unevaluated variant to read.
    expect(
      selectSequenceGapDisplay(
        detail({ diagnostics: diagnostics({ sequenceHealth: { evaluated: false } }) }),
      ),
    ).toBe("Not evaluated");
  });

  it("says not evaluated for a robot with no diagnostics at all", () => {
    expect(selectSequenceGapDisplay(detail({ diagnostics: null }))).toBe("Not evaluated");
  });

  it("distinguishes zero gaps from not evaluated, which is the whole point", () => {
    const evaluated = detail({
      diagnostics: diagnostics({ sequenceHealth: { evaluated: true, gaps: 0, duplicates: 0 } }),
    });
    const unevaluated = detail({
      diagnostics: diagnostics({ sequenceHealth: { evaluated: false } }),
    });

    expect(selectSequenceGapDisplay(evaluated)).toBe("0");
    expect(selectSequenceGapDisplay(unevaluated)).toBe("Not evaluated");
    expect(selectSequenceGapDisplay(evaluated)).not.toBe(selectSequenceGapDisplay(unevaluated));
  });
});

describe("selectSequenceDuplicateDisplay", () => {
  it("reports duplicates on the same terms as gaps", () => {
    expect(
      selectSequenceDuplicateDisplay(
        detail({
          diagnostics: diagnostics({
            sequenceHealth: { evaluated: true, gaps: 3, duplicates: 2 },
          }),
        }),
      ),
    ).toBe("2");
  });

  it("cannot disagree with gaps about whether the sequence was evaluated", () => {
    // Both read one field, so a robot can never report "not evaluated" gaps and
    // a duplicate count at the same time.
    const unevaluated = detail({
      diagnostics: diagnostics({ sequenceHealth: { evaluated: false } }),
    });

    expect(selectSequenceDuplicateDisplay(unevaluated)).toBe("Not evaluated");
    expect(selectSequenceGapDisplay(unevaluated)).toBe("Not evaluated");
  });
});
