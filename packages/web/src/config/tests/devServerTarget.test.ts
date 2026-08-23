import { describe, expect, it } from "vitest";

import { DEV_SERVER_DEFAULTS, DEV_SERVER_ENV_KEYS, devServerTarget } from "../devServerTarget";

describe("devServerTarget", () => {
  it("aims at the server's own defaults when nothing is set", () => {
    // This is the one-command start: `pnpm dev` with no environment at all has
    // to reach a server that also defaulted.
    expect(devServerTarget({})).toBe("http://127.0.0.1:8080");
  });

  it("pins the keys and defaults the server owns", () => {
    // Coupling: `packages/server/src/config/runtimeEndpoints.ts` declares these as
    // `ENDPOINT_ENV_KEYS` and `ENDPOINT_DEFAULTS`. They are restated here because
    // the console must not import the server. If this assertion and the matching
    // one in that package's `runtimeEndpoints.test.ts` ever disagree, the dev proxy
    // is pointed somewhere nothing is listening (ADR 21).
    expect(DEV_SERVER_ENV_KEYS.host).toBe("FLEET_SERVER_HOST");
    expect(DEV_SERVER_ENV_KEYS.port).toBe("FLEET_SERVER_PORT");
    expect(DEV_SERVER_DEFAULTS.host).toBe("127.0.0.1");
    expect(DEV_SERVER_DEFAULTS.port).toBe("8080");
  });

  it("follows the server when either key is set", () => {
    expect(devServerTarget({ [DEV_SERVER_ENV_KEYS.port]: "9999" })).toBe("http://127.0.0.1:9999");
    expect(devServerTarget({ [DEV_SERVER_ENV_KEYS.host]: "0.0.0.0" })).toBe("http://0.0.0.0:8080");
    expect(
      devServerTarget({
        [DEV_SERVER_ENV_KEYS.host]: "fleet.internal",
        [DEV_SERVER_ENV_KEYS.port]: "3000",
      }),
    ).toBe("http://fleet.internal:3000");
  });

  it("brackets an IPv6 literal so the target is a parseable URL", () => {
    // `http://::1:8080` is not a URL any client can parse, and the mistake stays
    // invisible until something tries to connect through the proxy.
    expect(devServerTarget({ [DEV_SERVER_ENV_KEYS.host]: "::1" })).toBe("http://[::1]:8080");
    expect(new URL(devServerTarget({ [DEV_SERVER_ENV_KEYS.host]: "::1" })).port).toBe("8080");
  });

  it("leaves an already-bracketed IPv6 literal alone", () => {
    expect(devServerTarget({ [DEV_SERVER_ENV_KEYS.host]: "[::1]" })).toBe("http://[::1]:8080");
  });

  it("produces a parseable origin for every accepted host form", () => {
    for (const host of ["127.0.0.1", "localhost", "0.0.0.0", "fleet.internal", "::1", "[::1]"]) {
      const target = devServerTarget({ [DEV_SERVER_ENV_KEYS.host]: host });
      expect(() => new URL(target)).not.toThrow();
    }
  });

  it("does not validate, because the server is the authority on these values", () => {
    // A second set of rules here could only disagree with the one that decides
    // whether the process starts. A bad value fails at the server, loudly, and
    // the proxy then fails visibly on the first request (ADR 21).
    expect(devServerTarget({ [DEV_SERVER_ENV_KEYS.port]: "not-a-port" })).toBe(
      "http://127.0.0.1:not-a-port",
    );
  });
});
