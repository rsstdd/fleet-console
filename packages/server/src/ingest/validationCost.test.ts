// The validation half of ADR 2's measurement harness, wired to ADR 2's own falsifier.
//
// ADR 2 estimated that Zod validation of a telemetry object costs tens of
// microseconds, and — unusually for a back-of-envelope number — wrote down what
// would prove it wrong: "the harness would have to show validation consuming
// more than 100% of one core at 2,500 msg/s — more than roughly 400 microseconds
// per message." Register D17 asked which of this repository's numbers are real
// gates; ADR 22 kept this one precisely because ADR 2 had already argued it.
//
// WHAT THIS MEASURES. Both halves of ADR 2's question, as of 20 August 2026. The
// first `describe` costs a JSON parse plus a strict canonical decode, against
// ADR 2's own 400 µs falsifier. The second costs a whole request through the
// listening server — route, size cap, parse, vendor decode, upsert — at two
// roster sizes, which is ADR 2's competing candidate for the first bottleneck
// and the reason `README.md` § 10's throughput row was empty.
//
// The second half is REPORT-ONLY, deliberately. ADR 2 states a falsifier for
// validation and none for transport, and ADR 22 refused to ship a threshold
// nobody derived. Inventing one here to make the harness look symmetrical is
// exactly that. It asserts only what it can defend: that every request was
// accepted, and that the cost is a real number.
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
import { createAdapterRegistry, isOk } from "@fleet/adapters";
import { loadVendorFixture } from "@fleet/adapters/testing";
import { encodeCanonicalEnvelope, parseCanonicalEnvelope, SCHEMA_VERSION } from "@fleet/contracts";
import type { CanonicalEnvelope } from "@fleet/contracts";
import { describe, expect, it } from "vitest";

import { ADR3_BASELINE_FRESHNESS_POLICY } from "../config/freshnessPolicy.ts";
import { createJsonLogger } from "../observability/logger.ts";
import { startServer } from "../runServer.ts";
import { systemClock } from "../runtime/clock.ts";

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
    schemaVersion: SCHEMA_VERSION,
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

/**
 * The transport half: what a whole request costs through the listening server.
 *
 * Recorded vendor payloads rather than a synthesized body, reached through
 * `@fleet/adapters/testing` under the ADR 11 test-file exception. A hand-written
 * approximation would measure a shape no vendor sends and would drift from the
 * producer without anything failing (ADR 13).
 *
 * Sequential rather than concurrent, on purpose. ADR 2 wants per-request overhead
 * attributed, and a concurrent flood measures queueing — the event loop's response to
 * offered load — rather than the cost of one request. Saturation behaviour is **I4**,
 * and it is a different question with a different answer.
 */
describe("per-request ingest transport cost", () => {
  const REQUESTS = 300;

  async function measureAt(robotCount: number): Promise<{
    readonly microsecondsPerRequest: number;
    readonly accepted: number;
  }> {
    const fixture = loadVendorFixture("A");
    const registry = createAdapterRegistry();
    const identity = registry.decodeTelemetry("A", fixture.payload, 0);
    if (!isOk(identity)) throw new Error("the recorded vendor A fixture stopped decoding");

    // One real robot plus filler, so the store is at the measured size while every
    // request targets a robot the manifest registered. `vendorId` is the literal the
    // route posts to rather than the envelope's open identifier, because the manifest
    // schema narrows it to the supported set (ADR 14).
    const manifest = [
      {
        robotId: identity.value.robotId,
        siteId: identity.value.siteId,
        vendorId: "A" as const,
        model: identity.value.model,
      },
      ...Array.from({ length: robotCount - 1 }, (_, index) => ({
        robotId: `FILLER-${String(index)}`,
        siteId: identity.value.siteId,
        vendorId: "A" as const,
        model: identity.value.model,
      })),
    ];

    const server = await startServer({
      endpoints: { host: "127.0.0.1", port: 0, allowedOrigins: [] },
      configuration: {
        freshness: ADR3_BASELINE_FRESHNESS_POLICY,
        manifest: {
          sites: [{ siteId: identity.value.siteId, label: "Load site" }],
          robots: manifest,
        },
      },
      logger: createJsonLogger(() => undefined),
      clock: systemClock,
    });

    const url = `http://127.0.0.1:${String(server.port)}/api/telemetry/A`;
    const body = JSON.stringify(fixture.payload);
    const post = (): Promise<Response> =>
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });

    try {
      // Warm up: the first requests measure JIT and connection setup rather than the
      // steady state the 2,500 msg/s estimate is about.
      for (let index = 0; index < 50; index += 1) await post();

      let accepted = 0;
      const startedAt = process.hrtime.bigint();
      for (let index = 0; index < REQUESTS; index += 1) {
        const response = await post();
        if (response.status === 204) accepted += 1;
      }
      const elapsedNanoseconds = Number(process.hrtime.bigint() - startedAt);
      return { microsecondsPerRequest: elapsedNanoseconds / 1_000 / REQUESTS, accepted };
    } finally {
      await server.stop();
    }
  }

  it("measures a whole request at 50 and 500 robots", async ({ annotate }) => {
    const small = await measureAt(50);
    const large = await measureAt(500);

    await annotate(
      `${small.microsecondsPerRequest.toFixed(0)} µs/request at 50 robots, ` +
        `${large.microsecondsPerRequest.toFixed(0)} µs/request at 500 — whole request: route, ` +
        `size cap, JSON.parse, vendor decode, upsert. Report-only: ADR 2 states no transport ` +
        `threshold and ADR 22 refuses undefended ones.`,
    );

    // Every request accepted, or the number above is the cost of rejecting rather than
    // the cost of ingesting.
    expect(small.accepted).toBe(REQUESTS);
    expect(large.accepted).toBe(REQUESTS);
    expect(small.microsecondsPerRequest).toBeGreaterThan(0);
    expect(large.microsecondsPerRequest).toBeGreaterThan(0);
  }, 60_000);
});
