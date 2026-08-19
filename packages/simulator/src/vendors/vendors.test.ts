import { describe, expect, it } from "vitest";

import { createFleet } from "../fleet/createFleet.ts";
import type { SimulatedRobot } from "../fleet/simulatedRobot.ts";
import { buildPayload } from "./buildPayload.ts";
import { buildVendorAPayload } from "./vendorA.ts";
import { buildVendorBPayload } from "./vendorB.ts";
import { buildVendorCPayload } from "./vendorC.ts";

/**
 * The dialect differences asserted here are not stylistic. Each one is the
 * evidence a specific adapter contract test will consume (ADR 1 § Implications),
 * so "cleaning up" any of them under time pressure removes the thing being
 * demonstrated. Where an assertion exists to prevent a tidy-up, it says so.
 */

const INSTANT = Date.parse("2026-08-19T12:00:00.000Z");

/** A fully specified robot, so every assertion below is about serialization only. */
function robot(overrides: Partial<SimulatedRobot["state"]> = {}): SimulatedRobot {
  return {
    identity: { robotId: "R-001", siteId: "SITE-NORTH", vendor: "A", model: "AX-200" },
    state: {
      battery: 0.734,
      x: 12.5,
      y: -3.25,
      heading: 91.4,
      status: "busy",
      health: "nominal",
      docked: false,
      dockId: null,
      lidarRpm: 600,
      lidarFaulted: false,
      waterLevel: 0.62,
      sequence: 42,
      ...overrides,
    },
  };
}

describe("vendor A dialect", () => {
  it("emits the exact nested shape with fractional battery, metres and an ISO timestamp", () => {
    expect(buildVendorAPayload(robot(), INSTANT)).toEqual({
      robot_id: "R-001",
      site: "SITE-NORTH",
      model: "AX-200",
      seq: 42,
      timestamp: "2026-08-19T12:00:00.000Z",
      telemetry: {
        battery: { level: 0.734 },
        pose: { x_m: 12.5, y_m: -3.25, heading_deg: 91.4 },
        state: "busy",
        health: { level: "nominal" },
        dock: { docked: false, dock_id: null },
        lidar: { rpm: 600, fault: false },
      },
    });
  });

  it("keeps battery a fraction in [0, 1] rather than a percentage", () => {
    const payload = buildVendorAPayload(robot({ battery: 1 }), INSTANT);
    expect(payload.telemetry.battery.level).toBe(1);
    expect(buildVendorAPayload(robot({ battery: 0 }), INSTANT).telemetry.battery.level).toBe(0);
  });

  it("uses the string status vocabulary, not codes", () => {
    for (const status of ["idle", "busy", "charging", "fault"] as const) {
      expect(buildVendorAPayload(robot({ status }), INSTANT).telemetry.state).toBe(status);
    }
  });

  it("carries dock and lidar source data for the capabilities its adapter declares", () => {
    const payload = buildVendorAPayload(robot({ docked: true, dockId: "D-1" }), INSTANT);
    expect(payload.telemetry.dock).toEqual({ docked: true, dock_id: "D-1" });
    expect(payload.telemetry.lidar).toEqual({ rpm: 600, fault: false });
  });

  it("carries a real source sequence", () => {
    expect(buildVendorAPayload(robot({ sequence: 7 }), INSTANT).seq).toBe(7);
  });

  it("does not carry water level, which belongs to vendor C", () => {
    expect(buildVendorAPayload(robot(), INSTANT).telemetry).not.toHaveProperty("water");
  });
});

describe("vendor B dialect", () => {
  it("emits the exact flat shape with integer percent, centimetres and epoch-ms", () => {
    expect(buildVendorBPayload(robot(), INSTANT)).toEqual({
      id: "R-001",
      site: "SITE-NORTH",
      model: "AX-200",
      ts: INSTANT,
      batt_pct: 73,
      x_cm: 1250,
      y_cm: -325,
      heading_cdeg: 9140,
      status_code: 1,
      health_code: 0,
      dock_state: 0,
    });
  });

  it("is flat: no value in the payload is an object", () => {
    for (const value of Object.values(buildVendorBPayload(robot(), INSTANT))) {
      expect(typeof value).not.toBe("object");
    }
  });

  it("emits no sequence field at all", () => {
    // Load-bearing absence. Vendor B's adapter synthesizes weaker ordering from
    // `ts`, which cannot separate a duplicate from two events in the same
    // millisecond. Adding any simulator-only uniqueness here would hide exactly
    // the limitation vendor B exists to demonstrate (ADR 1, AGENTS.md).
    const payload = buildVendorBPayload(robot(), INSTANT);
    expect(payload).not.toHaveProperty("seq");
    expect(payload).not.toHaveProperty("sequence");
    expect(Object.keys(payload)).not.toContain("seq");
  });

  it("emits every numeric field as an integer", () => {
    const payload = buildVendorBPayload(robot({ battery: 0.7351, x: 1.2345 }), INSTANT);
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === "number") {
        expect(Number.isInteger(value), `${key} must be an integer`).toBe(true);
      }
    }
  });

  it("maps the status vocabulary to numeric codes", () => {
    const codes = (["idle", "busy", "charging", "fault"] as const).map(
      (status) => buildVendorBPayload(robot({ status }), INSTANT).status_code,
    );
    expect(codes).toEqual([0, 1, 2, 3]);
  });

  it("clamps battery percent into [0, 100]", () => {
    expect(buildVendorBPayload(robot({ battery: 0 }), INSTANT).batt_pct).toBe(0);
    expect(buildVendorBPayload(robot({ battery: 1 }), INSTANT).batt_pct).toBe(100);
  });

  it("carries dock source data", () => {
    expect(buildVendorBPayload(robot({ docked: true }), INSTANT).dock_state).toBe(1);
  });

  it("carries no lidar source data, so its adapter declares dock and nothing else", () => {
    // Load-bearing absence, settled in ADR 1 § Observed consequences (19 August
    // 2026). `sequence` is excluded from capability panels (page spec 03 § 6),
    // so a vendor B that carried lidar health would render a Capabilities
    // section identical to vendor A's — and that section is the one page spec
    // 03 § 4 says exists to differ by vendor.
    const payload = buildVendorBPayload(robot({ lidarFaulted: true, lidarRpm: 0 }), INSTANT);
    expect(payload).not.toHaveProperty("lidar_rpm");
    expect(payload).not.toHaveProperty("lidar_fault");
    expect(JSON.stringify(payload)).not.toContain("lidar");
  });
});

describe("vendor C dialect", () => {
  it("emits the exact A-like shape carrying water level", () => {
    expect(buildVendorCPayload(robot(), INSTANT)).toEqual({
      robot_id: "R-001",
      site: "SITE-NORTH",
      model: "AX-200",
      seq: 42,
      timestamp: "2026-08-19T12:00:00.000Z",
      telemetry: {
        battery: { level: 0.734 },
        pose: { x_m: 12.5, y_m: -3.25, heading_deg: 91.4 },
        state: "busy",
        health: { level: "nominal" },
        dock: { docked: false, dock_id: null },
        water: { level_pct: 62 },
        firmware_channel: "stable",
      },
    });
  });

  it("omits lidar health completely rather than sending an empty placeholder", () => {
    // Key absence is the declaration. A `null`, an `{}` or a disabled placeholder
    // would let the adapter declare a `lidarHealth` capability the robot does not
    // have, and the console would render a panel for it (ADR 1, TODO § 8).
    const payload = buildVendorCPayload(robot({ lidarFaulted: true, lidarRpm: 0 }), INSTANT);
    expect(payload.telemetry).not.toHaveProperty("lidar");
    expect(Object.keys(payload.telemetry)).not.toContain("lidar");
    expect(JSON.stringify(payload)).not.toContain("lidar");
  });

  it("nests the undocumented field so the unknown-field walk must produce a dotted path", () => {
    const payload = buildVendorCPayload(robot(), INSTANT);
    expect(payload.telemetry.firmware_channel).toBe("stable");
    expect(payload).not.toHaveProperty("firmware_channel");
  });

  it("keeps the undocumented field stable across readings so a fixture stays reproducible", () => {
    const first = buildVendorCPayload(robot({ sequence: 1 }), INSTANT);
    const second = buildVendorCPayload(robot({ sequence: 2 }), INSTANT + 1000);
    expect(first.telemetry.firmware_channel).toBe(second.telemetry.firmware_channel);
  });

  it("carries a real source sequence, unlike vendor B", () => {
    expect(buildVendorCPayload(robot({ sequence: 9 }), INSTANT).seq).toBe(9);
  });
});

describe("cross-dialect disagreements", () => {
  it("disagrees on battery unit for the same robot state", () => {
    const state = robot({ battery: 0.5 });
    expect(buildVendorAPayload(state, INSTANT).telemetry.battery.level).toBe(0.5);
    expect(buildVendorBPayload(state, INSTANT).batt_pct).toBe(50);
    expect(buildVendorCPayload(state, INSTANT).telemetry.battery.level).toBe(0.5);
  });

  it("disagrees on position unit for the same robot state", () => {
    const state = robot({ x: 3.21 });
    expect(buildVendorAPayload(state, INSTANT).telemetry.pose.x_m).toBe(3.21);
    expect(buildVendorBPayload(state, INSTANT).x_cm).toBe(321);
  });

  it("disagrees on timestamp representation for the same instant", () => {
    const state = robot();
    expect(buildVendorAPayload(state, INSTANT).timestamp).toBe("2026-08-19T12:00:00.000Z");
    expect(buildVendorBPayload(state, INSTANT).ts).toBe(INSTANT);
    expect(typeof buildVendorCPayload(state, INSTANT).timestamp).toBe("string");
  });

  it("gives each vendor a distinct capability-source profile", () => {
    // dock is universal, lidar is vendor A only, water is vendor C only. This is
    // what makes robot detail's capability grid differ across all three vendors
    // rather than only two (page spec 03 § 3, ADR 1 § Observed consequences).
    const state = robot();
    const a = buildVendorAPayload(state, INSTANT);
    const b = buildVendorBPayload(state, INSTANT);
    const c = buildVendorCPayload(state, INSTANT);

    expect(a.telemetry).toHaveProperty("dock");
    expect(b).toHaveProperty("dock_state");
    expect(c.telemetry).toHaveProperty("dock");

    expect(a.telemetry).toHaveProperty("lidar");
    expect(JSON.stringify(b)).not.toContain("lidar");
    expect(c.telemetry).not.toHaveProperty("lidar");

    expect(a.telemetry).not.toHaveProperty("water");
    expect(JSON.stringify(b)).not.toContain("water");
    expect(c.telemetry).toHaveProperty("water");
  });

  it("disagrees on identity key: A and C use robot_id, B uses id", () => {
    const state = robot();
    expect(buildVendorAPayload(state, INSTANT).robot_id).toBe("R-001");
    expect(buildVendorBPayload(state, INSTANT).id).toBe("R-001");
    expect(buildVendorBPayload(state, INSTANT)).not.toHaveProperty("robot_id");
  });
});

describe("buildPayload dispatch", () => {
  it("routes each robot to its own vendor's serializer", () => {
    const fleet = createFleet(3, 1);
    const [a, b, c] = fleet;

    expect(a?.identity.vendor).toBe("A");
    expect(b?.identity.vendor).toBe("B");
    expect(c?.identity.vendor).toBe("C");

    expect(buildPayload(a!, INSTANT)).toHaveProperty("telemetry.lidar");
    expect(buildPayload(b!, INSTANT)).toHaveProperty("batt_pct");
    expect(buildPayload(c!, INSTANT)).toHaveProperty("telemetry.water");
  });

  it("produces JSON-serializable output for every vendor", () => {
    for (const simulated of createFleet(3, 1)) {
      const payload = buildPayload(simulated, INSTANT);
      expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
    }
  });
});
