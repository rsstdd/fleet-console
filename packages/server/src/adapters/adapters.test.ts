import { beforeEach, describe, expect, it } from "vitest";
import { createAdapterRegistry, type AdapterRegistry } from "./registry.ts";

const RECEIVED_AT = 1_700_000_000_000;
const REPORTED_ISO = "2026-08-26T10:00:00.000Z";
const REPORTED_MS = Date.parse(REPORTED_ISO);

const vendorA = (overrides: Record<string, unknown> = {}) => ({
  robot_id: "R-001",
  site: "SITE-NORTH",
  model: "AX-200",
  seq: 7,
  timestamp: REPORTED_ISO,
  telemetry: {
    battery: { level: 0.8125 },
    pose: { x_m: 1.5, y_m: -2.25, heading_deg: 90 },
    state: "busy",
    health: { level: "nominal" },
    dock: { docked: false, dock_id: null },
    lidar: { rpm: 600, fault: false },
  },
  ...overrides,
});

const vendorB = (overrides: Record<string, unknown> = {}) => ({
  id: "R-002",
  site: "SITE-NORTH",
  model: "BR-11",
  ts: REPORTED_MS,
  batt_pct: 64,
  x_cm: 150,
  y_cm: -225,
  heading_cdeg: 9000,
  status_code: 1,
  health_code: 0,
  dock_state: 0,
  ...overrides,
});

const vendorC = (overrides: Record<string, unknown> = {}) => ({
  robot_id: "R-003",
  site: "SITE-NORTH",
  model: "CV-7",
  seq: 3,
  timestamp: REPORTED_ISO,
  telemetry: {
    battery: { level: 0.5 },
    pose: { x_m: 0, y_m: 0, heading_deg: 0 },
    state: "idle",
    health: { level: "degraded" },
    dock: { docked: true, dock_id: "SITE-NORTH-DOCK-03" },
    water: { level_pct: 42 },
    firmware_channel: "stable",
  },
  ...overrides,
});

describe("adapter registry", () => {
  let registry: AdapterRegistry;
  beforeEach(() => {
    registry = createAdapterRegistry();
  });

  it("normalizes all three vendors onto one canonical core", () => {
    const results = [
      registry.decode("A", vendorA(), RECEIVED_AT),
      registry.decode("B", vendorB(), RECEIVED_AT),
      registry.decode("C", vendorC(), RECEIVED_AT),
    ];

    for (const result of results) {
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.siteId).toBe("SITE-NORTH");
        expect(result.value.reportedAt).toBe(REPORTED_MS);
        expect(result.value.receivedAt).toBe(RECEIVED_AT);
        expect(result.value.core.position?.frame).toBe("SITE-NORTH");
      }
    }
  });

  it("converts each vendor's battery and position units", () => {
    const a = registry.decode("A", vendorA(), RECEIVED_AT);
    const b = registry.decode("B", vendorB(), RECEIVED_AT);
    expect(a.ok && a.value.core.batteryPercent).toBe(81.25);
    expect(b.ok && b.value.core.batteryPercent).toBe(64);
    expect(b.ok && b.value.core.position).toEqual({ frame: "SITE-NORTH", x: 1.5, y: -2.25 });
  });

  it("keeps vendor differences as declared capabilities rather than flattening them", () => {
    const a = registry.decode("A", vendorA(), RECEIVED_AT);
    const b = registry.decode("B", vendorB(), RECEIVED_AT);
    const c = registry.decode("C", vendorC(), RECEIVED_AT);

    expect(a.ok && Object.keys(a.value.capabilities).sort()).toEqual([
      "dock",
      "lidarHealth",
      "sequence",
    ]);
    expect(b.ok && Object.keys(b.value.capabilities)).toEqual(["dock"]);
    expect(c.ok && Object.keys(c.value.capabilities).sort()).toEqual([
      "dock",
      "sequence",
      "waterLevel",
    ]);
  });

  it("rejects a malformed payload with a path and a code, never the value", () => {
    const result = registry.decode("A", vendorA({ robot_id: 42 }), RECEIVED_AT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("malformed_payload");
      expect(result.error.issues[0]?.path).toBe("robot_id");
      expect(JSON.stringify(result.error.issues)).not.toContain("42");
    }
  });

  it("rejects a timestamp with no zone designator rather than assuming local time", () => {
    const result = registry.decode("A", vendorA({ timestamp: "2026-08-26T10:00:00" }), RECEIVED_AT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unmappable_value");
    }
  });

  it("rejects an undocumented vendor B status code", () => {
    const result = registry.decode("B", vendorB({ status_code: 9 }), RECEIVED_AT);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.issues[0]?.path).toBe("status_code");
    }
  });

  it("counts accepted fields with no canonical counterpart", () => {
    registry.decode("C", vendorC(), RECEIVED_AT);
    registry.decode("C", vendorC(), RECEIVED_AT);

    const tally = registry.unknownFields().C;
    expect(tally.total).toBe(2);
    expect(tally.fields["telemetry.firmware_channel"]).toBe(2);
  });

  it("does not count unknown fields on a payload it rejected", () => {
    registry.decode("A", vendorA({ seq: -1, extra_field: true }), RECEIVED_AT);
    expect(registry.unknownFields().A.total).toBe(0);
  });
});
