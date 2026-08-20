import { type CanonicalEnvelope, SCHEMA_VERSION } from "@fleet/contracts";
import { describe, expect, it } from "vitest";

import { CurrentStateStore, type ManifestRobot } from "./currentStateStore.ts";

const ROBOT: ManifestRobot = {
  robotId: "R-001",
  siteId: "site-a",
  vendorId: "A",
  model: "Carrier 1",
};

function envelope(sequence: number, receivedAt = 1_000): CanonicalEnvelope {
  return {
    schemaVersion: "1",
    robotId: ROBOT.robotId,
    siteId: ROBOT.siteId,
    vendorId: ROBOT.vendorId,
    model: ROBOT.model,
    adapterId: "adapter-a",
    adapterVersion: "1.0.0",
    reportedAt: receivedAt - 10,
    receivedAt,
    core: {
      connectivity: "online",
      batteryPercent: 80,
      position: null,
      status: "idle",
      health: { severity: "nominal" },
    },
    capabilities: { sequence: { value: sequence } },
    freshness: "live",
  };
}

describe("CurrentStateStore", () => {
  it("seeds every manifest robot as never observed", () => {
    const store = new CurrentStateStore([ROBOT], 3);

    expect(store.get(ROBOT.robotId)).toEqual({
      ...ROBOT,
      schemaVersion: "1",
      freshness: "unknown",
    });
  });

  it("rejects duplicate and out-of-order sequences without regressing state or history", () => {
    const store = new CurrentStateStore([ROBOT], 3);
    expect(store.upsert(envelope(2), { sequence: 2 }, 2).kind).toBe("accepted");
    expect(store.upsert(envelope(2, 2_000), { sequence: 2 }, 2).kind).toBe("duplicate");
    expect(store.upsert(envelope(1, 3_000), { sequence: 1 }, 1).kind).toBe("out-of-order");

    expect(store.get(ROBOT.robotId)).toMatchObject({ receivedAt: 1_000 });
    expect(store.history(ROBOT.robotId)).toHaveLength(1);
  });

  it("keeps raw payload separate from fleet state and history", () => {
    const store = new CurrentStateStore([ROBOT], 3);
    store.upsert(envelope(1), { secretVendorField: "diagnostic" }, 1);

    expect(JSON.stringify(store.list())).not.toContain("secretVendorField");
    expect(JSON.stringify(store.history(ROBOT.robotId))).not.toContain("secretVendorField");
    expect(store.diagnostic(ROBOT.robotId)?.rawPayload).toEqual({
      secretVendorField: "diagnostic",
    });
  });

  it("keeps raw payload out of observed state, which is what the fan-out reads", () => {
    // ADR 26's required evidence: the payload must reach no delta. `observed()` is
    // the sweep and fan-out's view, so a leak here is a leak onto the WebSocket.
    const store = new CurrentStateStore([ROBOT], 3);
    store.upsert(envelope(1), { secretVendorField: "diagnostic" }, 1);

    expect(JSON.stringify(store.observed())).not.toContain("secretVendorField");
    expect(JSON.stringify(store.get(ROBOT.robotId))).not.toContain("secretVendorField");
  });

  it("replaces the retained payload rather than accumulating them", () => {
    // Retention is one payload per robot; that is what makes the memory ceiling
    // fleet size x MAX_INGEST_BYTES rather than unbounded growth over uptime.
    const store = new CurrentStateStore([ROBOT], 3);
    store.upsert(envelope(1), { generation: "first" }, 1);
    store.upsert(envelope(2), { generation: "second" }, 2);
    store.upsert(envelope(3), { generation: "third" }, 3);

    const retained = store.diagnostic(ROBOT.robotId)?.rawPayload;
    expect(retained).toEqual({ generation: "third" });
    expect(JSON.stringify(retained)).not.toContain("first");
    expect(JSON.stringify(retained)).not.toContain("second");
  });

  it("does not retain a payload from a rejected upsert", () => {
    // A duplicate or out-of-order reading must not overwrite the evidence for the
    // reading the server actually accepted.
    const store = new CurrentStateStore([ROBOT], 3);
    store.upsert(envelope(2), { generation: "accepted" }, 2);
    store.upsert(envelope(2, 2_000), { generation: "duplicate" }, 2);
    store.upsert(envelope(1, 3_000), { generation: "out-of-order" }, 1);

    expect(store.diagnostic(ROBOT.robotId)?.rawPayload).toEqual({ generation: "accepted" });
  });

  it("cannot have its retained evidence mutated through the caller's object", () => {
    // ADR 26. The store used to spread the payload, which copies the top level only —
    // so a caller holding a nested object could rewrite evidence a technician is asked
    // to trust, after the fact and invisibly.
    const store = new CurrentStateStore([ROBOT], 3);
    const nested: Record<string, unknown> = { reading: "original" };
    const payload: Record<string, unknown> = { top: "original", nested };

    store.upsert(envelope(1), payload, 1);

    payload.top = "mutated";
    nested.reading = "mutated";
    nested.added = true;

    expect(store.diagnostic(ROBOT.robotId)?.rawPayload).toEqual({
      top: "original",
      nested: { reading: "original" },
    });
  });

  it("does not hand out a reference a reader can mutate either", () => {
    // The other direction. A caller that receives the payload and edits it must not
    // be editing the store's copy — `diagnostic()` is read by a response handler.
    const store = new CurrentStateStore([ROBOT], 3);
    store.upsert(envelope(1), { reading: "original", nested: { deep: "original" } }, 1);

    const first: Record<string, unknown> = { ...store.diagnostic(ROBOT.robotId)?.rawPayload };
    first.reading = "mutated";
    const firstNested = first.nested;
    if (typeof firstNested === "object" && firstNested !== null) {
      (firstNested as { deep?: string }).deep = "mutated";
    }

    expect(store.diagnostic(ROBOT.robotId)?.rawPayload).toEqual({
      reading: "original",
      nested: { deep: "original" },
    });
  });

  it("retains a null payload as null rather than as an empty object", () => {
    // "Nothing was retained" and "an empty payload was retained" are different
    // statements, and the robot-detail page renders them differently.
    const store = new CurrentStateStore([ROBOT], 3);
    store.upsert(envelope(1), null, 1);

    expect(store.diagnostic(ROBOT.robotId)?.rawPayload).toBeNull();
  });
});

/**
 * Per-robot sequence continuity (**D6a**), tracked where the previous accepted sequence
 * already lives so there is no second copy of that number to drift.
 */
describe("CurrentStateStore sequence continuity", () => {
  const MANIFEST: ManifestRobot[] = [
    { robotId: "rbt-1", siteId: "site-a", vendorId: "A", model: "m" },
    { robotId: "rbt-2", siteId: "site-a", vendorId: "B", model: "m" },
  ];

  function reading(robotId: string, vendorId: string, adapterId: string): CanonicalEnvelope {
    return {
      schemaVersion: SCHEMA_VERSION,
      robotId,
      siteId: "site-a",
      vendorId,
      model: "m",
      adapterId,
      adapterVersion: "1.0.0",
      reportedAt: 1_755_600_000_000,
      receivedAt: 1_755_600_000_100,
      freshness: "live",
      core: {
        connectivity: "unknown",
        batteryPercent: 50,
        position: null,
        status: "idle",
        health: { severity: "nominal" },
      },
      capabilities: {},
    };
  }

  it("counts readings missing rather than gap events", () => {
    // The contract's own field comment says "readings missing from the sequence", and it
    // is the number an operator can act on: one jump of five is five lost readings.
    const store = new CurrentStateStore(MANIFEST);
    store.upsert(reading("rbt-1", "A", "vendor-a"), null, 1);
    store.upsert(reading("rbt-1", "A", "vendor-a"), null, 6);

    expect(store.sequenceHealth("rbt-1")).toStrictEqual({
      evaluated: true,
      gaps: 4,
      duplicates: 0,
    });
  });

  it("counts a duplicate without letting it regress state", () => {
    const store = new CurrentStateStore(MANIFEST);
    store.upsert(reading("rbt-1", "A", "vendor-a"), null, 3);

    expect(store.upsert(reading("rbt-1", "A", "vendor-a"), null, 3).kind).toBe("duplicate");
    expect(store.sequenceHealth("rbt-1")).toStrictEqual({
      evaluated: true,
      gaps: 0,
      duplicates: 1,
    });
  });

  it("reports a counterless dialect as not evaluated, never as zero gaps", () => {
    // Vendor B. "0 gaps" here is a false statement to an operator (ADR 1, **D6**).
    const store = new CurrentStateStore(MANIFEST);
    store.upsert(reading("rbt-2", "B", "vendor-b"), null, null);

    expect(store.sequenceHealth("rbt-2")).toStrictEqual({ evaluated: false });
  });

  it("is null before a robot has reported, which is not the same as unevaluated", () => {
    expect(new CurrentStateStore(MANIFEST).sequenceHealth("rbt-1")).toBeNull();
  });

  it("folds the per-robot values into one entry per vendor dialect", () => {
    // ADR 25: the rollup answers "is this dialect ordered at all", a different question
    // from "did this robot miss readings", and neither substitutes for the other.
    const store = new CurrentStateStore(MANIFEST);
    store.upsert(reading("rbt-1", "A", "vendor-a"), null, 1);
    store.upsert(reading("rbt-1", "A", "vendor-a"), null, 3);
    store.upsert(reading("rbt-2", "B", "vendor-b"), null, null);

    expect(store.sequenceByVendor()).toStrictEqual({
      A: { evaluated: true, gaps: 1, duplicates: 0 },
      B: { evaluated: false },
    });
  });
});
