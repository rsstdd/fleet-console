/**
 * Vendor C's contract test (adapters TODO C4, D2).
 *
 * Two properties here exist nowhere else in the repository: that a declared
 * capability can be *absent* and that absence survives into the envelope, and that
 * the unknown-field ledger actually counts something. Vendor C is the only dialect
 * that sends an undeclared field, so if these assertions go, ADR 1's counting
 * requirement has no evidence at all.
 */
import { encodeCapabilities, parseAdapterEnvelope, SCHEMA_VERSION } from "@fleet/contracts";
import { describe, expect, it } from "vitest";

import { createUnknownFieldLedger } from "../../core/unknownFields.ts";
import { FIXTURE_RECORDING, loadMalformedPayload, loadVendorFixture } from "../../testing/index.ts";
import { createVendorCAdapter } from "./adapter.ts";

/** One instant after the pinned recording instant, so the two are never confused. */
const RECEIVED_AT = FIXTURE_RECORDING.instantMs + 250;

function decode(payload: unknown, receivedAt = RECEIVED_AT) {
  return createVendorCAdapter(createUnknownFieldLedger())(payload, receivedAt);
}

function decoded(name: Parameters<typeof loadVendorFixture>[1]) {
  const result = decode(loadVendorFixture("C", name).payload);
  if (!result.ok) {
    throw new Error(`Vendor C rejected its own ${String(name)} fixture.`);
  }
  return result.value;
}

/**
 * Narrows untrusted fixture content to a spreadable record.
 *
 * A runtime check rather than a cast: this package bans type assertions, and a
 * fixture is exactly the boundary the ban exists for — a cast here could hide the
 * very drift the fixture was recorded to catch.
 */
function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Vendor C ${what} is not an object.`);
  }
  return { ...value };
}

/** The recorded vendor C payload as a spreadable object. */
function fixtureObject(): Record<string, unknown> {
  return asRecord(loadVendorFixture("C").payload, "fixture");
}

describe("vendor C adapter", () => {
  it("decodes the representative payload into an exact canonical envelope", () => {
    expect(decoded("representative")).toEqual({
      schemaVersion: SCHEMA_VERSION,
      robotId: "R-003",
      siteId: "SITE-NORTH",
      vendorId: "C",
      model: "CV-7",
      adapterId: "vendor-c",
      adapterVersion: "1.0.0",
      reportedAt: 1_755_600_000_000,
      receivedAt: RECEIVED_AT,
      capabilities: {
        dock: { docked: false, dockId: null },
        waterLevel: { percent: 60 },
        sequence: { value: 0 },
      },
      core: {
        connectivity: "unknown",
        batteryPercent: 38.46,
        position: { frame: "SITE-NORTH", x: -22.989, y: 13.262 },
        status: "idle",
        health: { severity: "nominal" },
      },
    });
  });

  it("produces output the contract itself accepts", () => {
    for (const name of ["representative", "boundary-empty", "boundary-full"] as const) {
      const envelope = decoded(name);
      // Capabilities encoded first: `parseAdapterEnvelope` validates the wire form
      // while `AdapterEnvelope` is the runtime form (see vendor A's test, TODO FIXME).
      const wire = { ...envelope, capabilities: encodeCapabilities(envelope.capabilities) };

      expect(parseAdapterEnvelope(wire).ok).toBe(true);
    }
  });

  it("declares no lidarHealth, by key absence rather than a null payload", () => {
    // The single most load-bearing assertion for this vendor. A `lidarHealth: null`
    // would claim vendor C reports a lidar it does not have, and the console would
    // render a panel for it (ADR 1, D6).
    const capabilities = decoded("representative").capabilities;

    expect(Object.keys(capabilities).sort()).toEqual(["dock", "sequence", "waterLevel"]);
    expect("lidarHealth" in capabilities).toBe(false);
  });

  it("declares waterLevel where vendor A declares lidarHealth", () => {
    // The difference the console renders as a different panel: same robot detail
    // page, different capability section, decided entirely by the adapter.
    expect(decoded("boundary-empty").capabilities.waterLevel).toEqual({ percent: 0 });
    expect(decoded("boundary-full").capabilities.waterLevel).toEqual({ percent: 100 });
  });

  it("passes the tank percentage through without the battery's conversion", () => {
    // Vendor C sends battery as a fraction and water as a percentage. Applying one
    // dialect's unit rule to both fields is the mistake this pins.
    const envelope = decoded("representative");

    expect(envelope.core.batteryPercent).toBe(38.46);
    expect(envelope.capabilities.waterLevel?.percent).toBe(60);
  });

  it("converts a fraction to a percentage at both ends of the range", () => {
    expect(decoded("boundary-empty").core.batteryPercent).toBe(0);
    expect(decoded("boundary-full").core.batteryPercent).toBe(100);
  });

  it("carries the dock identifier when the robot is docked", () => {
    expect(decoded("boundary-empty").capabilities.dock).toEqual({
      docked: true,
      dockId: "SITE-NORTH-DOCK-03",
    });
  });

  it("maps every status the dialect can send", () => {
    const base = fixtureObject();
    const telemetry = asRecord(base.telemetry, "telemetry block");

    for (const state of ["idle", "busy", "charging", "fault"] as const) {
      const result = decode({ ...base, telemetry: { ...telemetry, state } });

      expect(result.ok && result.value.core.status).toBe(state);
    }
  });

  it("maps every health level the dialect can send", () => {
    // `critical` appears in no recorded payload for this vendor either, so the
    // bottom row of the module comment's health table needs a payload built here
    // to be checked at all.
    const base = fixtureObject();
    const telemetry = asRecord(base.telemetry, "telemetry block");

    for (const level of ["nominal", "degraded", "critical"] as const) {
      const result = decode({ ...base, telemetry: { ...telemetry, health: { level } } });

      expect(result.ok && result.value.core.health.severity).toBe(level);
    }
  });

  it("rejects a word outside either vocabulary rather than guessing at one", () => {
    // Vendor A's assertion restated against this dialect, deliberately, for the
    // same reason its table is restated rather than imported: two vendor contracts
    // that agree today are not one contract, and the day C adds a fifth state is
    // the day the shared version of this test would have been quietly wrong for A.
    //
    // `status` has a canonical `unknown` a lenient adapter could downgrade to and
    // `health.severity` has none, so the two fields reject for different reasons.
    const base = fixtureObject();
    const telemetry = asRecord(base.telemetry, "telemetry block");

    for (const [path, block] of [
      ["telemetry.state", { ...telemetry, state: "hibernating" }],
      ["telemetry.health.level", { ...telemetry, health: { level: "warning" } }],
    ] as const) {
      const result = decode({ ...base, telemetry: block });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.kind).toBe("malformed_payload");
      expect(result.error.issues.map((issue) => issue.path)).toEqual([path]);
    }
  });

  it("takes receipt time from the caller rather than any clock", () => {
    expect(decode(loadVendorFixture("C").payload, 1)).toMatchObject({
      value: { receivedAt: 1, reportedAt: 1_755_600_000_000 },
    });
  });
});

describe("vendor C unknown-field accounting", () => {
  it("counts the undocumented field at its dotted path", () => {
    // The evidence for ADR 1's counting requirement. `firmware_channel` is nested,
    // so a walk comparing top-level keys only would report nothing here and pass.
    const ledger = createUnknownFieldLedger();

    createVendorCAdapter(ledger)(loadVendorFixture("C").payload, RECEIVED_AT);

    expect(ledger.snapshot().byAdapter.C).toEqual({
      total: 1,
      fields: { "telemetry.firmware_channel": 1 },
    });
  });

  it("counts it on every recorded case, since the dialect always sends it", () => {
    const ledger = createUnknownFieldLedger();
    const adapter = createVendorCAdapter(ledger);

    for (const name of ["representative", "boundary-empty", "boundary-full"] as const) {
      adapter(loadVendorFixture("C", name).payload, RECEIVED_AT);
    }

    expect(ledger.snapshot().byAdapter.C.fields["telemetry.firmware_channel"]).toBe(3);
  });

  it("counts per adapter, not per robot", () => {
    // Two different robots, one count of two — the precision ADR 1 permits and the
    // console labels "(adapter, fleet-wide)" for that reason (A-5).
    const ledger = createUnknownFieldLedger();
    const adapter = createVendorCAdapter(ledger);
    const base = fixtureObject();

    adapter(base, RECEIVED_AT);
    adapter({ ...base, robot_id: "R-006" }, RECEIVED_AT);

    expect(ledger.snapshot().byAdapter.C).toEqual({
      total: 2,
      fields: { "telemetry.firmware_channel": 2 },
    });
  });

  it("leaves other adapters' tallies at zero", () => {
    // One ledger, three adapters. A vendor C payload must not move vendor A's count.
    const ledger = createUnknownFieldLedger();

    createVendorCAdapter(ledger)(loadVendorFixture("C").payload, RECEIVED_AT);

    expect(ledger.snapshot().byAdapter.A).toEqual({ total: 0, fields: {} });
    expect(ledger.snapshot().byAdapter.B).toEqual({ total: 0, fields: {} });
  });

  it("counts nothing when the payload was rejected, however new its fields", () => {
    // A malformed payload carrying a brand-new field must leave the ledger at zero
    // while the failure is counted elsewhere (ADR 15, D5).
    const ledger = createUnknownFieldLedger();
    const result = createVendorCAdapter(ledger)(
      { ...fixtureObject(), seq: -1, brand_new: "x" },
      RECEIVED_AT,
    );

    expect(result.ok).toBe(false);
    expect(ledger.snapshot().byAdapter.C).toEqual({ total: 0, fields: {} });
  });

  it("reports the scope its counts cover, rather than leaving it to a caption", () => {
    expect(createUnknownFieldLedger().snapshot().scope).toBe("accepted");
  });
});

describe("vendor C adapter rejections", () => {
  it("rejects its hand-authored malformed payload as an unmappable timestamp", () => {
    // Structurally valid — `timestamp` really is a string — so this is
    // `unmappable_value`, not `malformed_payload`. The two kinds are counted
    // separately by the server (ADR 20, D4).
    const result = decode(loadMalformedPayload("C", "unparsable-timestamp").payload);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unmappable_value");
    expect(result.error.vendor).toBe("C");
    expect(result.error.issues.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: "timestamp", code: "unmappable_value" },
    ]);
  });

  it("counts the undocumented field even on the payload it then rejects", () => {
    // Deliberate and worth stating: the schema accepted this document, so the field
    // is counted, and only the *value* judgement failed afterwards. The ledger
    // tracks dialect drift, which happened here regardless of the timestamp.
    const ledger = createUnknownFieldLedger();
    const payload = loadMalformedPayload("C", "unparsable-timestamp").payload;

    expect(createVendorCAdapter(ledger)(payload, RECEIVED_AT).ok).toBe(false);
    expect(ledger.snapshot().byAdapter.C.total).toBe(1);
  });

  it("rejects a payload missing the water block, since waterLevel has no source", () => {
    const base = fixtureObject();
    const withoutWater = asRecord(base.telemetry, "telemetry block");
    delete withoutWater.water;

    const result = decode({ ...base, telemetry: withoutWater });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues.map((issue) => issue.path)).toEqual(["telemetry.water"]);
  });

  it("returns a failure rather than throwing, for every malformed shape", () => {
    for (const payload of [null, undefined, 42, "text", [], {}]) {
      expect(() => decode(payload)).not.toThrow();
      expect(decode(payload).ok).toBe(false);
    }
  });
});
