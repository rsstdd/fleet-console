/**
 * Vendor B's contract test: the recorded dialect in, an exact canonical envelope
 * out (adapters TODO C3, D2).
 *
 * Explicit assertions rather than snapshots, because the mapping invariants are
 * the documentation and a snapshot records whatever the code did on the day
 * (AGENTS.md § Tests and fixtures). `receivedAt` is a literal on every call: the
 * lint rule bans a clock, and a fixed instant is what makes an exact expected
 * envelope stateable at all (D3).
 *
 * What this file has that vendor A's does not is a *code* vocabulary. Vendor B
 * spells status, health and dock state as integers, so the tables in the adapter's
 * module comment are the whole of its meaning, and every row of all three is
 * asserted here — including the codes no recorded payload carries (**C5**).
 */
import {
  CAPABILITY_KINDS,
  CAPABILITY_NAMES,
  encodeCapabilities,
  isOperatorCapability,
  OPERATOR_CAPABILITY_NAMES,
  parseAdapterEnvelope,
  SCHEMA_VERSION,
} from "@fleet/contracts";
import { describe, expect, it } from "vitest";

import { createUnknownFieldLedger } from "../../core/unknownFields.ts";
import { FIXTURE_RECORDING, loadMalformedPayload, loadVendorFixture } from "../../testing/index.ts";
import { createVendorBAdapter } from "./adapter.ts";

/** One instant after the pinned recording instant, so the two are never confused. */
const RECEIVED_AT = FIXTURE_RECORDING.instantMs + 250;

function decode(payload: unknown, receivedAt = RECEIVED_AT) {
  return createVendorBAdapter(createUnknownFieldLedger())(payload, receivedAt);
}

function decoded(name: Parameters<typeof loadVendorFixture>[1]) {
  const result = decode(loadVendorFixture("B", name).payload);
  if (!result.ok) {
    throw new Error(`Vendor B rejected its own ${String(name)} fixture.`);
  }
  return result.value;
}

describe("vendor B adapter", () => {
  it("decodes the representative payload into an exact canonical envelope", () => {
    expect(decoded("representative")).toEqual({
      schemaVersion: SCHEMA_VERSION,
      robotId: "R-002",
      siteId: "SITE-NORTH",
      vendorId: "B",
      model: "BR-15",
      adapterId: "vendor-b",
      adapterVersion: "1.0.0",
      // The dialect's own epoch milliseconds, carried across unchanged: vendor B
      // needs no instant parsing, which is why `parseIsoInstant` lives in `core/`
      // for the other two rather than here.
      reportedAt: 1_755_600_000_000,
      receivedAt: RECEIVED_AT,
      capabilities: {
        dock: { docked: false, dockId: null },
      },
      core: {
        connectivity: "unknown",
        batteryPercent: 75,
        position: { frame: "SITE-NORTH", x: -20.77, y: 10.26 },
        status: "idle",
        health: { severity: "nominal" },
      },
    });
  });

  it("produces output the contract itself accepts", () => {
    // The adapter builds the envelope by hand, so nothing but this proves the
    // result is a legal `AdapterEnvelope` rather than merely well-typed (A7).
    // Capabilities are encoded first because `parseAdapterEnvelope` validates the
    // schema's *input* — the wire array — while `AdapterEnvelope` is its output.
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

  it("carries the whole percentage across without converting it", () => {
    // Vendor B already reports what the canonical model wants. The interesting
    // property is the absence of arithmetic: nothing here can introduce the
    // floating-point noise vendor A's fraction-to-percentage step has to remove.
    expect(decoded("boundary-empty").core.batteryPercent).toBe(0);
    expect(decoded("representative").core.batteryPercent).toBe(75);
    expect(decoded("boundary-full").core.batteryPercent).toBe(100);
  });

  it("converts centimetres to metres at both ends of the range", () => {
    expect(decoded("boundary-empty").core.position).toEqual({
      frame: "SITE-NORTH",
      x: -40,
      y: -40,
    });
    expect(decoded("boundary-full").core.position).toEqual({
      frame: "SITE-NORTH",
      x: 40,
      y: 40,
    });
  });

  it("names the site as the position frame, since the pose has no other frame", () => {
    expect(decoded("representative").core.position?.frame).toBe("SITE-NORTH");
  });

  it("reports connectivity as unknown, because the dialect carries no link state", () => {
    // Not an omission: `connectivitySchema` says a vendor reporting no link state
    // maps to `unknown` rather than an optimistic `online`.
    expect(decoded("boundary-full").core.connectivity).toBe("unknown");
  });

  it("takes receipt time from the caller rather than any clock", () => {
    expect(decode(loadVendorFixture("B").payload, 1)).toMatchObject({
      value: { receivedAt: 1, reportedAt: 1_755_600_000_000 },
    });
  });
});

describe("vendor B capability declarations", () => {
  it("declares dock, and dock only", () => {
    // By key set, not by null payloads: absence is the declaration (ADR 1, D6).
    expect(Object.keys(decoded("representative").capabilities)).toEqual(["dock"]);
  });

  it("declares no sequence, because a timestamp is not a counter", () => {
    // Vendor B sends no counter and `ts` is not one: ordering by timestamp cannot
    // separate a duplicate delivery from two events in the same millisecond, which
    // is the ambiguity this vendor exists to demonstrate (ADR 1 § Implications).
    // Synthesizing one here would delete the thing being demonstrated.
    expect(decoded("representative").capabilities).not.toHaveProperty("sequence");
  });

  it("declares no lidarHealth, which is what makes its panel grid differ from vendor A's", () => {
    // ADR 19 is the citation, not the page spec's prose: `sequence` is classified
    // `diagnostic` in `CAPABILITY_KINDS` and is therefore absent from
    // `OPERATOR_CAPABILITY_NAMES`, which is what the console keys its panel
    // registry off. So a vendor B that declared `lidarHealth` would render the same
    // panels as vendor A no matter what it did about `sequence` — the absence
    // asserted here is the only thing making the two profiles differ.
    expect(CAPABILITY_KINDS.sequence).toBe("diagnostic");
    expect(OPERATOR_CAPABILITY_NAMES).not.toContain("sequence");

    const envelope = decoded("representative");
    const declared = CAPABILITY_NAMES.filter((name) => envelope.capabilities[name] !== undefined);

    expect(declared.filter(isOperatorCapability)).toEqual(["dock"]);
  });

  it("reports docking without naming a dock, because the dialect has no dock id", () => {
    // `dockCapabilitySchema` makes `dockId` nullable for exactly this case. A
    // synthesized name — the site, the robot id — would be an invention an
    // operator could act on.
    expect(decoded("boundary-empty").capabilities.dock).toEqual({
      docked: true,
      dockId: null,
    });
  });
});

describe("vendor B code vocabularies", () => {
  it("maps every status code the dialect can send", () => {
    // The recorded payloads carry `0` and `2` only; the whole table is asserted
    // here, which is what discharges C5 for this vendor.
    const expected = [
      [0, "idle"],
      [1, "busy"],
      [2, "charging"],
      [3, "fault"],
    ] as const;

    for (const [status_code, status] of expected) {
      const result = decode({ ...vendorBFixtureObject(), status_code });

      expect(result.ok && result.value.core.status).toBe(status);
    }
  });

  it("maps every health code the dialect can send", () => {
    const expected = [
      [0, "nominal"],
      [1, "degraded"],
      [2, "critical"],
    ] as const;

    for (const [health_code, severity] of expected) {
      const result = decode({ ...vendorBFixtureObject(), health_code });

      expect(result.ok && result.value.core.health.severity).toBe(severity);
    }
  });

  it("maps both dock codes", () => {
    expect(decode({ ...vendorBFixtureObject(), dock_state: 0 })).toMatchObject({
      value: { capabilities: { dock: { docked: false } } },
    });
    expect(decode({ ...vendorBFixtureObject(), dock_state: 1 })).toMatchObject({
      value: { capabilities: { dock: { docked: true } } },
    });
  });

  it("rejects a code outside its table rather than guessing or downgrading", () => {
    // Structurally a fine document, so this is `unmappable_value`. Canonical
    // `unknown` would be the wrong answer: it says the robot's state is unknown,
    // when what is unknown is the code — an integration defect the server counts
    // rather than a state an operator should be shown (C5).
    for (const [field, payload] of [
      ["status_code", { status_code: 4 }],
      ["health_code", { health_code: 3 }],
      ["dock_state", { dock_state: 2 }],
    ] as const) {
      const result = decode({ ...vendorBFixtureObject(), ...payload });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.kind).toBe("unmappable_value");
      // The issue's `code` is the rejection kind rather than a string this vendor
      // invented, which is what `issuesForKind` exists to guarantee (ADR 20).
      expect(result.error.issues.map(({ path, code }) => ({ path, code }))).toEqual([
        { path: field, code: "unmappable_value" },
      ]);
    }
  });
});

describe("vendor B adapter rejections", () => {
  it("rejects fractional centimetres and centidegrees, because the wire dialect is integer-valued", () => {
    for (const field of ["x_cm", "y_cm", "heading_cdeg"] as const) {
      const result = decode({ ...vendorBFixtureObject(), [field]: 1.5 });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.kind).toBe("malformed_payload");
      expect(result.error.issues.map((issue) => issue.path)).toEqual([field]);
    }
  });

  it("rejects the malformed payload once per defect rather than flattening them", () => {
    // ADR 20's claim, checked on the dialect's own hand-authored malformed payload:
    // a battery over 100 and a missing timestamp are two issues, at two paths.
    const result = decode(loadMalformedPayload("B", "multiple-defects").payload);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("malformed_payload");
    expect(result.error.vendor).toBe("B");
    expect(result.error.issues.map((issue) => issue.path).sort()).toEqual(["batt_pct", "ts"]);
  });

  it("rejects a timestamp that is a number but not an instant", () => {
    // The schema checks the shape and the adapter checks the meaning, the same
    // split vendor A makes between a string and the instant it may not name.
    for (const ts of [-1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const result = decode({ ...vendorBFixtureObject(), ts });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.kind).toBe("unmappable_value");
      expect(result.error.issues.map((issue) => issue.path)).toEqual(["ts"]);
    }
  });

  it("never puts a payload value into an issue", () => {
    // These issues are serialized into an HTTP error body (ADR 20, Principle 7).
    const result = decode({ ...vendorBFixtureObject(), id: "not a valid id", status_code: 99 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const issue of result.error.issues) {
      expect(issue.message).not.toContain("not a valid id");
      expect(issue.message).not.toContain("99");
    }
  });

  it("returns a failure rather than throwing, for every malformed shape", () => {
    for (const payload of [null, undefined, 42, "text", [], {}]) {
      expect(() => decode(payload)).not.toThrow();
      expect(decode(payload).ok).toBe(false);
    }
  });
});

describe("vendor B unknown-field accounting", () => {
  it("counts an undocumented field at its own name, since the payload is flat", () => {
    // Vendor B has no nested block, so its unknown fields are top-level names.
    // Vendor C is the dialect that proves the walk produces a dotted path.
    const ledger = createUnknownFieldLedger();
    const adapter = createVendorBAdapter(ledger);

    expect(adapter({ ...vendorBFixtureObject(), firmware_channel: "beta" }, RECEIVED_AT).ok).toBe(
      true,
    );
    expect(ledger.snapshot().byAdapter.B).toEqual({
      total: 1,
      fields: { firmware_channel: 1 },
    });
  });

  it("counts two robots from one vendor once per path, not once per robot", () => {
    // The ledger is per adapter, never per robot (ADR 1, A-5).
    const ledger = createUnknownFieldLedger();
    const adapter = createVendorBAdapter(ledger);
    const payload = { ...vendorBFixtureObject(), firmware_channel: "beta" };

    adapter(payload, RECEIVED_AT);
    adapter({ ...payload, id: "R-005" }, RECEIVED_AT);

    expect(ledger.snapshot().byAdapter.B).toEqual({
      total: 2,
      fields: { firmware_channel: 2 },
    });
  });

  it("leaves the ledger untouched when the payload was rejected", () => {
    // A rejected payload belongs to the server's malformed-ingest counter, and the
    // two must never be summed (ADR 15).
    const ledger = createUnknownFieldLedger();

    const result = createVendorBAdapter(ledger)(
      { ...vendorBFixtureObject(), batt_pct: 150, brand_new: "x" },
      RECEIVED_AT,
    );

    expect(result.ok).toBe(false);
    expect(ledger.snapshot().byAdapter.B).toEqual({ total: 0, fields: {} });
  });

  it("counts unknown fields on a payload its schema accepted and its mapping rejected", () => {
    // ADR 15 counts on payloads that pass the vendor *schema*, and says so
    // explicitly since the 20 August 2026 amendment: the gate is schema acceptance,
    // not overall success. An `unmappable_value` rejection is a well-formed document
    // carrying a value the canonical model cannot take, which is dialect change —
    // the signal the ledger exists for. Vendor B is where the ordering becomes
    // visible, with four post-schema rejection paths against vendor A's one, so it
    // is pinned here: moving `noteAcceptedPayload` after the mapping steps fails
    // this test rather than quietly narrowing what the metric counts.
    const ledger = createUnknownFieldLedger();

    const result = createVendorBAdapter(ledger)(
      { ...vendorBFixtureObject(), status_code: 9, firmware_channel: "beta" },
      RECEIVED_AT,
    );

    expect(result.ok).toBe(false);
    expect(ledger.snapshot().byAdapter.B).toEqual({
      total: 1,
      fields: { firmware_channel: 1 },
    });
  });

  it("does not count a declared field the canonical model drops", () => {
    // `heading_cdeg` is reported by the dialect and has no canonical home. It is
    // declared in the schema, so the drop is deliberate and the ledger stays quiet
    // — the alternative would report every intentional omission as dialect drift.
    const ledger = createUnknownFieldLedger();

    createVendorBAdapter(ledger)(loadVendorFixture("B").payload, RECEIVED_AT);

    expect(ledger.snapshot().byAdapter.B.total).toBe(0);
  });
});

/** The recorded vendor B payload as a spreadable object, without a type assertion. */
function vendorBFixtureObject(): Record<string, unknown> {
  const payload = loadVendorFixture("B").payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Vendor B fixture is not an object.");
  }
  return { ...payload };
}
