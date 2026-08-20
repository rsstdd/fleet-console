/**
 * Three dialects describing one physical robot state must normalize to one
 * canonical core (adapters TODO D7).
 *
 * This is ADR 1's central claim, and it is the only test in the package that can
 * fail it. Every per-vendor suite asserts that one dialect decodes to the values
 * that dialect should produce — which is true of three adapters that each
 * normalize consistently *wrongly*, and true of three that normalize into three
 * different models. Neither is caught anywhere else, because nothing else looks
 * at two vendors at once.
 *
 * ## The input needs no new fixture
 *
 * The `boundary-empty` and `boundary-full` cases recorded under **C1** are one
 * pinned state per case applied to all three robots, so the six payloads are two
 * physical states written three ways. The `representative` payloads are not — each
 * robot is drawn from the seeded fleet — and that is why they appear here as the
 * control: if the equality below came from the comparison rather than from the
 * normalization, `representative` would satisfy it too.
 *
 * ## Equality alone would be too weak
 *
 * Each core is checked against a written-out literal as well as against the other
 * vendors. Three adapters sharing one defect agree perfectly, and an
 * equality-only test would call that evidence.
 */
import { describe, expect, it } from "vitest";

import { createAdapterRegistry } from "./registry.ts";
import { SUPPORTED_VENDORS } from "./core/vendor.ts";
import { FIXTURE_RECORDING, loadVendorFixture } from "./testing/index.ts";

/** One instant after the pinned recording instant, matching the per-vendor suites. */
const RECEIVED_AT = FIXTURE_RECORDING.instantMs + 250;

/**
 * The canonical core each boundary case must produce, from every dialect.
 *
 * Written out rather than derived from one vendor's output, so the literal is an
 * independent statement of the right answer and not a restatement of whatever
 * vendor A happens to do.
 */
const EXPECTED_CORE = {
  "boundary-empty": {
    connectivity: "unknown",
    batteryPercent: 0,
    position: { frame: "SITE-NORTH", x: -40, y: -40 },
    status: "charging",
    health: { severity: "degraded" },
  },
  "boundary-full": {
    connectivity: "unknown",
    batteryPercent: 100,
    position: { frame: "SITE-NORTH", x: 40, y: 40 },
    status: "idle",
    health: { severity: "nominal" },
  },
} as const;

/** The two recorded cases that pin one physical state across all three dialects. */
const SHARED_STATE_CASES = ["boundary-empty", "boundary-full"] as const;

/** Decodes one vendor's recorded payload through the public dispatch path. */
function decode(
  vendor: (typeof SUPPORTED_VENDORS)[number],
  name: "representative" | "boundary-empty" | "boundary-full",
) {
  const result = createAdapterRegistry().decodeTelemetry(
    vendor,
    loadVendorFixture(vendor, name).payload,
    RECEIVED_AT,
  );
  if (!result.ok) {
    throw new Error(`Vendor ${vendor} rejected its own ${name} fixture.`);
  }
  return result.value;
}

describe.each(SHARED_STATE_CASES)("one physical state in three dialects: %s", (name) => {
  const envelopes = SUPPORTED_VENDORS.map((vendor) => decode(vendor, name));

  it("normalizes to one canonical core", () => {
    // The whole of D7. Deep equality across all three at once rather than pairwise,
    // so a failure names every vendor that disagreed instead of the first pair.
    expect(envelopes.map((envelope) => envelope.core)).toEqual([
      EXPECTED_CORE[name],
      EXPECTED_CORE[name],
      EXPECTED_CORE[name],
    ]);
  });

  it("converts centimetres and metres to the same metre value", () => {
    // Vendor B sends ∓4000 cm where A and C send ∓40 m. Naming the conversion here
    // rather than leaving it inside the deep-equal above is what makes a failure
    // read as "the unit conversion moved" rather than "an object differs".
    expect(envelopes.map((envelope) => envelope.core.position?.x)).toEqual([
      EXPECTED_CORE[name].position.x,
      EXPECTED_CORE[name].position.x,
      EXPECTED_CORE[name].position.x,
    ]);
  });

  it("converts a battery fraction and an integer percent to the same percentage", () => {
    // A and C send 0 or 1 in `[0, 1]`; B sends 0 or 100 already. The two ends are
    // where a fraction-versus-percent mix-up is invisible — 0 maps to 0 either way —
    // so `boundary-full` is the case that actually separates them.
    expect(envelopes.map((envelope) => envelope.core.batteryPercent)).toEqual([
      EXPECTED_CORE[name].batteryPercent,
      EXPECTED_CORE[name].batteryPercent,
      EXPECTED_CORE[name].batteryPercent,
    ]);
  });

  it("resolves a word and a numeric code to the same status", () => {
    // A and C send `"charging"` / `"idle"`; B sends 2 / 0. Two vocabularies, one
    // canonical answer, and no consumer that has to know which vendor it came from.
    expect(envelopes.map((envelope) => envelope.core.status)).toEqual([
      EXPECTED_CORE[name].status,
      EXPECTED_CORE[name].status,
      EXPECTED_CORE[name].status,
    ]);
  });

  it("resolves ISO-8601 and epoch milliseconds to the same instant", () => {
    // A and C send `2025-08-19T10:40:00.000Z`; B sends 1755600000000. The same
    // instant, written two ways, and `reportedAt` is where that has to stop being
    // two things. `parseIsoInstant` exists for this line (ADR 3).
    expect(envelopes.map((envelope) => envelope.reportedAt)).toEqual([
      FIXTURE_RECORDING.instantMs,
      FIXTURE_RECORDING.instantMs,
      FIXTURE_RECORDING.instantMs,
    ]);
  });

  it("still tells the three robots apart", () => {
    // Guards the premise. A registry that routed every payload to one adapter, or
    // three fixtures that were accidentally the same bytes, would satisfy every
    // assertion above — identity is what proves the equality was earned.
    expect(
      envelopes.map((envelope) => [envelope.vendorId, envelope.robotId, envelope.model]),
    ).toEqual([
      ["A", "R-001", "AX-240"],
      ["B", "R-002", "BR-15"],
      ["C", "R-003", "CV-7"],
    ]);
  });

  it("keeps the dialects' real differences in the capability records", () => {
    // The other half of ADR 1: what genuinely differs is still visible, and it is
    // visible *outside* the core. Identical cores would be worthless if they were
    // bought by discarding the lidar and the water tank.
    expect(envelopes.map((envelope) => Object.keys(envelope.capabilities).sort())).toEqual([
      ["dock", "lidarHealth", "sequence"],
      ["dock"],
      ["dock", "sequence", "waterLevel"],
    ]);
  });
});

describe("the control", () => {
  it("does not normalize the representative payloads to one core", () => {
    // Not a defect: those three robots are drawn from the seeded fleet and are in
    // three different states, so a shared core would mean the adapters had stopped
    // reading their payloads. This is what proves the equality above comes from the
    // normalization rather than from the shape of the comparison.
    const cores = SUPPORTED_VENDORS.map((vendor) =>
      JSON.stringify(decode(vendor, "representative").core),
    );

    expect(new Set(cores).size).toBe(SUPPORTED_VENDORS.length);
  });
});
