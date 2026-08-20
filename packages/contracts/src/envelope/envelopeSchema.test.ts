import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "../shared/primitives.js";
import { encodeCapabilities } from "../capabilities/capabilitySchemas.js";
import {
  type AdapterEnvelope,
  adapterEnvelopeSchema,
  type CanonicalEnvelope,
  type CanonicalEnvelopeWire,
  canonicalEnvelopeSchema,
  encodeCanonicalEnvelope,
  parseAdapterEnvelope,
  parseCanonicalEnvelope,
  parseRegisteredRobotState,
  parseRobotDiagnosticEnvelope,
  parseFleetSnapshot,
  parseTelemetryBatch,
  registeredRobotStateSchema,
  robotDiagnosticEnvelopeSchema,
  fleetSnapshotSchema,
  reconcileDeltaWithSnapshot,
  telemetryBatchSchema,
  withFreshness,
} from "./envelopeSchema.js";

const REPORTED_AT = 1_755_600_000_000;
const RECEIVED_AT = 1_755_600_000_120;

/** One server runtime's identity, as `crypto.randomUUID()` mints it (ADR 31). */
const SERVER_SESSION = "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b";

/** A different runtime — the restarted server the reconciliation must detect. */
const OTHER_SESSION = "01d3b5f7-9a2c-4e6d-8b0f-1a3c5e7d9b2f";

/** A complete wire envelope declaring every capability. */
function completeWire(): CanonicalEnvelopeWire {
  return {
    schemaVersion: SCHEMA_VERSION,
    robotId: "R-204",
    siteId: "site.north",
    vendorId: "A",
    model: "Scrubber 4000",
    adapterId: "adapter-a",
    adapterVersion: "1.2.0",
    reportedAt: REPORTED_AT,
    receivedAt: RECEIVED_AT,
    core: {
      connectivity: "online",
      batteryPercent: 67.4,
      position: { frame: "site-map", x: 12.5, y: -3.25 },
      status: "busy",
      health: { severity: "degraded", description: "Brush motor current high" },
    },
    freshness: "live",
    capabilities: [
      { name: "dock", payload: { docked: false, dockId: "dock-3" } },
      { name: "lidarHealth", payload: { severity: "nominal", rpm: 600 } },
      { name: "waterLevel", payload: { percent: 42 } },
      { name: "sequence", payload: { value: 9014 } },
    ],
  };
}

/** A minimal valid wire envelope: no capabilities, nothing the vendor did not report. */
function minimalWire(): CanonicalEnvelopeWire {
  return {
    schemaVersion: SCHEMA_VERSION,
    robotId: "R-087",
    siteId: "site.south",
    vendorId: "B",
    model: "Hauler 2",
    adapterId: "adapter-b",
    adapterVersion: "0.9.1",
    reportedAt: REPORTED_AT,
    receivedAt: RECEIVED_AT,
    core: {
      connectivity: "unknown",
      batteryPercent: null,
      position: null,
      status: "unknown",
      health: { severity: "nominal" },
    },
    freshness: "stale",
    capabilities: [],
  };
}

/** Returns a shallow copy of `source` with one key absent, for the missing-field cases. */
function without(source: object, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));
}

function parsedComplete(): CanonicalEnvelope {
  return canonicalEnvelopeSchema.parse(completeWire());
}

/** The same complete envelope as an adapter produces it: every field but freshness. */
function preFreshnessWire(): Record<string, unknown> {
  return without(completeWire(), "freshness");
}

type Assert<T extends true> = T;
/*
 * The conditional-type identity trick, as in `capabilitySchemas.test.ts`: two
 * types are equal only if the two generic signatures are mutually assignable.
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- see above */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

export type AdapterEnvelopeTypeAssertions = [
  // ADR 10: the adapter envelope is the canonical envelope minus exactly one
  // field. Deriving one shape from the other is what keeps that true; this
  // assertion is what fails if someone stops deriving it.
  Assert<Equals<keyof AdapterEnvelope, Exclude<keyof CanonicalEnvelope, "freshness">>>,
];

describe("canonicalEnvelopeSchema", () => {
  it("decodes a complete envelope and turns capabilities into the runtime record", () => {
    const envelope = parsedComplete();

    expect(envelope.robotId).toBe("R-204");
    expect(envelope.core.status).toBe("busy");
    expect(envelope.capabilities.waterLevel).toEqual({ percent: 42 });
    // The wire array is gone by the time a consumer sees it.
    expect(Array.isArray(envelope.capabilities)).toBe(false);
  });

  it("decodes a minimal envelope, with capabilities as an empty record", () => {
    const envelope = canonicalEnvelopeSchema.parse(minimalWire());

    expect(envelope.capabilities).toEqual({});
    expect(envelope.core.batteryPercent).toBeNull();
    expect(envelope.core.position).toBeNull();
  });

  it("requires each field category, one at a time", () => {
    for (const field of [
      "schemaVersion",
      "robotId",
      "siteId",
      "vendorId",
      "model",
      "adapterId",
      "adapterVersion",
      "reportedAt",
      "receivedAt",
      "core",
      "freshness",
      "capabilities",
    ] as const) {
      const result = parseCanonicalEnvelope(without(completeWire(), field));
      expect(result.ok, `expected a missing ${field} to be rejected`).toBe(false);
    }
  });

  it("requires each core field, one at a time", () => {
    for (const field of [
      "connectivity",
      "batteryPercent",
      "position",
      "status",
      "health",
    ] as const) {
      const wire = completeWire();
      const result = parseCanonicalEnvelope({ ...wire, core: without(wire.core, field) });
      expect(result.ok, `expected a missing core.${field} to be rejected`).toBe(false);
    }
  });

  it("rejects malformed nested values with a path pointing at them", () => {
    const wire = completeWire();
    const result = parseCanonicalEnvelope({
      ...wire,
      core: { ...wire.core, position: { frame: "site-map", x: "north", y: 0 } },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.issues).toContainEqual(
      expect.objectContaining({ path: "core.position.x", code: "invalid_type" }),
    );
  });

  it("rejects an unsupported schema version rather than reinterpreting it", () => {
    const result = parseCanonicalEnvelope({ ...completeWire(), schemaVersion: "1" });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.issues[0]?.path).toBe("schemaVersion");
  });

  it("rejects additional canonical fields rather than stripping them", () => {
    // Canonical drift must be loud. Vendor unknown-field accounting is a
    // different problem and belongs to packages/adapters, which counts them
    // (ADR 1) rather than letting them through here.
    expect(parseCanonicalEnvelope({ ...completeWire(), tenantId: "acme" }).ok).toBe(false);

    const wire = completeWire();
    expect(parseCanonicalEnvelope({ ...wire, core: { ...wire.core, heading: 90 } }).ok).toBe(false);
  });

  it("rejects a raw payload on the fleet envelope", () => {
    // ADR 1: raw payload is excluded from the fleet read model and the delta
    // stream, and served only on the single-robot endpoint.
    expect(parseCanonicalEnvelope({ ...completeWire(), rawPayload: { any: "thing" } }).ok).toBe(
      false,
    );
  });

  it("accepts receivedAt earlier than reportedAt, because vendor clocks skew", () => {
    // No ordering invariant is imposed. Vendor A sends its own ISO timestamp,
    // and a skewed vendor clock is a real condition the technician clock-delta
    // readout exists to show — rejecting it here would drop the evidence.
    const result = parseCanonicalEnvelope({
      ...completeWire(),
      reportedAt: RECEIVED_AT,
      receivedAt: REPORTED_AT,
    });

    expect(result.ok).toBe(true);
  });

  it("accepts every freshness state on the envelope, including unknown", () => {
    for (const freshness of ["live", "stale", "unreachable", "unknown"] as const) {
      expect(parseCanonicalEnvelope({ ...completeWire(), freshness }).ok).toBe(true);
    }
  });

  it("rejects a capability array carrying a mismatched payload", () => {
    const result = parseCanonicalEnvelope({
      ...completeWire(),
      capabilities: [{ name: "dock", payload: { percent: 42 } }],
    });

    expect(result.ok).toBe(false);
  });
});

describe("encodeCanonicalEnvelope", () => {
  it("round-trips parse → encode → JSON → parse", () => {
    const envelope = parsedComplete();

    const wire = encodeCanonicalEnvelope(envelope);
    const decoded = canonicalEnvelopeSchema.parse(JSON.parse(JSON.stringify(wire)));

    expect(decoded).toEqual(envelope);
  });

  it("round-trips the minimal envelope too", () => {
    const envelope = canonicalEnvelopeSchema.parse(minimalWire());

    const decoded = canonicalEnvelopeSchema.parse(
      JSON.parse(JSON.stringify(encodeCanonicalEnvelope(envelope))),
    );

    expect(decoded).toEqual(envelope);
  });

  it("emits capabilities as the wire array in canonical order", () => {
    const wire = encodeCanonicalEnvelope(parsedComplete());

    expect(wire.capabilities).toEqual(encodeCapabilities(parsedComplete().capabilities));
    expect(wire.capabilities.map((entry) => entry.name)).toEqual([
      "dock",
      "lidarHealth",
      "waterLevel",
      "sequence",
    ]);
  });

  it("emits no rawPayload field", () => {
    expect(encodeCanonicalEnvelope(parsedComplete())).not.toHaveProperty("rawPayload");
  });
});

describe("adapterEnvelopeSchema", () => {
  it("decodes every canonical field except freshness", () => {
    const envelope = adapterEnvelopeSchema.parse(preFreshnessWire());

    expect(envelope.robotId).toBe("R-204");
    expect(envelope.receivedAt).toBe(RECEIVED_AT);
    expect(envelope.core.status).toBe("busy");
    // Capabilities decode to the runtime record here exactly as they do on the
    // canonical envelope; the two shapes differ in one field and nothing else.
    expect(envelope.capabilities.waterLevel).toEqual({ percent: 42 });
    expect(envelope).not.toHaveProperty("freshness");
  });

  it("rejects an envelope that asserts freshness", () => {
    // The point of the type (ADR 3, ADR 10). An adapter has no clock and no
    // sweep, so a freshness value coming out of one is either invented or
    // copied, and both are the duplicate authority Principle 1 forbids.
    // `completeWire()` differs from `preFreshnessWire()` in exactly one key, so
    // an unrecognized-key rejection here names freshness and nothing else.
    const result = parseAdapterEnvelope(completeWire());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The rejected key is in the issue's path, not only in its message: ADR 20
    // expands one Zod `unrecognized_keys` issue into one issue per key, so this
    // reads the contract vocabulary rather than reaching for the raw Zod error.
    expect(
      result.issues
        .filter((issue) => issue.code === "unrecognized_keys")
        .map((issue) => issue.path),
    ).toEqual(["freshness"]);
  });

  it("still requires every field the canonical envelope requires", () => {
    for (const field of [
      "schemaVersion",
      "robotId",
      "siteId",
      "vendorId",
      "model",
      "adapterId",
      "adapterVersion",
      "reportedAt",
      "receivedAt",
      "core",
      "capabilities",
    ] as const) {
      const result = parseAdapterEnvelope(without(preFreshnessWire(), field));
      expect(result.ok, `expected a missing ${field} to be rejected`).toBe(false);
    }
  });

  it("rejects an unrecognized field, like every other canonical shape", () => {
    expect(parseAdapterEnvelope({ ...preFreshnessWire(), extra: 1 }).ok).toBe(false);
  });
});

describe("withFreshness", () => {
  it("turns an adapter envelope into a canonical one, adding only freshness", () => {
    // The ingest path in one line: the adapter produces everything it can know,
    // and the server supplies the one field it alone owns (ADR 10).
    const adapterEnvelope: AdapterEnvelope = adapterEnvelopeSchema.parse(preFreshnessWire());

    const canonical = withFreshness(adapterEnvelope, "live");

    expect(canonical.freshness).toBe("live");
    expect(canonicalEnvelopeSchema.safeParse(encodeCanonicalEnvelope(canonical)).success).toBe(
      true,
    );
    expect(without(canonical, "freshness")).toEqual(adapterEnvelope);
  });

  it("does not mutate the adapter envelope it was given", () => {
    const adapterEnvelope = adapterEnvelopeSchema.parse(preFreshnessWire());

    withFreshness(adapterEnvelope, "stale");

    expect(adapterEnvelope).not.toHaveProperty("freshness");
  });

  it("changes only the freshness field", () => {
    // ADR 3's stated invariant: the sweep reads receivedAt and writes
    // freshness, and the operator-facing "last seen" value reads reportedAt,
    // so a freshness-only transition cannot disturb it by construction.
    const envelope = parsedComplete();
    const swept = withFreshness(envelope, "unreachable");

    expect(swept.freshness).toBe("unreachable");
    expect(swept.reportedAt).toBe(envelope.reportedAt);
    expect(swept.receivedAt).toBe(envelope.receivedAt);
    expect(swept.core).toEqual(envelope.core);
    expect(swept.capabilities).toEqual(envelope.capabilities);
    expect({ ...swept, freshness: envelope.freshness }).toEqual(envelope);
  });

  it("returns a new envelope rather than mutating the original", () => {
    const envelope = parsedComplete();

    withFreshness(envelope, "unreachable");

    expect(envelope.freshness).toBe("live");
  });

  it("returns the same envelope when the state has not changed", () => {
    // The sweep runs twice a second over every robot. An unchanged verdict
    // returning the identical reference lets the fan-out coalescer skip it by
    // identity instead of deep comparison (ADR 2).
    const envelope = parsedComplete();

    expect(withFreshness(envelope, "live")).toBe(envelope);
  });
});

describe("registeredRobotStateSchema", () => {
  it("accepts a manifest robot that has never reported", () => {
    const result = parseRegisteredRobotState({
      schemaVersion: SCHEMA_VERSION,
      robotId: "R-900",
      siteId: "site.north",
      vendorId: "C",
      freshness: "unknown",
    });

    expect(result.ok).toBe(true);
  });

  it("permits only unknown freshness, because there is no telemetry to age", () => {
    for (const freshness of ["live", "stale", "unreachable"] as const) {
      expect(
        registeredRobotStateSchema.safeParse({
          schemaVersion: SCHEMA_VERSION,
          robotId: "R-900",
          siteId: "site.north",
          vendorId: "C",
          freshness,
        }).success,
      ).toBe(false);
    }
  });

  it("carries no timestamps, core, or capabilities", () => {
    // This is why it is a separate schema rather than an envelope with
    // nullable provenance: a robot that has never reported has no reportedAt
    // to null out, and a nullable field would invite one.
    for (const extra of [
      { reportedAt: REPORTED_AT },
      { receivedAt: RECEIVED_AT },
      { core: completeWire().core },
      { capabilities: [] },
    ]) {
      expect(
        registeredRobotStateSchema.safeParse({
          schemaVersion: SCHEMA_VERSION,
          robotId: "R-900",
          siteId: "site.north",
          vendorId: "C",
          freshness: "unknown",
          ...extra,
        }).success,
      ).toBe(false);
    }
  });
});

/** The diagnostic envelope's own additions on top of a complete canonical wire object. */
function diagnosticWire(): Record<string, unknown> {
  return {
    ...completeWire(),
    sequenceHealth: { evaluated: true, gaps: 0, duplicates: 0 },
    rawPayload: null,
  };
}

describe("robotDiagnosticEnvelopeSchema", () => {
  it("accepts the fleet envelope plus a raw payload", () => {
    const result = parseRobotDiagnosticEnvelope({
      ...diagnosticWire(),
      rawPayload: { vendorField: 1, undocumented: "kept for diagnosis" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.value.rawPayload).toEqual({ vendorField: 1, undocumented: "kept for diagnosis" });
    expect(result.value.capabilities.dock).toEqual({ docked: false, dockId: "dock-3" });
  });

  it("accepts a null raw payload for a reading that did not retain one", () => {
    const result = parseRobotDiagnosticEnvelope({ ...diagnosticWire(), rawPayload: null });

    expect(result.ok).toBe(true);
  });

  it("requires the rawPayload key, so its absence cannot be mistaken for null", () => {
    expect(
      robotDiagnosticEnvelopeSchema.safeParse(without(diagnosticWire(), "rawPayload")).success,
    ).toBe(false);
  });

  it("does not accept an array or primitive as a raw payload", () => {
    for (const bad of [[], "payload", 42]) {
      expect(
        robotDiagnosticEnvelopeSchema.safeParse({ ...diagnosticWire(), rawPayload: bad }).success,
      ).toBe(false);
    }
  });

  it("requires sequenceHealth, so a robot cannot arrive with its continuity unstated", () => {
    // ADR 25: the console previously took this from outside the envelope and had
    // to invent a representation. Required, not optional, because "absent" and
    // "not evaluated" would otherwise decode to the same thing.
    expect(
      robotDiagnosticEnvelopeSchema.safeParse(without(diagnosticWire(), "sequenceHealth")).success,
    ).toBe(false);
  });

  it("carries a robot whose sequence was never evaluated, with no counts to misread", () => {
    const result = parseRobotDiagnosticEnvelope({
      ...diagnosticWire(),
      sequenceHealth: { evaluated: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.value.sequenceHealth).toEqual({ evaluated: false });
    // The point of the discriminated shape: there is no `gaps` to read as zero.
    expect("gaps" in result.value.sequenceHealth).toBe(false);
  });

  it("rejects counts on an unevaluated sequence, which would be a contradiction", () => {
    expect(
      robotDiagnosticEnvelopeSchema.safeParse({
        ...diagnosticWire(),
        sequenceHealth: { evaluated: false, gaps: 3, duplicates: 0 },
      }).success,
    ).toBe(false);
  });

  it("requires both counts once the sequence was evaluated", () => {
    for (const bad of [{ evaluated: true }, { evaluated: true, gaps: 1 }]) {
      expect(
        robotDiagnosticEnvelopeSchema.safeParse({ ...diagnosticWire(), sequenceHealth: bad })
          .success,
      ).toBe(false);
    }
  });

  it("rejects negative and fractional counts", () => {
    for (const gaps of [-1, 1.5]) {
      expect(
        robotDiagnosticEnvelopeSchema.safeParse({
          ...diagnosticWire(),
          sequenceHealth: { evaluated: true, gaps, duplicates: 0 },
        }).success,
      ).toBe(false);
    }
  });

  it("keeps sequenceHealth off the fleet envelope, which is not a diagnostic surface", () => {
    // Scope is expressed by which schema carries the field. A fleet row that could
    // report gaps would put a technician fact on an operator surface (ADR 1).
    expect(canonicalEnvelopeSchema.safeParse(diagnosticWire()).success).toBe(false);
  });
});

describe("telemetryBatchSchema", () => {
  function batch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: SERVER_SESSION,
      flushSequence: 41,
      sentAt: RECEIVED_AT,
      robots: [],
      ...overrides,
    };
  }

  it("accepts a coalesced batch of changed robots", () => {
    const result = parseTelemetryBatch(batch({ robots: [completeWire(), minimalWire()] }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.value.robots).toHaveLength(2);
    expect(result.value.robots[0]?.capabilities.sequence).toEqual({ value: 9014 });
    expect(result.value.serverSessionId).toBe(SERVER_SESSION);
  });

  it("accepts an empty batch", () => {
    // A flush with nothing changed is legal; the server simply should not send
    // one. Rejecting it here would turn a wasteful message into a dropped
    // connection.
    expect(telemetryBatchSchema.safeParse(batch()).success).toBe(true);
  });

  it("rejects a batch containing an invalid envelope", () => {
    const result = parseTelemetryBatch(
      batch({ robots: [completeWire(), { ...minimalWire(), freshness: "LIVE" }] }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.issues[0]?.path).toBe("robots[1].freshness");
  });

  it("rejects a raw payload smuggled into a delta", () => {
    expect(
      telemetryBatchSchema.safeParse(
        batch({ robots: [{ ...completeWire(), rawPayload: { any: "thing" } }] }),
      ).success,
    ).toBe(false);
  });

  it("requires a flush sequence, which reconnect depends on", () => {
    // ADR 2 § Decision requires it on every delta. A batch without one is
    // undecodable rather than defaulted: a client cannot tell "flush 0" from
    // "this server does not send sequences", and guessing wrong silently
    // discards deltas it needed (ADR 18).
    const result = parseTelemetryBatch(without(batch(), "flushSequence"));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.issues[0]?.path).toBe("flushSequence");
  });

  it("requires the server session, which restart detection depends on", () => {
    // ADR 31: a batch that cannot name its sequence epoch cannot be reconciled
    // against any snapshot. Defaulting it would revive the sequence-only
    // comparison this field exists to replace.
    const result = parseTelemetryBatch(without(batch(), "serverSessionId"));

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.issues[0]?.path).toBe("serverSessionId");
  });

  it("rejects a server session that is not a UUID", () => {
    for (const serverSessionId of ["", "restart-1", "8f7a2c9e-1b3d-4e5f-9a6b", 42]) {
      expect(telemetryBatchSchema.safeParse(batch({ serverSessionId })).success).toBe(false);
    }
  });

  it("rejects the version-1 wire format, which predates the session field", () => {
    // The bump to version 2 was deliberate: a version-1 producer cannot supply
    // the field reconciliation depends on, so its frames are refused rather
    // than reinterpreted (ADR 31).
    expect(telemetryBatchSchema.safeParse(batch({ schemaVersion: "1" })).success).toBe(false);
  });

  it("rejects a non-integral or negative flush sequence", () => {
    // It counts flushes. A fraction means someone put a timestamp in it, and a
    // negative means someone used it as a sentinel.
    for (const flushSequence of [1.5, -1, Number.NaN]) {
      expect(telemetryBatchSchema.safeParse(batch({ flushSequence })).success).toBe(false);
    }
  });

  it("accepts flush sequence zero, which a freshly restarted server reports", () => {
    expect(telemetryBatchSchema.safeParse(batch({ flushSequence: 0 })).success).toBe(true);
  });
});

describe("fleetSnapshotSchema", () => {
  /** Every site the test robots reference, so referential checks pass by default. */
  const DIRECTORY = [
    { siteId: "site.north", label: "North site" },
    { siteId: "site.south", label: "South site" },
    { siteId: "SITE-NORTH", label: "North site" },
  ];

  function snapshot(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: SERVER_SESSION,
      flushSequence: 41,
      capturedAt: RECEIVED_AT,
      sites: DIRECTORY,
      robots: [completeWire()],
      ...overrides,
    };
  }

  it("accepts a snapshot carrying both robot populations", () => {
    // ADR 3's never-reported robots must appear as UNKNOWN rather than be
    // missing, or the console cannot tell "no such robot" from "not heard from".
    const result = parseFleetSnapshot(
      snapshot({
        robots: [
          completeWire(),
          {
            schemaVersion: SCHEMA_VERSION,
            robotId: "R-999",
            siteId: "SITE-NORTH",
            vendorId: "B",
            freshness: "unknown",
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.value.robots).toHaveLength(2);
    expect(result.value.flushSequence).toBe(41);
  });

  it("accepts an empty fleet, which is a real deployment state", () => {
    expect(fleetSnapshotSchema.safeParse(snapshot({ robots: [] })).success).toBe(true);
  });

  it("requires the flush sequence the reconciliation compares against", () => {
    expect(fleetSnapshotSchema.safeParse(without(snapshot(), "flushSequence")).success).toBe(false);
  });

  it("requires the server session that scopes the flush sequence", () => {
    // ADR 31: without it, a client joining a restarted server compares its
    // buffered deltas against a sequence from a different epoch.
    expect(fleetSnapshotSchema.safeParse(without(snapshot(), "serverSessionId")).success).toBe(
      false,
    );
  });

  it("rejects the version-1 wire format, which predates the session field", () => {
    expect(fleetSnapshotSchema.safeParse(snapshot({ schemaVersion: "1" })).success).toBe(false);
  });

  it("rejects the version-2 wire format, which predates the site directory", () => {
    // ADR 34: no compatibility fallback. A version-2 snapshot carries site ids
    // the console has no labels for, so it is refused rather than reinterpreted.
    expect(fleetSnapshotSchema.safeParse(snapshot({ schemaVersion: "2" })).success).toBe(false);
  });

  it("requires the site directory", () => {
    expect(fleetSnapshotSchema.safeParse(without(snapshot(), "sites")).success).toBe(false);
  });

  it("rejects a site whose label is missing", () => {
    expect(
      fleetSnapshotSchema.safeParse(snapshot({ sites: [{ siteId: "site.north" }] })).success,
    ).toBe(false);
  });

  it("rejects duplicate site ids in the directory", () => {
    const result = fleetSnapshotSchema.safeParse(
      snapshot({
        sites: [...DIRECTORY, { siteId: "site.north", label: "North again" }],
        robots: [],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.issues[0]?.path).toEqual(["sites", 3, "siteId"]);
  });

  it("rejects a robot referencing a site the directory does not define", () => {
    // Referential integrity is the contract's job, not a consumer fallback:
    // an undefined reference would make every console invent a label (ADR 34).
    const result = fleetSnapshotSchema.safeParse(
      snapshot({ sites: [{ siteId: "site.south", label: "South site" }] }),
    );
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error.issues[0]?.path).toEqual(["robots", 0, "siteId"]);
  });

  it("accepts a registered-only robot whose site is defined", () => {
    expect(
      fleetSnapshotSchema.safeParse(
        snapshot({
          robots: [
            {
              schemaVersion: SCHEMA_VERSION,
              robotId: "R-999",
              siteId: "SITE-NORTH",
              vendorId: "B",
              freshness: "unknown",
            },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects a raw payload smuggled into the snapshot", () => {
    // ADR 1 serves the raw payload only on the single-robot diagnostic endpoint.
    // The strict schemas are what enforce that, rather than the server
    // remembering it on every response.
    expect(
      fleetSnapshotSchema.safeParse(
        snapshot({ robots: [{ ...completeWire(), rawPayload: { any: "thing" } }] }),
      ).success,
    ).toBe(false);
  });

  it("rejects a hybrid that is neither an envelope nor a registered entry", () => {
    // The union has no discriminator key, so this pins the claim that both
    // strict variants reject a half-populated robot rather than one accepting it.
    expect(
      fleetSnapshotSchema.safeParse(
        snapshot({
          robots: [
            {
              schemaVersion: SCHEMA_VERSION,
              robotId: "R-001",
              siteId: "SITE-NORTH",
              vendorId: "A",
              freshness: "unknown",
              receivedAt: RECEIVED_AT,
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });
});

describe("reconcileDeltaWithSnapshot", () => {
  /** The snapshot's epoch, against which every delta below is reconciled. */
  const held = { serverSessionId: SERVER_SESSION, flushSequence: 41 };

  function delta(flushSequence: number, serverSessionId: string = SERVER_SESSION) {
    return { serverSessionId, flushSequence };
  }

  it("discards a same-session delta the snapshot already reflects", () => {
    expect(reconcileDeltaWithSnapshot(held, delta(40))).toBe("covered");
  });

  it("discards the flush the snapshot was taken at", () => {
    // At-or-below, not strictly-below: the snapshot reflects its own flush. This
    // is the boundary the whole reconciliation turns on, and getting it wrong
    // re-applies one flush — harmless under whole-envelope replace, not harmless
    // once a merge path exists (ADR 18).
    expect(reconcileDeltaWithSnapshot(held, delta(41))).toBe("covered");
  });

  it("applies a same-session delta the snapshot predates", () => {
    expect(reconcileDeltaWithSnapshot(held, delta(42))).toBe("apply");
  });

  it("keeps everything for a cold snapshot from a server that has never flushed", () => {
    const cold = { serverSessionId: SERVER_SESSION, flushSequence: 0 };
    expect(reconcileDeltaWithSnapshot(cold, delta(1))).toBe("apply");
    expect(reconcileDeltaWithSnapshot(cold, delta(0))).toBe("covered");
  });

  it("reports a session mismatch for a delta from a different runtime", () => {
    // The restart defect ADR 31 closes: the new process counts from zero, so a
    // sequence-only rule would call every one of its deltas covered. The session
    // comparison must win before any sequence comparison happens.
    expect(reconcileDeltaWithSnapshot(held, delta(1, OTHER_SESSION))).toBe("session-mismatch");
  });

  it("reports a session mismatch even when the sequence would say apply", () => {
    // A mismatched delta with a plausible-looking higher sequence is still from
    // a different epoch; applying it would interleave two servers' histories.
    expect(reconcileDeltaWithSnapshot(held, delta(99, OTHER_SESSION))).toBe("session-mismatch");
  });
});
