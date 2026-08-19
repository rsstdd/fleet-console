import { describe, expect, it } from "vitest";

import {
  CAPABILITY_KINDS,
  CAPABILITY_NAMES,
  type Capabilities,
  type CapabilityName,
  type CapabilityPayloadByName,
  type CapabilityWireEntry,
  DIAGNOSTIC_CAPABILITY_NAMES,
  type DiagnosticCapabilityName,
  OPERATOR_CAPABILITY_NAMES,
  type OperatorCapabilityName,
  capabilitiesWireSchema,
  capabilityWireEntrySchema,
  dockCapabilitySchema,
  encodeCapabilities,
  isDiagnosticCapability,
  isOperatorCapability,
  lidarHealthCapabilitySchema,
  parseCapabilities,
  sequenceCapabilitySchema,
  waterLevelCapabilitySchema,
} from "./capabilitySchemas.js";

/**
 * Compile-time half of the capability contract. These fail `pnpm typecheck`
 * rather than `pnpm test`, and they are the assertions that make ADR 1's
 * "a capability name cannot be paired with the wrong payload" a type-level
 * fact rather than a runtime hope.
 */
type Assert<T extends true> = T;
/*
 * The conditional-type identity trick: two types are equal only if the two
 * generic signatures are mutually assignable. `G` is intentionally used once per
 * signature — that is what makes the comparison strict rather than structural —
 * so the lint rule's premise does not hold here.
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- see above */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */

export type CapabilityTypeAssertions = [
  // The name union is derived from the payload mapping, so the two cannot drift.
  Assert<Equals<CapabilityName, keyof CapabilityPayloadByName>>,
  // Each name keeps its own payload type rather than collapsing to a shared one.
  Assert<Equals<CapabilityPayloadByName["dock"]["docked"], boolean>>,
  Assert<Equals<CapabilityPayloadByName["waterLevel"]["percent"], number | null>>,
  Assert<Equals<CapabilityPayloadByName["sequence"]["value"], number>>,
  // The canonical order array is exactly the name set, neither short nor long.
  Assert<Equals<(typeof CAPABILITY_NAMES)[number], CapabilityName>>,
  // The two kind subsets partition the name set: nothing is in both, nothing in
  // neither. This is what ADR 19 buys — a capability cannot be added to the model
  // and then quietly belong to no surface.
  Assert<Equals<OperatorCapabilityName | DiagnosticCapabilityName, CapabilityName>>,
  Assert<Equals<OperatorCapabilityName & DiagnosticCapabilityName, never>>,
  // Both subsets are derived from CAPABILITY_KINDS, so these pin the classification
  // itself rather than a restatement of it. Reclassifying `sequence` fails here.
  Assert<Equals<DiagnosticCapabilityName, "sequence">>,
  Assert<Equals<OperatorCapabilityName, "dock" | "lidarHealth" | "waterLevel">>,
];

const DOCK = { docked: true, dockId: "dock-3" } as const;
const LIDAR = { severity: "degraded", rpm: 570.5 } as const;
const WATER = { percent: 42 } as const;
const SEQUENCE = { value: 9014 } as const;

describe("capability payload schemas", () => {
  it("accepts each valid payload", () => {
    expect(dockCapabilitySchema.safeParse(DOCK).success).toBe(true);
    expect(dockCapabilitySchema.safeParse({ docked: false, dockId: null }).success).toBe(true);
    expect(lidarHealthCapabilitySchema.safeParse(LIDAR).success).toBe(true);
    expect(lidarHealthCapabilitySchema.safeParse({ severity: "nominal", rpm: null }).success).toBe(
      true,
    );
    expect(waterLevelCapabilitySchema.safeParse(WATER).success).toBe(true);
    expect(waterLevelCapabilitySchema.safeParse({ percent: null }).success).toBe(true);
    expect(sequenceCapabilitySchema.safeParse(SEQUENCE).success).toBe(true);
  });

  it("requires the nullable fields to be present, not merely omitted", () => {
    // `dockId: null` states the vendor reported no dock. An absent key states
    // nothing, and the two must not decode to the same value.
    expect(dockCapabilitySchema.safeParse({ docked: true }).success).toBe(false);
    expect(lidarHealthCapabilitySchema.safeParse({ severity: "nominal" }).success).toBe(false);
    expect(waterLevelCapabilitySchema.safeParse({}).success).toBe(false);
  });

  it("rejects out-of-range and non-finite payload values", () => {
    expect(lidarHealthCapabilitySchema.safeParse({ severity: "nominal", rpm: -1 }).success).toBe(
      false,
    );
    expect(
      lidarHealthCapabilitySchema.safeParse({ severity: "nominal", rpm: Number.NaN }).success,
    ).toBe(false);
    expect(waterLevelCapabilitySchema.safeParse({ percent: 101 }).success).toBe(false);
    expect(sequenceCapabilitySchema.safeParse({ value: -1 }).success).toBe(false);
    expect(sequenceCapabilitySchema.safeParse({ value: 1.5 }).success).toBe(false);
  });

  it("rejects additional payload fields rather than dropping them", () => {
    expect(dockCapabilitySchema.safeParse({ ...DOCK, chargeRate: 2 }).success).toBe(false);
  });
});

describe("capabilityWireEntrySchema", () => {
  it("pairs each name with its own payload", () => {
    for (const entry of [
      { name: "dock", payload: DOCK },
      { name: "lidarHealth", payload: LIDAR },
      { name: "waterLevel", payload: WATER },
      { name: "sequence", payload: SEQUENCE },
    ]) {
      expect(capabilityWireEntrySchema.safeParse(entry).success).toBe(true);
    }
  });

  it("rejects every name paired with another capability's payload", () => {
    // The cross product is the point: this is what a plain
    // `Record<string, unknown>` payload would have let through.
    const payloads: Record<CapabilityName, unknown> = {
      dock: DOCK,
      lidarHealth: LIDAR,
      waterLevel: WATER,
      sequence: SEQUENCE,
    };

    for (const name of CAPABILITY_NAMES) {
      for (const other of CAPABILITY_NAMES) {
        if (name === other) {
          continue;
        }
        expect(
          capabilityWireEntrySchema.safeParse({ name, payload: payloads[other] }).success,
        ).toBe(false);
      }
    }
  });

  it("rejects unknown capability names for this schema version", () => {
    expect(
      capabilityWireEntrySchema.safeParse({ name: "conveyor", payload: { running: true } }).success,
    ).toBe(false);
  });

  it("rejects a missing payload and additional entry fields", () => {
    expect(capabilityWireEntrySchema.safeParse({ name: "dock" }).success).toBe(false);
    expect(
      capabilityWireEntrySchema.safeParse({ name: "dock", payload: DOCK, source: "vendor" })
        .success,
    ).toBe(false);
  });
});

describe("capabilitiesWireSchema", () => {
  it("transforms the wire array into the runtime record", () => {
    const parsed = capabilitiesWireSchema.parse([
      { name: "dock", payload: DOCK },
      { name: "lidarHealth", payload: LIDAR },
    ]);

    expect(parsed).toEqual({ dock: DOCK, lidarHealth: LIDAR });
  });

  it("decodes an empty array to an empty record, not to payload placeholders", () => {
    const parsed = capabilitiesWireSchema.parse([]);

    expect(parsed).toEqual({});
    expect(Object.keys(parsed)).toHaveLength(0);
    // Absence is the interface: an undeclared capability has no key at all,
    // so `"waterLevel" in capabilities` is the whole test a consumer needs.
    expect("waterLevel" in parsed).toBe(false);
  });

  it("rejects duplicate names instead of silently taking the last one", () => {
    const parsed = capabilitiesWireSchema.safeParse([
      { name: "dock", payload: DOCK },
      { name: "dock", payload: { docked: false, dockId: null } },
    ]);

    expect(parsed.success).toBe(false);
  });

  it("reports the offending index for a malformed entry", () => {
    const result = parseCapabilities([
      { name: "dock", payload: DOCK },
      { name: "waterLevel", payload: { percent: 500 } },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected a failure");
    }
    expect(result.issues[0]?.path).toBe("[1].payload.percent");
  });

  it("rejects a record where the wire array is required", () => {
    // The runtime shape and the wire shape are different types on purpose;
    // accepting both here would make the transform meaningless.
    expect(capabilitiesWireSchema.safeParse({ dock: DOCK }).success).toBe(false);
  });
});

describe("encodeCapabilities", () => {
  it("emits entries in canonical name order regardless of insertion order", () => {
    const capabilities: Capabilities = {
      sequence: SEQUENCE,
      dock: DOCK,
      waterLevel: WATER,
    };

    expect(encodeCapabilities(capabilities).map((entry) => entry.name)).toEqual([
      "dock",
      "waterLevel",
      "sequence",
    ]);
  });

  it("emits nothing for an empty capability record", () => {
    expect(encodeCapabilities({})).toEqual([]);
  });

  it("round-trips runtime record → wire → JSON → runtime record", () => {
    const capabilities: Capabilities = {
      dock: DOCK,
      lidarHealth: LIDAR,
      waterLevel: WATER,
      sequence: SEQUENCE,
    };

    const wire: readonly CapabilityWireEntry[] = encodeCapabilities(capabilities);
    const decoded = capabilitiesWireSchema.parse(JSON.parse(JSON.stringify(wire)));

    expect(decoded).toEqual(capabilities);
  });

  it("survives a round trip for every single-capability record", () => {
    for (const name of CAPABILITY_NAMES) {
      const payloads: CapabilityPayloadByName = {
        dock: DOCK,
        lidarHealth: LIDAR,
        waterLevel: WATER,
        sequence: SEQUENCE,
      };
      const capabilities = { [name]: payloads[name] } as Capabilities;

      const decoded = capabilitiesWireSchema.parse(
        JSON.parse(JSON.stringify(encodeCapabilities(capabilities))),
      );

      expect(decoded).toEqual(capabilities);
      expect(Object.keys(decoded)).toEqual([name]);
    }
  });
});

describe("capability kinds", () => {
  it("classifies every capability, and each one exactly once", () => {
    // The compile-time assertions above prove the *types* partition. This proves
    // the runtime arrays do too, which is what consumers actually iterate.
    expect([...OPERATOR_CAPABILITY_NAMES, ...DIAGNOSTIC_CAPABILITY_NAMES].sort()).toEqual(
      [...CAPABILITY_NAMES].sort(),
    );
    expect(
      OPERATOR_CAPABILITY_NAMES.filter((name) =>
        (DIAGNOSTIC_CAPABILITY_NAMES as readonly CapabilityName[]).includes(name),
      ),
    ).toEqual([]);
  });

  it("keeps both subsets in canonical order rather than sorted or grouped", () => {
    // Order matters downstream: the console renders panels in this order, so a
    // subset that reordered would silently rearrange the robot detail page.
    expect(OPERATOR_CAPABILITY_NAMES).toEqual(["dock", "lidarHealth", "waterLevel"]);
    expect(DIAGNOSTIC_CAPABILITY_NAMES).toEqual(["sequence"]);
  });

  it("agrees with the guards, which read the same mapping", () => {
    for (const name of CAPABILITY_NAMES) {
      expect(isOperatorCapability(name)).toBe(CAPABILITY_KINDS[name] === "operator");
      expect(isDiagnosticCapability(name)).toBe(CAPABILITY_KINDS[name] === "diagnostic");
      expect(isOperatorCapability(name)).toBe(!isDiagnosticCapability(name));
    }
  });

  it("classifies sequence as diagnostic and the rest as operator", () => {
    // Pinned as data rather than only as a type, so the reason ADR 1 gives —
    // `sequence` is transport metadata, not machine behaviour — has a named
    // assertion to fail if someone reclassifies it to get a panel for free.
    expect(CAPABILITY_KINDS.sequence).toBe("diagnostic");
    expect(CAPABILITY_KINDS.dock).toBe("operator");
    expect(CAPABILITY_KINDS.lidarHealth).toBe("operator");
    expect(CAPABILITY_KINDS.waterLevel).toBe("operator");
  });
});
