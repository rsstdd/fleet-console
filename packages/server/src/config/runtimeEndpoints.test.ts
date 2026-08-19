import { describe, expect, it } from "vitest";

import { ConfigValidationError } from "./freshnessPolicy.ts";
import {
  ENDPOINT_DEFAULTS,
  ENDPOINT_ENV_KEYS,
  parseRuntimeEndpoints,
  type RuntimeEndpoints,
} from "./runtimeEndpoints.ts";

/** Builds an environment record holding only the keys a case cares about. */
function env(overrides: Readonly<Record<string, string>> = {}): Record<string, string | undefined> {
  return { ...overrides };
}

/** Parses and returns the error message, failing the test if the input was accepted. */
function messageFor(input: Record<string, string | undefined>): string {
  try {
    parseRuntimeEndpoints(input);
  } catch (error: unknown) {
    if (error instanceof ConfigValidationError) {
      return error.message;
    }
    throw error;
  }
  throw new Error("expected the configuration to be rejected, but it was accepted");
}

describe("parseRuntimeEndpoints defaults", () => {
  it("runs on loopback and port 8080 when nothing is set", () => {
    // The one-command demo has to start from a clean clone with no environment at
    // all. This is the case that keeps the README's promise true.
    expect(parseRuntimeEndpoints(env())).toEqual<RuntimeEndpoints>({
      host: "127.0.0.1",
      port: 8080,
      allowedOrigins: [],
    });
  });

  it("pins the documented defaults, which two other packages restate", () => {
    // Coupling: `packages/web/src/config/devServerTarget.ts` aims the Vite dev proxy
    // at these values and `packages/simulator`'s `DEFAULTS.endpoint` is the same
    // address. Changing either number here without changing both of those breaks the
    // one-command start (ADR 21).
    expect(ENDPOINT_DEFAULTS.host).toBe("127.0.0.1");
    expect(ENDPOINT_DEFAULTS.port).toBe(8080);
  });

  it("defaults to denying every cross-origin caller", () => {
    // Fail closed. An allow-list that starts permissive is one nobody notices is
    // permissive.
    expect(parseRuntimeEndpoints(env()).allowedOrigins).toEqual([]);
  });
});

describe("parseRuntimeEndpoints port", () => {
  it("accepts a decimal port and both range boundaries", () => {
    expect(parseRuntimeEndpoints(env({ [ENDPOINT_ENV_KEYS.port]: "3000" })).port).toBe(3000);
    expect(parseRuntimeEndpoints(env({ [ENDPOINT_ENV_KEYS.port]: "1" })).port).toBe(1);
    expect(parseRuntimeEndpoints(env({ [ENDPOINT_ENV_KEYS.port]: "65535" })).port).toBe(65_535);
  });

  it("rejects an out-of-range port and names the key", () => {
    // Required evidence for D13: an invalid port fails startup with the field
    // named, rather than defaulting to something that appears to work.
    expect(messageFor(env({ [ENDPOINT_ENV_KEYS.port]: "65536" }))).toContain(
      ENDPOINT_ENV_KEYS.port,
    );
    expect(messageFor(env({ [ENDPOINT_ENV_KEYS.port]: "0" }))).toContain("any free port");
  });

  it("rejects anything that is not plainly a decimal integer", () => {
    // Each of these becomes a plausible-looking number under `Number()` or
    // `parseInt`, which is exactly why the string shape is checked first.
    for (const raw of ["8080abc", " 8080", "8080 ", "+8080", "-1", "0x1f", "8080.0", "8_080", ""]) {
      expect(messageFor(env({ [ENDPOINT_ENV_KEYS.port]: raw }))).toContain(ENDPOINT_ENV_KEYS.port);
    }
  });

  it("treats an empty value as a mistake rather than as absence", () => {
    // `FLEET_SERVER_PORT=` is someone setting the variable and getting it wrong.
    // Absence means nobody expressed a preference; the two must not be equal.
    expect(messageFor(env({ [ENDPOINT_ENV_KEYS.port]: "" }))).toContain(ENDPOINT_ENV_KEYS.port);
    expect(parseRuntimeEndpoints(env()).port).toBe(ENDPOINT_DEFAULTS.port);
  });
});

describe("parseRuntimeEndpoints host", () => {
  it("accepts hostnames, IPv4 and an explicit all-interfaces bind", () => {
    for (const host of ["localhost", "0.0.0.0", "10.1.2.3", "fleet.internal", "::1"]) {
      expect(parseRuntimeEndpoints(env({ [ENDPOINT_ENV_KEYS.host]: host })).host).toBe(host);
    }
  });

  it("never binds all interfaces unless asked", () => {
    // Authentication is an explicit product cut and the diagnostic endpoint serves
    // raw vendor payloads, so publishing on every interface has to be deliberate.
    expect(parseRuntimeEndpoints(env()).host).toBe("127.0.0.1");
  });

  it("rejects an empty or whitespace host and names the key", () => {
    for (const raw of ["", " ", "\t", "a b"]) {
      expect(messageFor(env({ [ENDPOINT_ENV_KEYS.host]: raw }))).toContain(ENDPOINT_ENV_KEYS.host);
    }
  });
});

describe("parseRuntimeEndpoints allowed origins", () => {
  it("accepts a comma-separated list and keeps declaration order", () => {
    const parsed = parseRuntimeEndpoints(
      env({
        [ENDPOINT_ENV_KEYS.allowedOrigins]:
          "https://console.example.com, http://localhost:5173,https://ops.example.com:8443",
      }),
    );
    expect(parsed.allowedOrigins).toEqual([
      "https://console.example.com",
      "http://localhost:5173",
      "https://ops.example.com:8443",
    ]);
  });

  it("treats an empty or whitespace-only list as no origins rather than an error", () => {
    // Unlike host and port, clearing this variable is a legitimate way to say
    // "nothing cross-origin", which is what a proxied or same-origin console wants.
    expect(
      parseRuntimeEndpoints(env({ [ENDPOINT_ENV_KEYS.allowedOrigins]: "" })).allowedOrigins,
    ).toEqual([]);
    expect(
      parseRuntimeEndpoints(env({ [ENDPOINT_ENV_KEYS.allowedOrigins]: " , ,  " })).allowedOrigins,
    ).toEqual([]);
  });

  it("rejects an entry that would never match the Origin header a browser sends", () => {
    // Each of these is a near-miss that silently allows nothing: browsers send a
    // bare origin, so a trailing slash or a path can never compare equal.
    for (const raw of [
      "https://console.example.com/",
      "https://console.example.com/app",
      "https://console.example.com?x=1",
      "console.example.com",
      "not a url",
    ]) {
      expect(messageFor(env({ [ENDPOINT_ENV_KEYS.allowedOrigins]: raw }))).toContain(
        ENDPOINT_ENV_KEYS.allowedOrigins,
      );
    }
  });

  it("rejects a wildcard origin explicitly rather than by accident", () => {
    const message = messageFor(env({ [ENDPOINT_ENV_KEYS.allowedOrigins]: "*" }));
    expect(message).toContain("unauthenticated");
  });

  it("names the offending entry, not just the key, when one of several is wrong", () => {
    const message = messageFor(
      env({
        [ENDPOINT_ENV_KEYS.allowedOrigins]: "https://good.example.com,https://bad.example.com/",
      }),
    );
    expect(message).toContain("https://bad.example.com/");
    expect(message).not.toContain("[https://good.example.com]");
  });
});

describe("parseRuntimeEndpoints failure reporting", () => {
  it("reports every invalid key at once rather than one per attempt", () => {
    // A deployer fixing one key only to be told about the next is being made to
    // bisect their own configuration.
    const message = messageFor(
      env({
        [ENDPOINT_ENV_KEYS.host]: "",
        [ENDPOINT_ENV_KEYS.port]: "nope",
        [ENDPOINT_ENV_KEYS.allowedOrigins]: "*",
      }),
    );
    expect(message).toContain(ENDPOINT_ENV_KEYS.host);
    expect(message).toContain(ENDPOINT_ENV_KEYS.port);
    expect(message).toContain(ENDPOINT_ENV_KEYS.allowedOrigins);
  });

  it("reports each mistake exactly once", () => {
    // The refinements are written to be mutually exclusive. A deployer told two
    // things about one value has to work out which one to act on, and an empty
    // host reporting both "too small" and "no whitespace" is noise, not detail.
    const cases: readonly (readonly [string, string])[] = [
      [ENDPOINT_ENV_KEYS.host, ""],
      [ENDPOINT_ENV_KEYS.port, "0"],
      [ENDPOINT_ENV_KEYS.port, "99999"],
      [ENDPOINT_ENV_KEYS.allowedOrigins, "*"],
    ];
    for (const [key, value] of cases) {
      const lines = messageFor(env({ [key]: value }))
        .split("\n")
        .filter((line) => line.trimStart().startsWith("- "));
      expect(lines).toHaveLength(1);
    }
  });

  it("raises the same error type the file loaders raise", () => {
    // One startup-failure vocabulary, so a composition root has one thing to catch
    // and one message shape to print.
    expect(() => parseRuntimeEndpoints(env({ [ENDPOINT_ENV_KEYS.port]: "-1" }))).toThrow(
      ConfigValidationError,
    );
  });

  it("ignores environment keys it does not own", () => {
    // The environment is shared with the shell, the simulator and Vite. A strict
    // schema over `process.env` would fail on `PATH`.
    expect(parseRuntimeEndpoints(env({ PATH: "/usr/bin", FLEET_INGEST_URL: "http://x" }))).toEqual({
      host: ENDPOINT_DEFAULTS.host,
      port: ENDPOINT_DEFAULTS.port,
      allowedOrigins: [],
    });
  });
});
