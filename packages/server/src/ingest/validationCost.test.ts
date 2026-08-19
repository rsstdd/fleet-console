// The validation half of ADR 2's measurement harness, wired to ADR 2's own falsifier.
//
// ADR 2 estimated that Zod validation of a telemetry object costs tens of
// microseconds, and — unusually for a back-of-envelope number — wrote down what
// would prove it wrong: "the harness would have to show validation consuming
// more than 100% of one core at 2,500 msg/s — more than roughly 400 microseconds
// per message." Register D17 asked which of this repository's numbers are real
// gates; ADR 22 kept this one precisely because ADR 2 had already argued it.
//
// WHAT THIS MEASURES, AND WHAT IT DOES NOT. The full harness needs a listening
// server, which does not exist (`packages/server/TODO.md`). Two of the three
// per-message costs do exist and are measured here: parsing a JSON body, and
// strictly decoding a telemetry message. Missing are per-request HTTP overhead
// — ADR 2's competing candidate for the first bottleneck, and the reason the
// throughput row in `README.md` § 10 is still empty — and the vendor schema
// decode, which arrives with the vendor adapters.
//
// The canonical envelope is the strictest and largest telemetry object the
// repository can decode today, so its cost is an upper bound on the vendor
// payload's. If this assertion ever fails, ADR 2's cost argument is dead
// regardless of what the transport turns out to do, and the staged mitigation
// path in ADR 2 § Argument moves to worker-pooled validation.
//
// This is a falsifier, not a ratchet. It is two orders of magnitude above the
// measured cost on purpose: it must not fail because a CI runner was busy, and
// it must never be tightened to track the current number. Tightening it would
// make it the thing ADR 22 refused to ship — a threshold nobody derived.
//
// `process.hrtime.bigint()` rather than `performance.now()`: a monotonic
// duration, not a reading of the time. Test files are exempted from the server's
// wall-clock ban, but the distinction the ban is about (ADR 3) is worth keeping
// on the measuring instrument itself.
import { encodeCanonicalEnvelope, parseCanonicalEnvelope } from "@fleet/contracts";
import type { CanonicalEnvelope } from "@fleet/contracts";
import { describe, expect, it } from "vitest";

/**
 * ADR 2's stated falsification threshold, in microseconds per message.
 *
 * 2,500 messages per second (500 robots at 5 Hz) against one core leaves 400 µs
 * per message. Above that, validation alone consumes a whole core at the
 * console's design scale. Changing this number means changing ADR 2's scale
 * commitment, not tuning a test.
 */
const ADR2_FALSIFICATION_MICROSECONDS = 400;

const BATCHES = 5;
const MESSAGES_PER_BATCH = 500;

function telemetryMessage(): CanonicalEnvelope {
  return {
    schemaVersion: "1",
    robotId: "R-001",
    siteId: "site-a",
    vendorId: "A",
    model: "Carrier 1",
    adapterId: "adapter-a",
    adapterVersion: "1.0.0",
    reportedAt: 1_755_600_000_000,
    receivedAt: 1_755_600_000_010,
    core: {
      connectivity: "online",
      batteryPercent: 74,
      position: { x: 12.5, y: -3.25, frame: "map" },
      status: "busy",
      health: { severity: "nominal" },
    },
    capabilities: {
      sequence: { value: 4_211 },
      dock: { docked: false, dockId: "dock-3" },
      lidarHealth: { severity: "nominal", rpm: 600 },
    },
    freshness: "live",
  };
}

/** Median of the per-message cost of each batch, in microseconds. */
function medianMicrosecondsPerMessage(body: string): number {
  const batchMeans: number[] = [];
  for (let batch = 0; batch < BATCHES; batch += 1) {
    const startedAt = process.hrtime.bigint();
    for (let message = 0; message < MESSAGES_PER_BATCH; message += 1) {
      const decoded = parseCanonicalEnvelope(JSON.parse(body));
      if (!decoded.ok) {
        throw new Error("the measured payload stopped decoding mid-run");
      }
    }
    const elapsedNanoseconds = Number(process.hrtime.bigint() - startedAt);
    batchMeans.push(elapsedNanoseconds / 1_000 / MESSAGES_PER_BATCH);
  }
  return batchMeans.sort((a, b) => a - b)[Math.floor(BATCHES / 2)] ?? Number.NaN;
}

describe("per-message ingest validation cost", () => {
  const body = JSON.stringify(encodeCanonicalEnvelope(telemetryMessage()));

  it("decodes the message it measures, so the measurement is not of a rejection", () => {
    expect(parseCanonicalEnvelope(JSON.parse(body)).ok).toBe(true);
  });

  it("rejects a corrupted message, so the measured decode is doing work", () => {
    // Without this the loop could be timing a schema that accepts anything, and
    // a cheap no-op would pass the budget while asserting nothing (ADR 7).
    const corrupted: unknown = { ...JSON.parse(body), core: null };

    expect(parseCanonicalEnvelope(corrupted).ok).toBe(false);
  });

  it("stays inside ADR 2's falsification threshold of 400 µs per message", async ({ annotate }) => {
    // Warm up first: the first few hundred decodes measure JIT compilation
    // rather than the steady-state cost the 2,500 msg/s estimate is about.
    medianMicrosecondsPerMessage(body);

    const microseconds = medianMicrosecondsPerMessage(body);

    // Reported as well as gated (ADR 22): the annotation puts the measurement in
    // the run output, so the number a reader would want is visible without
    // anyone tightening the threshold to expose it.
    await annotate(
      `${microseconds.toFixed(1)} µs per message ` +
        `(JSON.parse + strict canonical decode; threshold ${String(ADR2_FALSIFICATION_MICROSECONDS)} µs)`,
    );

    expect(microseconds).toBeGreaterThan(0);
    expect(microseconds).toBeLessThan(ADR2_FALSIFICATION_MICROSECONDS);
  });
});
