import { describe, expect, it } from "vitest";

import { parseRuntimeEndpoints } from "../config/runtimeEndpoints.ts";
import { evaluateOriginPolicy } from "./originPolicy.ts";

/**
 * ADR 21 decodes `FLEET_ALLOWED_ORIGINS` and its § Implications records that nothing
 * consumed it. These are the three cases `TODO.md` **B1d** says the consumer has to get
 * right — grant, decline, and the request that is not cross-origin at all — plus the
 * preflight without which a granted origin still cannot `POST` JSON.
 */
describe("evaluateOriginPolicy", () => {
  const ALLOWED = ["https://console.example.com", "https://ops.example.com"] as const;

  it("treats a request with no Origin header as not cross-origin", () => {
    // ADR 21 § Open questions asked exactly this and named this answer as intended.
    // The simulator, curl and a same-origin browser all arrive without the header.
    for (const origin of [null, undefined, ""]) {
      const decision = evaluateOriginPolicy({ origin, method: "POST" }, ALLOWED);

      expect(decision.outcome).toBe("not-cross-origin");
      expect(decision.preflight).toBe(false);
      expect(decision.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    }
  });

  it("echoes an allowed origin rather than answering with a wildcard", () => {
    const decision = evaluateOriginPolicy({ origin: ALLOWED[1], method: "GET" }, ALLOWED);

    expect(decision.outcome).toBe("granted");
    expect(decision.headers["Access-Control-Allow-Origin"]).toBe(ALLOWED[1]);
  });

  it("grants no origin when the list is empty", () => {
    // The shipped default. Empty means "no cross-origin caller", never "allow everything".
    const decision = evaluateOriginPolicy({ origin: ALLOWED[0], method: "GET" }, []);

    expect(decision.outcome).toBe("not-granted");
    expect(decision.headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("declines an origin outside the list, including near-misses of a listed entry", () => {
    for (const origin of [
      "https://attacker.example.com",
      "https://console.example.com.evil.test",
      "http://console.example.com",
      "https://console.example.com/",
      "HTTPS://CONSOLE.EXAMPLE.COM",
    ]) {
      const decision = evaluateOriginPolicy({ origin, method: "GET" }, ALLOWED);

      expect(decision.outcome).toBe("not-granted");
      expect(decision.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    }
  });

  it("sets Vary: Origin on every outcome, so a cache cannot reuse a grant", () => {
    for (const origin of [null, "https://attacker.example.com", ALLOWED[0]]) {
      expect(evaluateOriginPolicy({ origin, method: "GET" }, ALLOWED).headers["Vary"]).toBe(
        "Origin",
      );
    }
  });

  it("answers a preflight from an allowed origin with the methods and headers it may use", () => {
    // A JSON POST is preflighted because `content-type: application/json` is not
    // CORS-safelisted, so without this a granted origin still cannot reach ingest.
    const decision = evaluateOriginPolicy({ origin: ALLOWED[0], method: "OPTIONS" }, ALLOWED);

    expect(decision.preflight).toBe(true);
    expect(decision.outcome).toBe("granted");
    expect(decision.headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(decision.headers["Access-Control-Allow-Headers"]).toBe("content-type");
    expect(decision.headers["Access-Control-Max-Age"]).toBe("600");
  });

  it("recognizes a preflight from a declined origin but grants it nothing", () => {
    const decision = evaluateOriginPolicy(
      { origin: "https://attacker.example.com", method: "options" },
      ALLOWED,
    );

    expect(decision.preflight).toBe(true);
    expect(decision.outcome).toBe("not-granted");
    expect(decision.headers["Access-Control-Allow-Methods"]).toBeUndefined();
  });

  it("does not treat a bare OPTIONS with no Origin as a preflight", () => {
    // It must reach the router, which answers for the surface that actually exists,
    // rather than being answered here as a success for a route that may not.
    const decision = evaluateOriginPolicy({ origin: null, method: "OPTIONS" }, ALLOWED);

    expect(decision.preflight).toBe(false);
    expect(decision.outcome).toBe("not-cross-origin");
  });

  it("grants the origins the environment decoded, without a normalization step between", () => {
    // The join ADR 21 depends on: what the schema accepts is what this compares.
    const endpoints = parseRuntimeEndpoints({
      FLEET_ALLOWED_ORIGINS: " https://console.example.com , https://ops.example.com ",
    });

    const decision = evaluateOriginPolicy(
      { origin: "https://console.example.com", method: "GET" },
      endpoints.allowedOrigins,
    );

    expect(decision.outcome).toBe("granted");
  });
});
