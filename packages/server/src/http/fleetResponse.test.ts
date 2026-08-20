import { describe, expect, it } from "vitest";

import { type CanonicalEnvelope, SCHEMA_VERSION, parseFleetSnapshot } from "@fleet/contracts";

import type { CurrentRobotState, UnobservedRobotState } from "../state/currentStateStore.ts";
import { encodeFleetSnapshot } from "./fleetResponse.ts";

/**
 * The claim worth testing is not that the function returns an object — it is that what it
 * returns survives the console's own decoder. Server state is a superset of the contract
 * in two places, and `JSON.stringify` is happy with both.
 */
describe("encodeFleetSnapshot", () => {
  const UNOBSERVED: UnobservedRobotState = {
    schemaVersion: SCHEMA_VERSION,
    robotId: "rbt-1",
    siteId: "site-a",
    vendorId: "A",
    model: "sweeper-2000",
    freshness: "unknown",
  };

  const OBSERVED: CanonicalEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    robotId: "rbt-2",
    siteId: "site-a",
    vendorId: "B",
    model: "hauler-9",
    adapterId: "vendor-b",
    adapterVersion: "1.0.0",
    reportedAt: 1_755_000_000_000,
    receivedAt: 1_755_000_000_400,
    freshness: "live",
    core: {
      connectivity: "unknown",
      batteryPercent: 62,
      position: null,
      status: "idle",
      health: { severity: "nominal" },
    },
    capabilities: { dock: { docked: false, dockId: null } },
  };

  /** The directory the encoded snapshot must carry and its robots must satisfy. */
  const SITES = [{ siteId: "site-a", label: "Site A" }];

  function encode(robots: readonly CurrentRobotState[]): unknown {
    return JSON.parse(
      JSON.stringify(
        encodeFleetSnapshot({
          sites: SITES,
          robots,
          capturedAt: 1_755_000_001_000,
          serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
          flushSequence: 0,
        }),
      ),
    );
  }

  it("produces a body the contract's own decoder accepts", () => {
    // The whole point of the module. A body that only `JSON.stringify` accepts reaches the
    // console as a parse failure, which reads as a network problem rather than a shape one.
    const result = parseFleetSnapshot(encode([UNOBSERVED, OBSERVED]));

    expect(result.ok).toBe(true);
  });

  it("drops the manifest-only `model` from an unobserved robot", () => {
    // `registeredRobotStateSchema` is strict, so carrying server state straight through
    // fails the decoder on a field no fleet row uses.
    expect(encode([UNOBSERVED])).toStrictEqual({
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence: 0,
      capturedAt: 1_755_000_001_000,
      sites: [{ siteId: "site-a", label: "Site A" }],
      robots: [
        {
          schemaVersion: SCHEMA_VERSION,
          robotId: "rbt-1",
          siteId: "site-a",
          vendorId: "A",
          freshness: "unknown",
        },
      ],
    });
  });

  it("writes an observed robot's capabilities as the wire array, not the runtime record", () => {
    const encoded = encode([OBSERVED]);

    expect(encoded).toMatchObject({
      robots: [{ capabilities: [{ name: "dock", payload: { docked: false, dockId: null } }] }],
    });
  });

  it("carries the site directory the console labels sites from", () => {
    // ADR 34: the snapshot is the only response that carries labels; a robot
    // pointing outside the directory would have failed the decode above.
    expect(encode([OBSERVED])).toMatchObject({ sites: SITES });
  });

  it("carries no raw vendor payload for either population", () => {
    // ADR 1: the raw payload is served only by GET /api/robots/:id. The type enforces it;
    // this asserts the type was not worked around.
    expect(JSON.stringify(encode([UNOBSERVED, OBSERVED]))).not.toContain("rawPayload");
  });
});
