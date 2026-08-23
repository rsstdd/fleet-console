import { describe, expect, it } from "vitest";

import {
  TENANT,
  TENANT_IDS,
  TENANT_PROFILES,
  TenantConfigError,
  parseTenantConfig,
  resolveTenantId,
} from "./tenant";

/** A profile that is valid, used as the base for the rejection cases below. */
function validProfile(): Record<string, unknown> {
  return {
    id: "tenant-a",
    wordmark: "Fleet Console",
    theme: "dark",
    endpoints: { apiBaseUrl: "/api", streamUrl: "/ws" },
    flags: { lidarHealthPanel: true },
  };
}

describe("parseTenantConfig", () => {
  it("accepts a complete profile", () => {
    expect(parseTenantConfig(validProfile()).id).toBe("tenant-a");
  });

  it("rejects an unknown tenant id", () => {
    expect(() => parseTenantConfig({ ...validProfile(), id: "tenant-z" })).toThrow(
      TenantConfigError,
    );
  });

  it("rejects a theme with no palette behind it", () => {
    // The theme union and the palette are one declaration, so a profile can
    // never name a colour scheme that does not exist.
    expect(() => parseTenantConfig({ ...validProfile(), theme: "solarized" })).toThrow(
      TenantConfigError,
    );
  });

  it("rejects an empty wordmark rather than rendering a blank brand", () => {
    expect(() => parseTenantConfig({ ...validProfile(), wordmark: "" })).toThrow(TenantConfigError);
  });

  it("rejects a missing flag rather than defaulting it", () => {
    // Principle 13: a flag nobody deployed must not be invented here. A panel
    // silently appearing because a flag defaulted to true is exactly the
    // tenant-behaviour drift this validation exists to catch.
    expect(() => parseTenantConfig({ ...validProfile(), flags: {} })).toThrow(TenantConfigError);
  });

  it("rejects an unrecognized flag, so a renamed flag fails loudly", () => {
    expect(() =>
      parseTenantConfig({
        ...validProfile(),
        flags: { lidarHealthPanel: true, lidarPanel: false },
      }),
    ).toThrow(TenantConfigError);
  });

  it("names the offending field in the failure", () => {
    // A build that fails on tenant configuration should say which field, the
    // way the server's config loader does.
    expect(() => parseTenantConfig({ ...validProfile(), wordmark: 42 })).toThrow(/wordmark/);
  });

  it("rejects a missing endpoints block rather than assuming an origin", () => {
    // A console that guessed its own API address is the defect D13 existed to
    // close; there is no default to fall back to (ADR 21).
    const withoutEndpoints: Record<string, unknown> = {
      id: "tenant-a",
      wordmark: "Fleet Console",
      theme: "dark",
      flags: { lidarHealthPanel: true },
    };
    expect(() => parseTenantConfig(withoutEndpoints)).toThrow(TenantConfigError);
  });

  it("accepts an absolute cross-origin URL, which is the CORS deployment", () => {
    // The falsifier ADR 21 names: production serving the console from a different
    // origin than the API. The configuration has to be able to express it, and the
    // server's FLEET_ALLOWED_ORIGINS is what must then name this origin.
    const parsed = parseTenantConfig({
      ...validProfile(),
      endpoints: {
        apiBaseUrl: "https://api.example.com/api",
        streamUrl: "wss://api.example.com/ws",
      },
    });
    expect(parsed.endpoints.streamUrl).toBe("wss://api.example.com/ws");
  });

  it("rejects a protocol-relative URL, which only looks root-relative", () => {
    // `//api.example.com/api` inherits the page's scheme and is cross-origin
    // while reading like a same-origin path. It is the one mistake here that
    // would not be visible on inspection.
    expect(() =>
      parseTenantConfig({
        ...validProfile(),
        endpoints: { apiBaseUrl: "//api.example.com/api", streamUrl: "/ws" },
      }),
    ).toThrow(TenantConfigError);
  });

  it("rejects a bare host and an unusable scheme", () => {
    for (const apiBaseUrl of ["api.example.com", "ftp://api.example.com", ""]) {
      expect(() =>
        parseTenantConfig({ ...validProfile(), endpoints: { apiBaseUrl, streamUrl: "/ws" } }),
      ).toThrow(TenantConfigError);
    }
  });

  it("rejects an unrecognized endpoint key, so a renamed one fails loudly", () => {
    expect(() =>
      parseTenantConfig({
        ...validProfile(),
        endpoints: { apiBaseUrl: "/api", streamUrl: "/ws", wsUrl: "/ws" },
      }),
    ).toThrow(TenantConfigError);
  });
});

describe("resolveTenantId", () => {
  it("defaults to tenant A when the build set no tenant", () => {
    expect(resolveTenantId(undefined)).toBe("tenant-a");
  });

  it("accepts every known tenant id", () => {
    for (const id of TENANT_IDS) {
      expect(resolveTenantId(id)).toBe(id);
    }
  });

  it("rejects a value that is not a string at all", () => {
    // `import.meta.env` is loosely typed, so this is a real shape a build can
    // hand over rather than a hypothetical.
    expect(() => resolveTenantId(42)).toThrow(TenantConfigError);
  });

  it("fails the build on an unknown tenant rather than falling back", () => {
    // A typo in the deploy pipeline must not silently ship tenant A's brand
    // to tenant B's customer.
    expect(() => resolveTenantId("tenant-z")).toThrow(TenantConfigError);
  });
});

describe("TENANT_PROFILES", () => {
  it("validates every shipped profile at module load", () => {
    // Not a redundant assertion: these are the literals the build bakes in, so
    // this is the test that fails if one of them is edited into an invalid
    // state without anyone running the console.
    for (const id of TENANT_IDS) {
      expect(parseTenantConfig(TENANT_PROFILES[id]).id).toBe(id);
    }
  });

  it("moves wordmark, theme and the named flag together", () => {
    // The design system makes those three the tenant axis. If a profile ever
    // differs from another in only one of them, the second profile has stopped
    // demonstrating white-label deployment.
    const a = TENANT_PROFILES["tenant-a"];
    const b = TENANT_PROFILES["tenant-b"];

    expect(a.wordmark).not.toBe(b.wordmark);
    expect(a.theme).not.toBe(b.theme);
    expect(a.flags.lidarHealthPanel).not.toBe(b.flags.lidarHealthPanel);
  });

  it("gives tenant B the disabled panel the design system describes", () => {
    expect(TENANT_PROFILES["tenant-b"].flags.lidarHealthPanel).toBe(false);
  });

  it("ships both tenants same-origin, and on the paths the dev proxy forwards", () => {
    // Coupling: these two strings are the proxy keys in `vite.config.ts`. A path
    // changed here and not there leaves the console requesting something Vite
    // does not forward, which is a 404 from the dev server rather than from the
    // API (ADR 21).
    for (const id of TENANT_IDS) {
      expect(TENANT_PROFILES[id].endpoints.apiBaseUrl).toBe("/api");
      expect(TENANT_PROFILES[id].endpoints.streamUrl).toBe("/ws");
    }
  });
});

describe("TENANT", () => {
  it("is one of the validated profiles, chosen at build time", () => {
    expect(TENANT_IDS).toContain(TENANT.id);
    expect(TENANT).toEqual(TENANT_PROFILES[TENANT.id]);
  });
});
