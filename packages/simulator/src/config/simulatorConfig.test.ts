import { describe, expect, it } from "vitest";

import { DEFAULTS } from "./simulatorConfig.ts";

describe("DEFAULTS.endpoint", () => {
  it("names the address the server binds by default", () => {
    // Coupling: `packages/server/src/config/runtimeEndpoints.ts` declares
    // `ENDPOINT_DEFAULTS` as host `127.0.0.1` and port `8080`, and pins them in its
    // own `runtimeEndpoints.test.ts`. The two are restated rather than shared because
    // this package must not depend on the server. If this assertion and that one
    // disagree, `pnpm dev` emits telemetry into a closed port — which is the state
    // the architecture audit § 2 records, and exactly what ADR 21 exists to end.
    expect(DEFAULTS.endpoint).toBe("http://127.0.0.1:8080");
  });

  it("is an absolute origin with no trailing path, so a vendor segment can be appended", () => {
    const url = new URL(DEFAULTS.endpoint);
    expect(url.origin).toBe(DEFAULTS.endpoint);
    expect(["http:", "https:"]).toContain(url.protocol);
  });
});
