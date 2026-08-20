import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";

import { createHttpApp } from "./createApp.ts";
import { encodeFleetSnapshot } from "./fleetResponse.ts";

/** An empty fleet: these cases are about the policy and the routes, not about state. */
const readFleet = (): ReturnType<typeof encodeFleetSnapshot> =>
  encodeFleetSnapshot({ robots: [], capturedAt: 0, flushSequence: 0 });

/** No robot: these cases are about routing and policy, not about state. */
const readRobot = (): null => null;

/** A stub ingest port: these cases are about routing and policy, not the transition. */
const ingest = {
  apply: (): never => {
    throw new Error("ingest is not exercised by this suite");
  },
  noteUnsupportedVendor: (): void => undefined,
  noteMalformedBody: (): void => undefined,
};

/**
 * The half of **L8** a unit test of `evaluateOriginPolicy` cannot give: evidence that the
 * policy is actually *mounted*, driven through `app.request()` against a real `Request`.
 * A correct policy nobody wired in is the failure ADR 7 records — a rule that permits by
 * silence — and it passes every test in `originPolicy.test.ts`.
 */
describe("createHttpApp", () => {
  const ALLOWED = "https://console.example.com";
  const app = createHttpApp({ allowedOrigins: [ALLOWED], readFleet, readRobot, ingest });

  it("echoes an allowed origin on a response no route produced", async () => {
    // The 404 path specifically: a browser has to be able to read the failure, so the
    // grant has to survive a response the router synthesized rather than a handler.
    const response = await app.request("/api/nothing", { headers: { origin: ALLOWED } });

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(response.headers.get("vary")).toBe("Origin");
  });

  it("serves a request from an origin outside the list, granting it nothing", async () => {
    const response = await app.request("/api/nothing", {
      headers: { origin: "https://attacker.example.com" },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("leaves a request with no Origin header unaffected", async () => {
    const response = await app.request("/api/nothing");

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("grants nothing at all when the allow-list is empty", async () => {
    const closed = createHttpApp({ allowedOrigins: [], readFleet, readRobot, ingest });

    const response = await closed.request("/api/nothing", { headers: { origin: ALLOWED } });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("answers a preflight itself rather than routing it", async () => {
    // Routed, this would 404 — no route accepts OPTIONS — and the browser would report a
    // CORS failure for a path that exists.
    const response = await app.request("/api/telemetry/A", {
      method: "OPTIONS",
      headers: { origin: ALLOWED, "access-control-request-method": "POST" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("answers a preflight from a declined origin without granting it", async () => {
    const response = await app.request("/api/telemetry/A", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example.com" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("returns the canonical error envelope for an unmatched route", async () => {
    const response = await app.request("/api/nothing");

    expect(await response.json()).toStrictEqual({
      schemaVersion: SCHEMA_VERSION,
      error: { kind: "not_found", message: "No such resource.", issues: [] },
    });
  });

  it("reveals nothing about a thrown error", async () => {
    const throwing = createHttpApp({ allowedOrigins: [], readFleet, readRobot, ingest });
    throwing.get("/boom", () => {
      throw new Error('robot-7 payload: {"secret":"vendor-internal"}');
    });

    const response = await throwing.request("/boom");
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain("vendor-internal");
    expect(body).not.toContain("robot-7");
    expect(JSON.parse(body)).toStrictEqual({
      schemaVersion: SCHEMA_VERSION,
      error: {
        kind: "internal",
        message: "The server failed to handle the request.",
        issues: [],
      },
    });
  });
});
