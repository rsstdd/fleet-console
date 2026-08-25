import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";

import {
  decodeFrame,
  decodeFrameText,
  fetchBatteryHistory,
  fetchFleetSnapshot,
  fetchHealth,
  fetchRobotDetail,
  type FetchLike,
} from "./transportDecoding";

/**
 * The console's one decode. What these cases guard is the distinction Principle 5 needs
 * and ADR 20 states: a request that failed is recoverable, a body this console cannot read
 * is not, and a console that merges them retries forever against a contract mismatch.
 */
describe("fetchFleetSnapshot", () => {
  const SNAPSHOT = {
    schemaVersion: SCHEMA_VERSION,
    serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
    flushSequence: 0,
    capturedAt: 0,
    sites: [],
    robots: [],
  };

  function createRespondingFetch(
    body: unknown,
    init: { readonly ok?: boolean; readonly status?: number } = {},
  ): FetchLike {
    return () =>
      Promise.resolve({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: () => Promise.resolve(body),
      });
  }

  it("decodes a valid snapshot", async () => {
    const outcome = await fetchFleetSnapshot(createRespondingFetch(SNAPSHOT), "/api/fleet");

    expect(outcome).toStrictEqual({ ok: true, snapshot: SNAPSHOT });
  });

  it("calls a non-2xx unreachable, so it stays retryable", async () => {
    // Including a 500: the server failing to produce a body is not the same event as
    // producing one this console cannot read.
    const outcome = await fetchFleetSnapshot(
      createRespondingFetch(null, { ok: false, status: 500 }),
      "/api",
    );

    expect(outcome).toStrictEqual({
      ok: false,
      failure: { kind: "unreachable", status: 500 },
    });
  });

  it("calls a rejected request unreachable with no status", async () => {
    const outcome = await fetchFleetSnapshot(() => Promise.reject(new Error("offline")), "/api");

    expect(outcome).toStrictEqual({ ok: false, failure: { kind: "unreachable", status: null } });
  });

  it("calls a body the contract refuses terminal, and keeps the failing paths", async () => {
    // Retrying returns the same bytes, so this must not look like a network blip. The
    // paths are what let a diagnostics surface name the field without showing a payload.
    const outcome = await fetchFleetSnapshot(
      createRespondingFetch({ ...SNAPSHOT, flushSequence: -1 }),
      "/api",
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract");
    if (outcome.failure.kind !== "contract") return;
    expect(outcome.failure.issues.map((issue) => issue.path)).toContain("flushSequence");
  });
});

describe("decodeFrame", () => {
  it("decodes a valid frame", () => {
    const batch = {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence: 2,
      sentAt: 0,
      robots: [],
    };

    expect(decodeFrame(batch)).toStrictEqual({ ok: true, batch });
  });

  it("refuses a frame the contract does not accept, without throwing", () => {
    // A throwing decode inside a socket handler takes the connection down with it.
    const outcome = decodeFrame({ schemaVersion: SCHEMA_VERSION, robots: [] });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.issues.length).toBeGreaterThan(0);
  });

  it("reports a non-JSON message in the same shape as a schema failure", () => {
    // One path to count and one path to render; the empty issue list says which it was.
    expect(decodeFrameText("<html>proxy error</html>")).toStrictEqual({ ok: false, issues: [] });
  });

  it("decodes a frame delivered as text", () => {
    const batch = {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId: "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b",
      flushSequence: 7,
      sentAt: 1,
      robots: [],
    };

    expect(decodeFrameText(JSON.stringify(batch))).toStrictEqual({ ok: true, batch });
  });
});

describe("fetchRobotDetail", () => {
  const OBSERVED = {
    schemaVersion: SCHEMA_VERSION,
    robotId: "R-003",
    siteId: "SITE-NORTH",
    vendorId: "C",
    model: "CV-7",
    adapterId: "vendor-c",
    adapterVersion: "1.0.0",
    reportedAt: 1_755_600_000_000,
    receivedAt: 1_755_600_000_200,
    freshness: "live",
    core: {
      connectivity: "unknown",
      batteryPercent: 31,
      position: null,
      status: "idle",
      health: { severity: "nominal" },
    },
    capabilities: [{ name: "dock", payload: { docked: false, dockId: null } }],
    sequenceHealth: { evaluated: true, gaps: 0, duplicates: 0 },
    rawPayload: { robot_id: "R-003" },
  };

  const REGISTERED = {
    schemaVersion: SCHEMA_VERSION,
    robotId: "R-001",
    siteId: "SITE-NORTH",
    vendorId: "A",
    freshness: "unknown",
  };

  const createRespondingFetch =
    (body: unknown, init: { readonly ok?: boolean; readonly status?: number } = {}): FetchLike =>
    () =>
      Promise.resolve({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: () => Promise.resolve(body),
      });

  it("decodes a robot that has reported", async () => {
    const outcome = await fetchRobotDetail(createRespondingFetch(OBSERVED), "/api/robots/R-003");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.robot.observed).toBe(true);
  });

  it("decodes a robot the manifest registered and nothing has reported for", async () => {
    // The endpoint's second population. `@fleet/contracts` has no union for the pair, so
    // both parsers are tried here — recorded as a contracts change in server TODO G2.
    const outcome = await fetchRobotDetail(createRespondingFetch(REGISTERED), "/api/robots/R-001");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.robot.observed).toBe(false);
  });

  it("treats a 404 as its own outcome, not as an error", async () => {
    // An unknown id is a wrong link: the page shows a way back, not a failure banner.
    const outcome = await fetchRobotDetail(
      createRespondingFetch(null, { ok: false, status: 404 }),
      "/api",
    );

    expect(outcome).toStrictEqual({ ok: false, failure: { kind: "not-found" } });
  });

  it("reports the diagnostic schema's issues when a body satisfies neither shape", async () => {
    // Reporting the two-field registration schema's complaints would point a reader at the
    // wrong shape; the observed envelope is the strictly larger one.
    const outcome = await fetchRobotDetail(
      createRespondingFetch({ ...OBSERVED, receivedAt: "not-a-number" }),
      "/api",
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract");
    if (outcome.failure.kind !== "contract") return;
    expect(outcome.failure.issues.map((issue) => issue.path)).toContain("receivedAt");
  });
});

describe("fetchHealth", () => {
  it("decodes a health response", async () => {
    const health = {
      schemaVersion: SCHEMA_VERSION,
      capturedAt: 0,
      malformedIngest: 0,
      unsupportedVendors: 0,
      unknownFieldScope: "accepted",
      byAdapter: {
        A: {
          failures: 0,
          unknownFields: { total: 2, fields: { "telemetry.x": 2 } },
          sequence: { evaluated: false },
        },
      },
      lateFreshnessTicks: { count: 0, lastLatenessMs: null },
    };

    const outcome = await fetchHealth(
      () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(health) }),
      "/api/health",
    );

    expect(outcome).toStrictEqual({ ok: true, health });
  });

  it("fails shapelessly, because health is advisory", async () => {
    // A console that could not read health still knows everything about the robot it is
    // showing; blocking on it would let a diagnostics surface take the operator view down.
    const outcome = await fetchHealth(() => Promise.reject(new Error("offline")), "/api/health");

    expect(outcome).toStrictEqual({ ok: false });
  });
});

describe("fetchBatteryHistory", () => {
  const HISTORY = {
    schemaVersion: "1",
    robotId: "R-118",
    capturedAt: 60_000,
    windowMs: 60_000,
    maxPoints: 60,
    sourceSampleCount: 1,
    missingBatterySampleCount: 0,
    points: [{ receivedAt: 59_000, batteryPercent: 91 }],
  };

  function createRespondingFetch(
    body: unknown,
    init: { readonly ok?: boolean; readonly status?: number } = {},
  ): FetchLike {
    return () =>
      Promise.resolve({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: () => Promise.resolve(body),
      });
  }

  it("decodes a valid history response", async () => {
    const outcome = await fetchBatteryHistory(
      createRespondingFetch(HISTORY),
      "/api/robots/R-118/history",
    );

    expect(outcome).toStrictEqual({ ok: true, history: HISTORY });
  });

  it("calls a non-2xx unreachable, so it stays retryable", async () => {
    const outcome = await fetchBatteryHistory(
      createRespondingFetch(null, { ok: false, status: 503 }),
      "/api/robots/R-118/history",
    );

    expect(outcome).toStrictEqual({
      ok: false,
      failure: { kind: "unreachable", status: 503 },
    });
  });

  it("calls a rejected request unreachable with no status", async () => {
    const outcome = await fetchBatteryHistory(
      () => Promise.reject(new Error("offline")),
      "/api/robots/R-118/history",
    );

    expect(outcome).toStrictEqual({ ok: false, failure: { kind: "unreachable", status: null } });
  });

  it("calls a body the contract refuses terminal, with the failing paths named", async () => {
    // A count invariant violation: more points than numeric samples. Retrying returns
    // the same bytes, so this must not be presented as retryable.
    const outcome = await fetchBatteryHistory(
      createRespondingFetch({ ...HISTORY, sourceSampleCount: 0 }),
      "/api/robots/R-118/history",
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract");
    if (outcome.failure.kind !== "contract") return;
    expect(outcome.failure.issues.length).toBeGreaterThan(0);
  });
});
