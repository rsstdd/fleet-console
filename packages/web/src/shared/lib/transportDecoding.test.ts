import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";

import {
  decodeFrame,
  decodeFrameText,
  fetchFleetSnapshot,
  type FetchLike,
} from "./transportDecoding";

/**
 * The console's one decode. What these cases guard is the distinction Principle 5 needs
 * and W-6 states: a request that failed is recoverable, a body this console cannot read
 * is not, and a console that merges them retries forever against a contract mismatch.
 */
describe("fetchFleetSnapshot", () => {
  const SNAPSHOT = {
    schemaVersion: SCHEMA_VERSION,
    flushSequence: 0,
    capturedAt: 0,
    robots: [],
  };

  function responding(body: unknown, init: { ok?: boolean; status?: number } = {}): FetchLike {
    return () =>
      Promise.resolve({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        json: () => Promise.resolve(body),
      });
  }

  it("decodes a valid snapshot", async () => {
    const outcome = await fetchFleetSnapshot(responding(SNAPSHOT), "/api/fleet");

    expect(outcome).toStrictEqual({ ok: true, snapshot: SNAPSHOT });
  });

  it("calls a non-2xx unreachable, so it stays retryable", async () => {
    // Including a 500: the server failing to produce a body is not the same event as
    // producing one this console cannot read.
    const outcome = await fetchFleetSnapshot(responding(null, { ok: false, status: 500 }), "/api");

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
      responding({ schemaVersion: SCHEMA_VERSION, flushSequence: -1, capturedAt: 0, robots: [] }),
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
    const batch = { schemaVersion: SCHEMA_VERSION, flushSequence: 2, sentAt: 0, robots: [] };

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
    const batch = { schemaVersion: SCHEMA_VERSION, flushSequence: 7, sentAt: 1, robots: [] };

    expect(decodeFrameText(JSON.stringify(batch))).toStrictEqual({ ok: true, batch });
  });
});
