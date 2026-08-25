import { describe, expect, it } from "vitest";

import type {
  Freshness,
  Position,
  Robot,
  RobotDetail,
  RobotDiagnostics,
  RobotStatus,
} from "@/types/robot";
import {
  computeSiteExtents,
  computeViewBoxSize,
  mergeExtents,
  projectToViewBox,
  selectBatteryDisplay,
  selectClockDeltaDisplay,
  selectFreshnessSummary,
  selectMapMarker,
  selectPanelCapabilities,
  selectPlottableRobots,
  selectPositionDisplay,
  selectPositionedSummary,
  selectSequenceDuplicateDisplay,
  selectSequenceGapDisplay,
  selectSiteRobots,
  selectStatusPresentation,
  selectUnpositionedRobots,
  type PlottableRobot,
} from "./robotSelectors";

/**
 * Unit tests for the robot presentation selectors, required by
 * docs/02_component-specs/01_STATUS_CHIP.md §11 ("Mapping") and
 * docs/01_page-specs/02_FLEET.md §6. These are pure functions over the read
 * model — no React, no clock, no fixtures beyond the literal below
 * (Principle 10). Freshness arrives as a field and is never derived here
 * (ADR 3), so there is nothing to inject a time into.
 */
function buildRobot(overrides: Partial<Robot> = {}): Robot {
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
    const expected = {
      idle: { variant: "neutral", label: "Idle" },
      busy: { variant: "active", label: "Busy" },
      charging: { variant: "charging", label: "Charging" },
      fault: { variant: "fault", label: "Fault" },
      unknown: { variant: "unknown", label: "Unknown" },
    } satisfies Record<RobotStatus, { readonly variant: string; readonly label: string }>;

    // The exhaustive record is also the iteration source, so every status reaches an assertion.
    const isRobotStatus = (value: string): value is RobotStatus => value in expected;

    for (const status of Object.keys(expected)) {
      if (!isRobotStatus(status)) {
        throw new Error(`the expected map carried a non-canonical status: ${status}`);
      }
      const want = expected[status];
      const presentation = selectStatusPresentation(buildRobot({ status }));
      expect(presentation.variant).toBe(want.variant);
      expect(presentation.label).toBe(want.label);
    }
  });

  it("shows degraded health in place of a non-fault status", () => {
    for (const status of ["idle", "busy", "charging", "unknown"] as const) {
      const presentation = selectStatusPresentation(
        buildRobot({ status, health: { severity: "degraded" } }),
      );
      // The variant reports the health severity; the label still names the
      // status, so the two facts are not collapsed into one word.
      expect(presentation.variant).toBe("degraded");
    }
  });

  it("keeps fault as fault when health is also degraded", () => {
    const presentation = selectStatusPresentation(
      buildRobot({ status: "fault", health: { severity: "degraded" } }),
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
        buildRobot({ status, health: { severity: "critical" } }),
      );
      expect(presentation.variant).toBe("fault");
    }
  });

  it("keeps the status word in the label when critical health takes the variant", () => {
    const presentation = selectStatusPresentation(
      buildRobot({ status: "idle", health: { severity: "critical" } }),
    );

    // Severity and status stay two facts. The label never claims the robot is
    // in fault status when what is critical is its health.
    expect(presentation).toEqual({ variant: "fault", label: "Idle", isCurrent: true });
  });

  it("ranks critical above degraded when both could apply", () => {
    // severity is a single field, so this guards the ordering of the branches
    // rather than a representable both-at-once state.
    expect(
      selectStatusPresentation(buildRobot({ status: "busy", health: { severity: "critical" } }))
        .variant,
    ).toBe("fault");
    expect(
      selectStatusPresentation(buildRobot({ status: "busy", health: { severity: "degraded" } }))
        .variant,
    ).toBe("degraded");
  });

  it("marks the presentation current only while freshness is live", () => {
    expect(selectStatusPresentation(buildRobot({ freshness: "live" })).isCurrent).toBe(true);

    for (const freshness of NOT_LIVE) {
      expect(selectStatusPresentation(buildRobot({ freshness })).isCurrent).toBe(false);
    }
  });

  it("qualifies the label with (last known) exactly once when not current", () => {
    for (const freshness of NOT_LIVE) {
      const presentation = selectStatusPresentation(buildRobot({ status: "busy", freshness }));
      expect(presentation.label).toBe("Busy (last known)");
    }
  });

  it("leaves the label unqualified while live, so the chip is not falsely hedged", () => {
    expect(selectStatusPresentation(buildRobot({ status: "busy" })).label).toBe("Busy");
  });

  it("qualifies the degraded variant's label with the status word, not the severity", () => {
    const presentation = selectStatusPresentation(
      buildRobot({ status: "busy", freshness: "stale", health: { severity: "degraded" } }),
    );

    expect(presentation).toEqual({
      variant: "degraded",
      label: "Busy (last known)",
      isCurrent: false,
    });
  });
});

describe("selectBatteryDisplay", () => {
  it("renders the percentage while live", () => {
    expect(selectBatteryDisplay(buildRobot({ batteryPercent: 0 }))).toBe("0%");
    expect(selectBatteryDisplay(buildRobot({ batteryPercent: 87 }))).toBe("87%");
  });

  it("renders an em dash when the reading is not current", () => {
    for (const freshness of NOT_LIVE) {
      expect(selectBatteryDisplay(buildRobot({ freshness, batteryPercent: 87 }))).toBe("—");
    }
  });

  it("renders an em dash when there is no reading at all", () => {
    expect(selectBatteryDisplay(buildRobot({ batteryPercent: null }))).toBe("—");
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
      buildRobot({ id: "a", freshness: "live" }),
      buildRobot({ id: "b", freshness: "live" }),
      buildRobot({ id: "c", freshness: "stale" }),
      buildRobot({ id: "d", freshness: "unreachable" }),
      buildRobot({ id: "e", freshness: "unknown" }),
      buildRobot({ id: "f", freshness: "unknown" }),
    ];

    const summary = selectFreshnessSummary(fleet);

    expect(summary).toEqual({ live: 2, stale: 1, unreachable: 1, unknown: 2 });
    // Mutually exclusive and exhaustive, per fleet spec §2.
    const total = summary.live + summary.stale + summary.unreachable + summary.unknown;
    expect(total).toBe(fleet.length);
  });

  it("counts freshness only, never status or health", () => {
    const fleet: readonly Robot[] = [
      buildRobot({ id: "a", freshness: "live", status: "fault" }),
      buildRobot({ id: "b", freshness: "live", health: { severity: "critical" } }),
    ];

    expect(selectFreshnessSummary(fleet)).toEqual({
      live: 2,
      stale: 0,
      unreachable: 0,
      unknown: 0,
    });
  });
});

function buildDiagnostics(overrides: Partial<RobotDiagnostics> = {}): RobotDiagnostics {
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

function buildDetail(overrides: Partial<RobotDetail> = {}): RobotDetail {
  return {
    ...buildRobot(),
    model: "Courier 4",
    connectivity: "online",
    position: { frame: "site-map", x: 41.24, y: 18.7 },
    capabilities: {},
    diagnostics: buildDiagnostics(),
    rawPayload: null,
    ...overrides,
  };
}

describe("selectPanelCapabilities", () => {
  it("returns only the capabilities the robot declared", () => {
    const robotDetail = buildDetail({
      capabilities: { dock: { docked: true, dockId: "dock-a3" } },
    });

    expect(selectPanelCapabilities(robotDetail)).toEqual(["dock"]);
  });

  it("excludes a panel the deployment disabled, even when the robot declares it", () => {
    // ADR 17's gate: declared by the robot AND enabled by the tenant. The
    // disabled list is injected rather than read from `config`, because the
    // dependency rule forbids the data layers importing it — and because whether a
    // panel is offered is a deployment question, not a domain one.
    const robotDetail = buildDetail({
      capabilities: {
        dock: { docked: true, dockId: "dock-a3" },
        lidarHealth: { severity: "nominal", rpm: 600 },
      },
    });

    expect(selectPanelCapabilities(robotDetail, ["lidarHealth"])).toEqual(["dock"]);
  });

  it("offers every declared panel when nothing is disabled", () => {
    const robotDetail = buildDetail({
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
    const robotDetail = buildDetail({
      capabilities: { dock: { docked: true, dockId: "dock-a3" } },
    });

    expect(selectPanelCapabilities(robotDetail, ["lidarHealth"])).toEqual(["dock"]);
  });

  it("excludes sequence, which is transport metadata rather than a panel", () => {
    const robotDetail = buildDetail({
      capabilities: {
        dock: { docked: false, dockId: null },
        sequence: { value: 88_412 },
      },
    });

    expect(selectPanelCapabilities(robotDetail)).toEqual(["dock"]);
  });

  it("returns a stable order regardless of declaration order", () => {
    const declaredBackwards = buildDetail({
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
    expect(selectPanelCapabilities(buildDetail())).toEqual([]);
  });
});

describe("selectPositionDisplay", () => {
  it("names the frame alongside the coordinates", () => {
    expect(selectPositionDisplay(buildDetail())).toBe("site-map · 41.2, 18.7");
  });

  it("renders an em dash when the position is not current", () => {
    for (const freshness of NOT_LIVE) {
      expect(selectPositionDisplay(buildDetail({ freshness }))).toBe("—");
    }
  });

  it("renders an em dash when there is no position at all", () => {
    expect(selectPositionDisplay(buildDetail({ position: null }))).toBe("—");
  });
});

describe("selectClockDeltaDisplay", () => {
  it("signs the delta so the direction of the skew is readable", () => {
    expect(selectClockDeltaDisplay(buildDetail())).toBe("+120 ms");
    expect(
      selectClockDeltaDisplay(
        buildDetail({ diagnostics: buildDiagnostics({ clockDeltaMs: -40 }) }),
      ),
    ).toBe("-40 ms");
  });

  it("renders an em dash when a timestamp is missing, never a zero", () => {
    expect(
      selectClockDeltaDisplay(
        buildDetail({ diagnostics: buildDiagnostics({ clockDeltaMs: null }) }),
      ),
    ).toBe("—");
  });
});

describe("selectSequenceGapDisplay", () => {
  it("reports a real count", () => {
    expect(
      selectSequenceGapDisplay(
        buildDetail({
          diagnostics: buildDiagnostics({
            sequenceHealth: { evaluated: true, gaps: 3, duplicates: 0 },
          }),
        }),
      ),
    ).toBe("3");
    expect(selectSequenceGapDisplay(buildDetail())).toBe("0");
  });

  it("says not evaluated rather than zero when gaps are not checked", () => {
    // "0 gaps" for a robot nobody checks is a false statement to an operator
    // (ADR 1, Implications). Since ADR 25 the wrong answer is not reachable by
    // forgetting a check: there is no count on the unevaluated variant to read.
    expect(
      selectSequenceGapDisplay(
        buildDetail({ diagnostics: buildDiagnostics({ sequenceHealth: { evaluated: false } }) }),
      ),
    ).toBe("Not evaluated");
  });

  it("says not evaluated for a robot with no diagnostics at all", () => {
    expect(selectSequenceGapDisplay(buildDetail({ diagnostics: null }))).toBe("Not evaluated");
  });

  it("distinguishes zero gaps from not evaluated, which is the whole point", () => {
    const evaluated = buildDetail({
      diagnostics: buildDiagnostics({
        sequenceHealth: { evaluated: true, gaps: 0, duplicates: 0 },
      }),
    });
    const unevaluated = buildDetail({
      diagnostics: buildDiagnostics({ sequenceHealth: { evaluated: false } }),
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
        buildDetail({
          diagnostics: buildDiagnostics({
            sequenceHealth: { evaluated: true, gaps: 3, duplicates: 2 },
          }),
        }),
      ),
    ).toBe("2");
  });

  it("cannot disagree with gaps about whether the sequence was evaluated", () => {
    // Both read one field, so a robot can never report "not evaluated" gaps and
    // a duplicate count at the same time.
    const unevaluated = buildDetail({
      diagnostics: buildDiagnostics({ sequenceHealth: { evaluated: false } }),
    });

    expect(selectSequenceDuplicateDisplay(unevaluated)).toBe("Not evaluated");
    expect(selectSequenceGapDisplay(unevaluated)).toBe("Not evaluated");
  });
});

/*
 * Map projection selectors (page spec 04 § 11 "Projection purity", ADR 35).
 * Pure geometry over the read model: no React, no clock, no store.
 */

function buildPosition(xCoordinate: number, yCoordinate: number, frame = "site-1"): Position {
  return { frame, x: xCoordinate, y: yCoordinate };
}

describe("selectPlottableRobots", () => {
  it("keeps only the selected site's robots that carry a position", () => {
    const robots = [
      buildRobot({ id: "r-1", siteId: "site-1", position: buildPosition(1, 2) }),
      buildRobot({ id: "r-2", siteId: "site-1", position: null }),
      buildRobot({ id: "r-3", siteId: "site-2", position: buildPosition(3, 4, "site-2") }),
    ];

    const plottable = selectPlottableRobots(robots, "site-1");

    expect(plottable.map((entry) => entry.id)).toEqual(["r-1"]);
  });
});

describe("selectSiteRobots", () => {
  it("keeps the site's robots whether or not they carry a position", () => {
    const robots = [
      buildRobot({ id: "r-1", siteId: "site-1", position: buildPosition(1, 2) }),
      buildRobot({ id: "r-2", siteId: "site-1", position: null }),
      buildRobot({ id: "r-3", siteId: "site-2", position: buildPosition(3, 4, "site-2") }),
    ];

    expect(selectSiteRobots(robots, "site-1").map((entry) => entry.id)).toEqual(["r-1", "r-2"]);
    expect(selectSiteRobots(robots, "site-3")).toEqual([]);
  });
});

describe("selectUnpositionedRobots", () => {
  it("keeps only the robots that never reported a position", () => {
    const robots = [
      buildRobot({ id: "r-1", position: buildPosition(1, 2) }),
      buildRobot({ id: "r-2", position: null }),
    ];

    expect(selectUnpositionedRobots(robots).map((entry) => entry.id)).toEqual(["r-2"]);
  });
});

describe("computeSiteExtents", () => {
  it("returns null for no positions rather than inventing a frame", () => {
    expect(computeSiteExtents([])).toBeNull();
  });

  it("pads the bounding box by ten percent per axis", () => {
    const extents = computeSiteExtents([buildPosition(0, 0), buildPosition(100, 50)]);

    expect(extents).toEqual({ minX: -10, maxX: 110, minY: -5, maxY: 55 });
  });

  it("floors a single robot's degenerate box to the minimum span, centred", () => {
    const extents = computeSiteExtents([buildPosition(7, -3)]);

    expect(extents).toEqual({ minX: 2, maxX: 12, minY: -8, maxY: 2 });
  });
});

describe("mergeExtents", () => {
  const firstExtents = { minX: -10, maxX: 10, minY: -10, maxY: 10 };
  const secondExtents = { minX: -5, maxX: 20, minY: -30, maxY: 5 };

  it("yields the other side when one is null", () => {
    expect(mergeExtents(null, firstExtents)).toEqual(firstExtents);
    expect(mergeExtents(firstExtents, null)).toEqual(firstExtents);
    expect(mergeExtents(null, null)).toBeNull();
  });

  it("takes the union so the box never shrinks", () => {
    const merged = mergeExtents(firstExtents, secondExtents);

    expect(merged).toEqual({ minX: -10, maxX: 20, minY: -30, maxY: 10 });
    // Merging a tighter box back in changes nothing — and returns the same
    // object, which is what lets a caller detect "unchanged" by reference.
    expect(mergeExtents(merged, firstExtents)).toBe(merged);
  });
});

describe("computeViewBoxSize", () => {
  it("matches the extents' aspect ratio at the given width", () => {
    const size = computeViewBoxSize({ minX: 0, maxX: 100, minY: 0, maxY: 50 }, 600);

    expect(size).toEqual({ width: 600, height: 300 });
  });
});

describe("projectToViewBox", () => {
  const extents = { minX: -40, maxX: 40, minY: -40, maxY: 40 };
  const viewBox = { width: 600, height: 600 };

  it("maps the corners exactly, inverting the y axis", () => {
    // Bottom-left of the site frame lands at the SVG's bottom-left.
    expect(projectToViewBox(buildPosition(-40, -40), extents, viewBox)).toEqual({ x: 0, y: 600 });
    // Top-right of the site frame lands at the SVG's top-right.
    expect(projectToViewBox(buildPosition(40, 40), extents, viewBox)).toEqual({ x: 600, y: 0 });
  });

  it("maps the centre to the centre", () => {
    expect(projectToViewBox(buildPosition(0, 0), extents, viewBox)).toEqual({ x: 300, y: 300 });
  });
});

describe("selectMapMarker", () => {
  const extents = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
  const viewBox = { width: 100, height: 100 };
  const buildPlottableRobot = (overrides: Partial<Robot> = {}): PlottableRobot => {
    const built = buildRobot({ position: buildPosition(50, 50), ...overrides });
    if (built.position === null) {
      throw new Error("test robot must carry a position");
    }
    return { ...built, position: built.position };
  };

  it("is filled only when the robot is live and the stream is connected", () => {
    expect(
      selectMapMarker(buildPlottableRobot({ freshness: "live" }), extents, viewBox, true).hollow,
    ).toBe(false);
  });

  it("is hollow for every non-live freshness", () => {
    for (const freshness of NOT_LIVE) {
      const marker = selectMapMarker(buildPlottableRobot({ freshness }), extents, viewBox, true);
      expect(marker.hollow).toBe(true);
    }
  });

  it("is hollow while the stream is down, whatever the freshness says", () => {
    const marker = selectMapMarker(
      buildPlottableRobot({ freshness: "live" }),
      extents,
      viewBox,
      false,
    );

    expect(marker.hollow).toBe(true);
  });

  it("carries the same status variant the side list's chip renders", () => {
    const marker = selectMapMarker(
      buildPlottableRobot({ status: "fault" }),
      extents,
      viewBox,
      true,
    );

    expect(marker.variant).toBe("fault");
    expect(marker.robotId).toBe("r-1");
    expect(marker.x).toBe(50);
    expect(marker.y).toBe(50);
  });
});

describe("selectPositionedSummary", () => {
  it("counts the site's robots and how many carry a position", () => {
    const robots = [
      buildRobot({ id: "r-1", siteId: "site-1", position: buildPosition(1, 1) }),
      buildRobot({ id: "r-2", siteId: "site-1", position: null }),
      buildRobot({ id: "r-3", siteId: "site-2", position: buildPosition(2, 2, "site-2") }),
    ];

    expect(selectPositionedSummary(robots, "site-1")).toEqual({ positioned: 1, total: 2 });
    expect(selectPositionedSummary(robots, "site-3")).toEqual({ positioned: 0, total: 0 });
  });
});
