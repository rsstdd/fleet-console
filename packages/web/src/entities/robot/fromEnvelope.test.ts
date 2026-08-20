import { createAdapterRegistry } from "@fleet/adapters";
import { FIXTURE_RECORDING, loadVendorFixture } from "@fleet/adapters/testing";
import {
  SCHEMA_VERSION,
  encodeCanonicalEnvelope,
  parseCanonicalEnvelope,
  parseRobotDiagnosticEnvelope,
  withFreshness,
  type CanonicalEnvelope,
  type RegisteredRobotState,
  type RobotDiagnosticEnvelope,
} from "@fleet/contracts";
import { describe, expect, it } from "vitest";

import { toRegisteredRobot, toRegisteredRobotDetail, toRobot, toRobotDetail } from "./fromEnvelope";

/**
 * The console's half of the canonical contract: decoded envelope in, read model
 * out. Contract shapes come from `@fleet/contracts` rather than from a literal
 * typed by hand here — a fixture that cannot fail the schema proves nothing
 * about the wire.
 */
const REPORTED_AT = Date.UTC(2026, 7, 19, 10, 0, 0);
const RECEIVED_AT = REPORTED_AT + 120;

function envelope(overrides: Partial<CanonicalEnvelope> = {}): CanonicalEnvelope {
  return {
    schemaVersion: SCHEMA_VERSION,
    robotId: "R-118",
    siteId: "zone-a",
    vendorId: "A",
    model: "Courier 4",
    adapterId: "vendor-a",
    adapterVersion: "1.4.0",
    reportedAt: REPORTED_AT,
    receivedAt: RECEIVED_AT,
    core: {
      connectivity: "online",
      batteryPercent: 91,
      position: { frame: "site-map", x: 41.2, y: 18.7 },
      status: "busy",
      health: { severity: "nominal" },
    },
    freshness: "live",
    capabilities: {
      dock: { docked: false, dockId: "dock-a3" },
      sequence: { value: 88_412 },
    },
    ...overrides,
  };
}

function diagnosticEnvelope(
  overrides: Partial<RobotDiagnosticEnvelope> = {},
): RobotDiagnosticEnvelope {
  return {
    ...envelope(),
    sequenceHealth: { evaluated: true, gaps: 0, duplicates: 0 },
    rawPayload: { state: "MOVING" },
    ...overrides,
  };
}

const NO_COUNTERS = { unknownFieldCount: 0 } as const;

describe("toRobot", () => {
  it("maps the canonical envelope onto a fleet row", () => {
    expect(toRobot(envelope())).toEqual({
      id: "R-118",
      vendor: "A",
      siteId: "zone-a",
      status: "busy",
      health: { severity: "nominal" },
      freshness: "live",
      batteryPercent: 91,
      lastSeenAt: "2026-08-19T10:00:00.000Z",
    });
  });

  it("copies freshness from the field rather than deriving it (ADR 3)", () => {
    // The envelope says stale while `reportedAt` is this instant. A client that
    // derived freshness would overrule the server and call this live; the read
    // model must not.
    const justNow = envelope({ freshness: "stale", reportedAt: Date.now() });

    expect(toRobot(justNow).freshness).toBe("stale");
  });

  it("passes an unrecognised vendor id through unchanged (ADR 1)", () => {
    // A fourth vendor is an adapter change. If the console narrowed vendor ids
    // to A/B/C, this row would be unrepresentable and the coupling would be back.
    expect(toRobot(envelope({ vendorId: "D" })).vendor).toBe("D");
  });

  it("carries the vendor's health description when there is one", () => {
    const degraded = envelope({
      core: {
        ...envelope().core,
        health: { severity: "degraded", description: "Drive current high" },
      },
    });

    expect(toRobot(degraded).health).toEqual({
      severity: "degraded",
      description: "Drive current high",
    });
  });
});

describe("toRegisteredRobot", () => {
  const registered: RegisteredRobotState = {
    schemaVersion: SCHEMA_VERSION,
    robotId: "R-233",
    siteId: "zone-a",
    vendorId: "B",
    freshness: "unknown",
  };

  it("states what is unknown instead of defaulting it", () => {
    expect(toRegisteredRobot(registered)).toEqual({
      id: "R-233",
      vendor: "B",
      siteId: "zone-a",
      status: "unknown",
      // Not `nominal`: nobody has heard from this robot, so its health is not
      // known to be fine (Principle 4).
      health: null,
      freshness: "unknown",
      batteryPercent: null,
      lastSeenAt: null,
    });
  });

  it("leaves the detail read model with registration data only", () => {
    const detail = toRegisteredRobotDetail(registered);

    expect(detail.model).toBeNull();
    expect(detail.connectivity).toBeNull();
    expect(detail.position).toBeNull();
    expect(detail.capabilities).toEqual({});
    expect(detail.diagnostics).toBeNull();
    expect(detail.rawPayload).toBeNull();
  });
});

describe("toRobotDetail", () => {
  it("takes the sequence from the declared capability, not a core field", () => {
    const detail = toRobotDetail(diagnosticEnvelope(), NO_COUNTERS);

    expect(detail.diagnostics?.sequence).toBe(88_412);
  });

  it("reports no sequence for a vendor that declares none", () => {
    const sequenceless = diagnosticEnvelope({
      capabilities: { dock: { docked: true, dockId: null } },
    });

    // Absence of the declaration, not a zero (ADR 1: Vendor B).
    expect(toRobotDetail(sequenceless, NO_COUNTERS).diagnostics?.sequence).toBeNull();
  });

  it("injects only the counters that are genuinely per-adapter", () => {
    // ADR 25 separated the two by scope. Unknown fields have no per-robot
    // precision to offer (ADR 15), so they still arrive from the health
    // response; sequence continuity does, so it comes off the envelope.
    const detail = toRobotDetail(diagnosticEnvelope(), { unknownFieldCount: 2 });

    expect(detail.diagnostics?.unknownFieldCount).toBe(2);
  });

  it("reads sequence continuity off the envelope rather than from an injection", () => {
    const detail = toRobotDetail(
      diagnosticEnvelope({ sequenceHealth: { evaluated: true, gaps: 3, duplicates: 1 } }),
      NO_COUNTERS,
    );

    expect(detail.diagnostics?.sequenceHealth).toEqual({
      evaluated: true,
      gaps: 3,
      duplicates: 1,
    });
  });

  it("carries an unevaluated sequence through without inventing a count", () => {
    const detail = toRobotDetail(
      diagnosticEnvelope({ sequenceHealth: { evaluated: false } }),
      NO_COUNTERS,
    );

    expect(detail.diagnostics?.sequenceHealth).toEqual({ evaluated: false });
  });

  it("signs the clock delta in both directions", () => {
    expect(toRobotDetail(diagnosticEnvelope(), NO_COUNTERS).diagnostics?.clockDeltaMs).toBe(120);

    const skewed = diagnosticEnvelope({ receivedAt: REPORTED_AT - 40 });
    // A vendor clock ahead of the server is exactly what the technician readout
    // exists to surface, so the mapping keeps the sign rather than clamping.
    expect(toRobotDetail(skewed, NO_COUNTERS).diagnostics?.clockDeltaMs).toBe(-40);
  });

  it("carries the retained payload, and its absence", () => {
    expect(toRobotDetail(diagnosticEnvelope(), NO_COUNTERS).rawPayload).toEqual({
      state: "MOVING",
    });
    expect(
      toRobotDetail(diagnosticEnvelope({ rawPayload: null }), NO_COUNTERS).rawPayload,
    ).toBeNull();
  });
});

/**
 * The client-side half of the end-to-end contract path: canonical envelope →
 * wire encoding → JSON round trip → boundary decode → read model.
 *
 * The vendor half is joined below through the test-only adapter dependency ADR 12
 * permits in this file. Production web code still sees canonical envelopes only.
 */
describe("wire round trip", () => {
  it("joins every recorded vendor dialect to the browser read model", () => {
    const registry = createAdapterRegistry();
    const details = (["A", "B", "C"] as const).map((vendor) => {
      const fixture = loadVendorFixture(vendor);
      const adapted = registry.decodeTelemetry(vendor, fixture.payload, fixture.recordedAt + 250);
      expect(adapted.ok).toBe(true);
      if (!adapted.ok) throw new Error(`Vendor ${vendor} rejected its representative fixture.`);

      const canonical = withFreshness(adapted.value, "live");
      const decoded = parseCanonicalEnvelope(
        JSON.parse(JSON.stringify(encodeCanonicalEnvelope(canonical))),
      );
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(`Vendor ${vendor}'s canonical wire form was rejected.`);

      return toRobotDetail(
        {
          ...decoded.value,
          sequenceHealth:
            decoded.value.capabilities.sequence === undefined
              ? { evaluated: false }
              : { evaluated: true, gaps: 0, duplicates: 0 },
          rawPayload: null,
        },
        { unknownFieldCount: registry.unknownFields().byAdapter[vendor].total },
      );
    });

    expect(details.map((detail) => detail.batteryPercent)).toEqual([96.61, 75, 38.46]);
    expect(details.map((detail) => detail.lastSeenAt)).toEqual([
      new Date(FIXTURE_RECORDING.instantMs).toISOString(),
      new Date(FIXTURE_RECORDING.instantMs).toISOString(),
      new Date(FIXTURE_RECORDING.instantMs).toISOString(),
    ]);
    expect(details[1]?.position).toEqual({ frame: "SITE-NORTH", x: -20.77, y: 10.26 });
    expect(details[1]?.diagnostics?.sequence).toBeNull();
    expect(details[1]?.diagnostics?.sequenceHealth).toEqual({ evaluated: false });
    expect(details[0]?.capabilities.lidarHealth).toEqual({ severity: "nominal", rpm: 600 });
    expect(details[0]?.capabilities).not.toHaveProperty("waterLevel");
    expect(details[2]?.capabilities.waterLevel).toEqual({ percent: 60 });
    expect(details[2]?.capabilities).not.toHaveProperty("lidarHealth");
    expect(details.map((detail) => detail.connectivity)).toEqual(["unknown", "unknown", "unknown"]);
    expect(details.map((detail) => detail.position)).not.toContainEqual(
      expect.objectContaining({ heading: expect.anything() }),
    );
    expect(details[2]?.diagnostics?.unknownFieldCount).toBe(1);
  });

  it("survives JSON and decodes to the same read model", () => {
    const original = envelope();
    const json = JSON.stringify(encodeCanonicalEnvelope(original));
    const decoded = parseCanonicalEnvelope(JSON.parse(json));

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }
    // Capabilities travel as an array and come back as the record, so this
    // asserts the transform in both directions as well as the mapping.
    expect(decoded.value.capabilities).toEqual(original.capabilities);
    expect(toRobot(decoded.value)).toEqual(toRobot(original));
  });

  it("rejects a malformed response at the boundary rather than coercing it", () => {
    const wire = JSON.parse(JSON.stringify(encodeCanonicalEnvelope(envelope()))) as Record<
      string,
      unknown
    >;
    // A battery percentage as a string is exactly the coercion Principle 2
    // forbids: it must fail, not become 91.
    const result = parseCanonicalEnvelope({
      ...wire,
      core: { ...(wire.core as Record<string, unknown>), batteryPercent: "91" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.issues.some((issue) => issue.path === "core.batteryPercent")).toBe(true);
  });

  it("rejects an unknown canonical field as contract drift", () => {
    const wire = JSON.parse(JSON.stringify(encodeCanonicalEnvelope(envelope()))) as Record<
      string,
      unknown
    >;

    const result = parseRobotDiagnosticEnvelope({ ...wire, rawPayload: null, surprise: 1 });

    expect(result.ok).toBe(false);
  });
});
