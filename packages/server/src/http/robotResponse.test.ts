import { describe, expect, it } from "vitest";

import {
  type CanonicalEnvelope,
  SCHEMA_VERSION,
  parseRegisteredRobotState,
  parseRobotDiagnosticEnvelope,
} from "@fleet/contracts";

import type { UnobservedRobotState } from "../state/currentStateStore.ts";
import { encodeRobotDetail } from "./robotResponse.ts";

/**
 * The single-robot read carries two populations and one thing no other response may:
 * the raw vendor payload (ADR 1).
 */
describe("encodeRobotDetail", () => {
  const OBSERVED: CanonicalEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    robotId: "rbt-1",
    siteId: "site-a",
    vendorId: "C",
    model: "scrubber-3",
    adapterId: "vendor-c",
    adapterVersion: "1.0.0",
    reportedAt: 1_755_600_000_000,
    receivedAt: 1_755_600_000_250,
    freshness: "live",
    core: {
      connectivity: "unknown",
      batteryPercent: 31,
      position: null,
      status: "idle",
      health: { severity: "nominal" },
    },
    capabilities: { waterLevel: { percent: 40 } },
  };

  const UNOBSERVED: UnobservedRobotState = {
    schemaVersion: SCHEMA_VERSION,
    robotId: "rbt-2",
    siteId: "site-a",
    vendorId: "B",
    model: "hauler-9",
    freshness: "unknown",
  };

  const RAW = { robot_id: "rbt-1", telemetry: { firmware_channel: "beta" } };

  it("produces a diagnostic envelope the contract's own decoder accepts", () => {
    const encoded: unknown = JSON.parse(
      JSON.stringify(
        encodeRobotDetail({
          state: OBSERVED,
          rawPayload: RAW,
          sequenceHealth: { evaluated: true, gaps: 2, duplicates: 1 },
        }),
      ),
    );

    const parsed = parseRobotDiagnosticEnvelope(encoded);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.sequenceHealth).toStrictEqual({ evaluated: true, gaps: 2, duplicates: 1 });
    expect(parsed.value.rawPayload).toStrictEqual(RAW);
  });

  it("states a dialect as unevaluated rather than claiming zero gaps it never measured", () => {
    const encoded = encodeRobotDetail({
      state: OBSERVED,
      rawPayload: null,
      sequenceHealth: null,
    });

    expect(encoded).toMatchObject({ sequenceHealth: { evaluated: false } });
  });

  it("serves a registered robot that has never reported, rather than refusing it", () => {
    // The robot-detail page requires this: a known-but-unseen robot renders registration
    // data only. A 404 would contradict the fleet page that is already listing it.
    const encoded = encodeRobotDetail({
      state: UNOBSERVED,
      rawPayload: null,
      sequenceHealth: null,
    });

    // `model` is manifest-only server state and `registeredRobotStateSchema` is strict, so
    // a decode that succeeds is itself the assertion that it was projected off.
    expect(Object.keys(encoded)).not.toContain("model");
    expect(parseRegisteredRobotState(JSON.parse(JSON.stringify(encoded))).ok).toBe(true);
  });
});
