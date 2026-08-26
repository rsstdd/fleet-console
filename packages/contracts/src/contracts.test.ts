import { describe, expect, it } from "vitest";
import {
  DEFAULT_FRESHNESS_POLICY,
  deriveFreshness,
  parseCapabilities,
  parseFleetSnapshot,
  reconcileDeltaWithSnapshot,
  SCHEMA_VERSION,
} from "./index.js";

const SESSION = "3f1a5d2c-8b7e-4c9a-9f2d-6e5b4a3c2d1e";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    serverSessionId: SESSION,
    flushSequence: 4,
    capturedAt: 1_700_000_000_000,
    sites: [{ siteId: "SITE-NORTH", label: "North site" }],
    robots: [],
    ...overrides,
  };
}

describe("fleet snapshot", () => {
  it("accepts a snapshot whose robots all reference a declared site", () => {
    const result = parseFleetSnapshot(
      snapshot({
        robots: [
          {
            schemaVersion: SCHEMA_VERSION,
            robotId: "R-001",
            siteId: "SITE-NORTH",
            vendorId: "A",
            freshness: "unknown",
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a robot referencing an undefined site rather than inventing a label", () => {
    const result = parseFleetSnapshot(
      snapshot({
        robots: [
          {
            schemaVersion: SCHEMA_VERSION,
            robotId: "R-001",
            siteId: "SITE-GHOST",
            vendorId: "A",
            freshness: "unknown",
          },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe("robots[0].siteId");
    }
  });

  it("rejects an unsupported schema version rather than reinterpreting it", () => {
    expect(parseFleetSnapshot(snapshot({ schemaVersion: "2" })).ok).toBe(false);
  });
});

describe("capabilities", () => {
  it("decodes the wire list into a keyed record", () => {
    const result = parseCapabilities([
      { name: "dock", payload: { docked: true, dockId: "DOCK-1" } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dock?.docked).toBe(true);
      expect(result.value.waterLevel).toBeUndefined();
    }
  });

  it("rejects a duplicated capability entry", () => {
    const entry = { name: "sequence", payload: { value: 1 } };
    expect(parseCapabilities([entry, entry]).ok).toBe(false);
  });
});

describe("deriveFreshness", () => {
  const now = 1_000_000;

  it("reports unknown when nothing has ever been received", () => {
    expect(deriveFreshness({ receivedAt: null, now })).toBe("unknown");
  });

  it("degrades live to stale to unreachable as silence lengthens", () => {
    const { liveThresholdMs, staleThresholdMs } = DEFAULT_FRESHNESS_POLICY;
    expect(deriveFreshness({ receivedAt: now - liveThresholdMs, now })).toBe("live");
    expect(deriveFreshness({ receivedAt: now - liveThresholdMs - 1, now })).toBe("stale");
    expect(deriveFreshness({ receivedAt: now - staleThresholdMs - 1, now })).toBe("unreachable");
  });

  it("treats a reading from the future as current rather than negative-aged", () => {
    expect(deriveFreshness({ receivedAt: now + 5_000, now })).toBe("live");
  });
});

describe("reconcileDeltaWithSnapshot", () => {
  const base = { serverSessionId: SESSION, flushSequence: 10 };

  it("discards a delta the snapshot already covers", () => {
    expect(reconcileDeltaWithSnapshot(base, { ...base, flushSequence: 10 })).toBe("covered");
  });

  it("applies a delta newer than the snapshot", () => {
    expect(reconcileDeltaWithSnapshot(base, { ...base, flushSequence: 11 })).toBe("apply");
  });

  it("refuses to compare sequences across server sessions", () => {
    expect(
      reconcileDeltaWithSnapshot(base, {
        serverSessionId: "00000000-0000-4000-8000-000000000000",
        flushSequence: 99,
      }),
    ).toBe("session-mismatch");
  });
});
