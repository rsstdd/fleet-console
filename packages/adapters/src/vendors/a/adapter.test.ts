/**
 * Vendor A's contract test: the recorded dialect in, an exact canonical envelope
 * out (adapters TODO C2, D2).
 *
 * Explicit assertions rather than snapshots, because the mapping invariants are
 * the documentation and a snapshot records whatever the code did on the day
 * (AGENTS.md § Tests and fixtures). `receivedAt` is a literal on every call: the
 * lint rule bans a clock, and a fixed instant is what makes an exact expected
 * envelope stateable at all (D3).
 */
import { encodeCapabilities, parseAdapterEnvelope, SCHEMA_VERSION } from "@fleet/contracts";
import { describe, expect, it } from "vitest";

import { createUnknownFieldLedger } from "../../core/unknownFields.ts";
import { FIXTURE_RECORDING, loadMalformedPayload, loadVendorFixture } from "../../testing/index.ts";
import { createVendorAAdapter } from "./adapter.ts";

/** One instant after the pinned recording instant, so the two are never confused. */
const RECEIVED_AT = FIXTURE_RECORDING.instantMs + 250;

function decode(payload: unknown, receivedAt = RECEIVED_AT) {
  return createVendorAAdapter(createUnknownFieldLedger())(payload, receivedAt);
}

function decoded(name: Parameters<typeof loadVendorFixture>[1]) {
  const result = decode(loadVendorFixture("A", name).payload);
  if (!result.ok) {
    throw new Error(`Vendor A rejected its own ${String(name)} fixture.`);
  }
  return result.value;
}

describe("vendor A adapter", () => {
  it("decodes the representative payload into an exact canonical envelope", () => {
    expect(decoded("representative")).toEqual({
      schemaVersion: SCHEMA_VERSION,
      robotId: "R-001",
      siteId: "SITE-NORTH",
      vendorId: "A",
      model: "AX-240",
      adapterId: "vendor-a",
      adapterVersion: "1.0.0",
      // 2025-08-19T10:40:00.000Z, the ISO string the dialect sent.
      reportedAt: 1_755_600_000_000,
      receivedAt: RECEIVED_AT,
      capabilities: {
        dock: { docked: false, dockId: null },
        lidarHealth: { severity: "nominal", rpm: 600 },
        sequence: { value: 0 },
      },
      core: {
        connectivity: "unknown",
        batteryPercent: 96.61,
        position: { frame: "SITE-NORTH", x: 2.512, y: 5.922 },
        status: "busy",
        health: { severity: "nominal" },
      },
    });
  });

  it("produces output the contract itself accepts", () => {
    // The adapter builds the envelope by hand, so nothing but this proves the
    // result is a legal `AdapterEnvelope` rather than merely well-typed (A7).
    //
    // Capabilities are encoded first, and that step is load-bearing rather than
    // ceremony: `AdapterEnvelope` is the schema's *output* type, carrying the
    // runtime record, while `parseAdapterEnvelope` validates the schema's *input*,
    // which is the wire array. Passing the envelope straight in fails with
    // "expected array, received object" — a decode error about the validator's
    // direction, not about the adapter. There is no `encodeAdapterEnvelope` in
    // `@fleet/contracts` beside `encodeCanonicalEnvelope`; see TODO § FIXME.
    for (const name of ["representative", "boundary-empty", "boundary-full"] as const) {
      const envelope = decoded(name);
      const wire = { ...envelope, capabilities: encodeCapabilities(envelope.capabilities) };

      expect(parseAdapterEnvelope(wire).ok).toBe(true);
    }
  });

  it("never emits freshness, which is the server's alone", () => {
    // ADR 10: the type forbids it and the strict schema would reject it, but a
    // missing key is the property a reader of this test needs stated.
    expect(decoded("representative")).not.toHaveProperty("freshness");
  });

  it("converts a fraction to a percentage at both ends of the range", () => {
    expect(decoded("boundary-empty").core.batteryPercent).toBe(0);
    expect(decoded("boundary-full").core.batteryPercent).toBe(100);
  });

  it("carries no floating-point noise into the percentage", () => {
    // This fixture's 0.9661 multiplies cleanly, so it is not itself the evidence;
    // `core/units.test.ts` holds that. Pinned here because the conversion is the
    // one canonical value a reader of this envelope is most likely to check.
    expect(decoded("representative").core.batteryPercent).toBe(96.61);
  });

  it("names the site as the position frame, since the pose has no other frame", () => {
    expect(decoded("boundary-empty").core.position).toEqual({
      frame: "SITE-NORTH",
      x: -40,
      y: -40,
    });
  });

  it("reports connectivity as unknown, because the dialect carries no link state", () => {
    // Not an omission: `connectivitySchema` says a vendor reporting no link state
    // maps to `unknown` rather than an optimistic `online`.
    expect(decoded("boundary-full").core.connectivity).toBe("unknown");
  });

  it("declares exactly dock, lidarHealth and sequence", () => {
    // By key set, not by null payloads: absence is the declaration (ADR 1, D6).
    expect(Object.keys(decoded("representative").capabilities).sort()).toEqual([
      "dock",
      "lidarHealth",
      "sequence",
    ]);
    expect(decoded("representative").capabilities).not.toHaveProperty("waterLevel");
  });

  it("carries the dock identifier when the robot is docked", () => {
    expect(decoded("boundary-empty").capabilities.dock).toEqual({
      docked: true,
      dockId: "SITE-NORTH-DOCK-01",
    });
  });

  it("maps the lidar fault flag to the unit's own severity", () => {
    // The dialect sends a boolean, so `degraded` is unreachable for vendor A and
    // the adapter says so rather than inventing a middle state from spin rate.
    expect(decoded("boundary-empty").capabilities.lidarHealth).toEqual({
      severity: "critical",
      rpm: 0,
    });
    expect(decoded("boundary-full").capabilities.lidarHealth).toEqual({
      severity: "nominal",
      rpm: 600,
    });
  });

  it("keeps the robot's health separate from the lidar unit's", () => {
    // Both are `health` shaped and they legitimately disagree: a docked robot with
    // a broken lidar reads `degraded` overall and `critical` for the unit.
    const envelope = decoded("boundary-empty");

    expect(envelope.core.health).toEqual({ severity: "degraded" });
    expect(envelope.capabilities.lidarHealth?.severity).toBe("critical");
  });

  it("maps every status the dialect can send", () => {
    // The recorded set carries `busy` and `idle`; the other two are asserted here
    // so the table in the module comment is checked rather than merely written.
    const telemetry = vendorATelemetryObject();

    for (const state of ["idle", "busy", "charging", "fault"] as const) {
      const result = decode({ ...vendorAFixtureObject(), telemetry: { ...telemetry, state } });

      expect(result.ok && result.value.core.status).toBe(state);
    }
  });

  it("maps every health level the dialect can send", () => {
    // `critical` appears in no recorded payload, so without this the bottom row of
    // the module comment's health table is written and never checked.
    const telemetry = vendorATelemetryObject();

    for (const level of ["nominal", "degraded", "critical"] as const) {
      const result = decode({
        ...vendorAFixtureObject(),
        telemetry: { ...telemetry, health: { level } },
      });

      expect(result.ok && result.value.core.health.severity).toBe(level);
    }
  });

  it("rejects a word outside either vocabulary rather than guessing at one", () => {
    // The module comment's claim that canonical `unknown` is unreachable from this
    // dialect, checked rather than asserted in prose. A vendor that spells its
    // states as words has declared its vocabulary in the document, so a fifth word
    // is a malformed document — not a robot whose state cannot be determined.
    //
    // The two fields fail for different reasons, which is why both are here:
    // `status` has a canonical `unknown` that a lenient adapter could downgrade to,
    // and `health.severity` has none at all, so rejection is the only answer the
    // contract leaves for a level it does not know.
    const telemetry = vendorATelemetryObject();

    for (const [path, block] of [
      ["telemetry.state", { ...telemetry, state: "hibernating" }],
      ["telemetry.health.level", { ...telemetry, health: { level: "warning" } }],
    ] as const) {
      const result = decode({ ...vendorAFixtureObject(), telemetry: block });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.kind).toBe("malformed_payload");
      expect(result.error.issues.map((issue) => issue.path)).toEqual([path]);
    }
  });

  it("takes receipt time from the caller rather than any clock", () => {
    expect(decode(loadVendorFixture("A").payload, 1).ok).toBe(true);
    expect(decode(loadVendorFixture("A").payload, 1)).toMatchObject({
      value: { receivedAt: 1, reportedAt: 1_755_600_000_000 },
    });
  });
});

describe("vendor A adapter rejections", () => {
  it("rejects the malformed payload with a path naming the nested field", () => {
    const result = decode(loadMalformedPayload("A", "wrong-type").payload);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("malformed_payload");
    expect(result.error.vendor).toBe("A");
    expect(result.error.issues.map((issue) => issue.path)).toEqual(["telemetry.battery.level"]);
  });

  it("reports one issue per bad field rather than flattening them", () => {
    // ADR 20's claim, checked on this dialect: two defects, two issues.
    const result = decode({ robot_id: "R-001", site: "SITE-NORTH" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues.length).toBeGreaterThan(1);
  });

  it("rejects a well-formed string that names no instant", () => {
    // Structurally fine, so this is `unmappable_value` and not `malformed_payload`.
    const result = decode({ ...vendorAFixtureObject(), timestamp: "yesterday" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("unmappable_value");
    // The issue's `code` is the rejection kind rather than a string this vendor
    // invented, which is what `issuesForKind` exists to guarantee (ADR 20).
    expect(result.error.issues.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: "timestamp", code: "unmappable_value" },
    ]);
    expect(result.error.issues[0]?.message).toContain("ISO-8601");
  });

  it("never puts a payload value into an issue", () => {
    // These issues are serialized into an HTTP error body (ADR 20, Principle 7).
    const result = decode({ ...vendorAFixtureObject(), robot_id: "not a valid id" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const issue of result.error.issues) {
      expect(issue.message).not.toContain("not a valid id");
    }
  });

  it("returns a failure rather than throwing, for every malformed shape", () => {
    for (const payload of [null, undefined, 42, "text", [], {}]) {
      expect(() => decode(payload)).not.toThrow();
      expect(decode(payload).ok).toBe(false);
    }
  });
});

describe("vendor A unknown-field accounting", () => {
  it("counts an undocumented field at its dotted path, on an accepted payload", () => {
    const ledger = createUnknownFieldLedger();
    const adapter = createVendorAAdapter(ledger);
    const payload = {
      ...vendorAFixtureObject(),
      telemetry: { ...vendorATelemetryObject(), firmware_channel: "beta" },
    };

    expect(adapter(payload, RECEIVED_AT).ok).toBe(true);
    expect(ledger.snapshot().byAdapter.A).toEqual({
      total: 1,
      fields: { "telemetry.firmware_channel": 1 },
    });
  });

  it("counts two robots from one vendor once per path, not once per robot", () => {
    // The ledger is per adapter, never per robot (ADR 1, A-5).
    const ledger = createUnknownFieldLedger();
    const adapter = createVendorAAdapter(ledger);
    const payload = {
      ...vendorAFixtureObject(),
      telemetry: { ...vendorATelemetryObject(), firmware_channel: "beta" },
    };

    adapter(payload, RECEIVED_AT);
    adapter({ ...payload, robot_id: "R-004" }, RECEIVED_AT);

    expect(ledger.snapshot().byAdapter.A).toEqual({
      total: 2,
      fields: { "telemetry.firmware_channel": 2 },
    });
  });

  it("leaves the ledger untouched when the payload was rejected", () => {
    // A rejected payload belongs to the server's malformed-ingest counter, and the
    // two must never be summed (ADR 15). A retry loop would otherwise make dialect
    // drift and a stuck client look identical.
    const ledger = createUnknownFieldLedger();
    const adapter = createVendorAAdapter(ledger);

    const result = adapter({ ...vendorAFixtureObject(), seq: -1, brand_new: "x" }, RECEIVED_AT);

    expect(result.ok).toBe(false);
    expect(ledger.snapshot().byAdapter.A).toEqual({ total: 0, fields: {} });
  });

  it("does not count a declared field the canonical model drops", () => {
    // `heading_deg` is reported by the dialect and has no canonical home. It is
    // declared in the schema, so the drop is deliberate and the ledger stays quiet
    // — the alternative would report every intentional omission as dialect drift.
    const ledger = createUnknownFieldLedger();

    createVendorAAdapter(ledger)(loadVendorFixture("A").payload, RECEIVED_AT);

    expect(ledger.snapshot().byAdapter.A.total).toBe(0);
  });
});

/** The recorded vendor A payload as a spreadable object, without a type assertion. */
function vendorAFixtureObject(): Record<string, unknown> {
  const payload = loadVendorFixture("A").payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Vendor A fixture is not an object.");
  }
  return { ...payload };
}

/** The recorded vendor A telemetry block as a spreadable object, without a type assertion. */
function vendorATelemetryObject(): Record<string, unknown> {
  const payload = vendorAFixtureObject();
  const telemetry = payload.telemetry;
  if (typeof telemetry !== "object" || telemetry === null || Array.isArray(telemetry)) {
    throw new Error("Vendor A fixture has no telemetry object.");
  }
  return { ...telemetry };
}
