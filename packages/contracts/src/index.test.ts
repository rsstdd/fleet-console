import { describe, expect, it } from "vitest";

import * as contracts from "@fleet/contracts";

/**
 * Public-surface test for the package barrel.
 *
 * It asserts the exact export set rather than spot-checking a few names,
 * because the failure this guards against is an accidental addition — an
 * internal helper re-exported once becomes a contract every consumer may depend
 * on. A deliberate addition updates this list; an accidental one fails here.
 *
 * It imports by package name rather than by relative path, so it also proves
 * the `exports` map resolves — a consumer reaching `@fleet/contracts` gets this
 * barrel and needs no deep import (packages/contracts/TODO.md § 8).
 */
const EXPECTED_RUNTIME_EXPORTS: readonly string[] = [
  // shared/primitives
  "MAX_EPOCH_MS",
  "MAX_POSITION_METRES",
  "SCHEMA_VERSION",
  "batteryPercentSchema",
  "connectivitySchema",
  "displayNameSchema",
  "epochMillisecondsSchema",
  "flushSequenceSchema",
  "freshnessStateSchema",
  "healthSchema",
  "healthSeveritySchema",
  "identifierSchema",
  "parseWith",
  "positionSchema",
  "robotStatusSchema",
  "schemaVersionSchema",
  "sequenceHealthSchema",
  "serverSessionIdSchema",
  "toContractIssues",
  "vendorIdSchema",
  "versionStringSchema",
  // capabilities
  "CAPABILITY_KINDS",
  "CAPABILITY_NAMES",
  "DIAGNOSTIC_CAPABILITY_NAMES",
  "OPERATOR_CAPABILITY_NAMES",
  "capabilitiesWireSchema",
  "capabilityWireEntrySchema",
  "dockCapabilitySchema",
  "encodeCapabilities",
  "isDiagnosticCapability",
  "isOperatorCapability",
  "lidarHealthCapabilitySchema",
  "parseCapabilities",
  "sequenceCapabilitySchema",
  "waterLevelCapabilitySchema",
  // envelope
  "adapterEnvelopeSchema",
  "canonicalCoreSchema",
  "canonicalEnvelopeSchema",
  "encodeCanonicalEnvelope",
  "fleetSnapshotRobotSchema",
  "fleetSnapshotSchema",
  "parseAdapterEnvelope",
  "parseCanonicalEnvelope",
  "parseFleetSnapshot",
  "parseRegisteredRobotState",
  "parseRobotDiagnosticEnvelope",
  "parseTelemetryBatch",
  "reconcileDeltaWithSnapshot",
  "registeredRobotStateSchema",
  "robotDiagnosticEnvelopeSchema",
  "telemetryBatchSchema",
  "withFreshness",
  // errors
  "ADAPTER_ERROR_KINDS",
  "ERROR_KINDS",
  "adapterErrorKindSchema",
  "contractIssueSchema",
  "errorEnvelopeSchema",
  "errorKindSchema",
  "parseErrorEnvelope",
  // freshness
  "DEFAULT_FRESHNESS_POLICY",
  "deriveFreshness",
  "freshnessPolicySchema",
  "parseFreshnessPolicy",
  // history
  "BATTERY_HISTORY_MAX_POINTS",
  "BATTERY_HISTORY_SCHEMA_VERSION",
  "BATTERY_HISTORY_WINDOW_MS",
  "batteryHistoryPointSchema",
  "parseRobotBatteryHistory",
  "robotBatteryHistorySchema",
  // health
  "adapterHealthSchema",
  "healthResponseSchema",
  "lateFreshnessTicksSchema",
  "parseHealthResponse",
  "unknownFieldScopeSchema",
  "unknownFieldTallySchema",
];

describe("@fleet/contracts public API", () => {
  it("exports exactly the documented runtime surface", () => {
    expect(Object.keys(contracts).sort()).toEqual([...EXPECTED_RUNTIME_EXPORTS].sort());
  });

  it("re-exports without executing anything", () => {
    // `sideEffects: false` in package.json is a claim bundlers act on. If the
    // barrel ever gains a side effect, that claim becomes a bug that only
    // appears in a consumer's production build.
    expect(contracts.SCHEMA_VERSION).toBe("2");
    expect(contracts.CAPABILITY_NAMES).toEqual(["dock", "lidarHealth", "waterLevel", "sequence"]);
  });

  it("supports the whole ingest path from the barrel alone", () => {
    // The end-to-end shape a consumer needs: decode untrusted input, sweep
    // freshness, re-encode for the wire. If any step needed a deep import, the
    // exports map would be wrong.
    const decoded = contracts.parseCanonicalEnvelope({
      schemaVersion: contracts.SCHEMA_VERSION,
      robotId: "R-118",
      siteId: "site.north",
      vendorId: "A",
      model: "Scrubber 4000",
      adapterId: "adapter-a",
      adapterVersion: "1.2.0",
      reportedAt: 1_755_600_000_000,
      receivedAt: 1_755_600_000_100,
      core: {
        connectivity: "online",
        batteryPercent: 91,
        position: { frame: "site-map", x: 4, y: 9 },
        status: "busy",
        health: { severity: "nominal" },
      },
      freshness: "live",
      capabilities: [{ name: "dock", payload: { docked: false, dockId: null } }],
    });

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      throw new Error("expected success");
    }

    const swept = contracts.withFreshness(
      decoded.value,
      contracts.deriveFreshness({
        receivedAt: decoded.value.receivedAt,
        now: decoded.value.receivedAt + 30_000,
      }),
    );

    expect(swept.freshness).toBe("unreachable");
    expect(swept.reportedAt).toBe(decoded.value.reportedAt);
    expect(contracts.encodeCanonicalEnvelope(swept).capabilities).toEqual([
      { name: "dock", payload: { docked: false, dockId: null } },
    ]);
  });

  it("completes an adapter envelope into a canonical one through the public surface", () => {
    // The ingest path as `packages/server` will run it (ADR 10): decode what the
    // adapter produced, derive freshness from the receipt instant, and complete
    // the envelope through the one constructor. Nothing here needs an internal
    // import, which is the property this test exists to hold.
    const receivedAt = 1_755_600_000_120;
    const produced = contracts.parseAdapterEnvelope({
      schemaVersion: contracts.SCHEMA_VERSION,
      robotId: "R-204",
      siteId: "site.north",
      vendorId: "A",
      model: "Scrubber 4000",
      adapterId: "adapter-a",
      adapterVersion: "1.2.0",
      reportedAt: 1_755_600_000_000,
      receivedAt,
      core: {
        connectivity: "online",
        batteryPercent: 67.4,
        position: null,
        status: "busy",
        health: { severity: "nominal" },
      },
      capabilities: [{ name: "dock", payload: { docked: false, dockId: null } }],
    });

    expect(produced.ok).toBe(true);
    if (!produced.ok) {
      throw new Error("expected success");
    }

    const canonical = contracts.withFreshness(
      produced.value,
      contracts.deriveFreshness({ receivedAt, now: receivedAt + 500 }),
    );

    expect(canonical.freshness).toBe("live");
    // The completed value is a canonical envelope by the schema's own judgment,
    // not merely by assignability.
    expect(contracts.parseCanonicalEnvelope(contracts.encodeCanonicalEnvelope(canonical)).ok).toBe(
      true,
    );
  });
});
