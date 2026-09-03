// ADR 3's failure mode, measured rather than argued (server TODO **I4**).
//
// The sweep shares an event loop with ingest. Under enough offered load it stops
// firing on time, and a sweep that does not run leaves every robot frozen at its
// last computed freshness — so the console reports stale robots as LIVE. That is a
// correctness bug wearing a latency bug's clothes, which is why ADR 3 §
// Implications names it and why `lateFreshnessTicks` exists at all.
//
// WHAT THIS ASSERTS, AND WHAT IT REPORTS. The assertion is about the **detector**,
// not about the throughput: whatever this machine can be pushed to, a sweep that
// ran late must say so, because ADR 3's stated failure is silence — a sweep that
// silently stops looks exactly like a healthy fleet. The offered load and the
// resulting lateness are reported, not gated: no ADR states a saturation threshold,
// and ADR 22 refuses thresholds nobody derived.
//
// Deliberately concurrent, where `validationCost.test.ts` is deliberately
// sequential. That file asks what one request costs; this one asks what happens
// when more arrive than the loop can serve. They are different questions and a
// single harness answering both would answer neither.
import { createAdapterRegistry, isOk } from "@fleet/adapters";
import { loadVendorFixture } from "@fleet/adapters/testing";
import { describe, expect, it } from "vitest";

import { ADR3_BASELINE_FRESHNESS_POLICY } from "../config/freshnessPolicy.ts";
import { createJsonLogger } from "../observability/logger.ts";
import { startServer, type RunningServer } from "../runServer.ts";
import { systemClock } from "../runtime/clock.ts";

const ROBOTS = 500;
const LOAD_WINDOW_MS = 2_000;

interface LoadOutcome {
  readonly concurrency: number;
  readonly accepted: number;
  readonly requestsPerSecond: number;
  readonly lateTicks: number;
  readonly worstLatenessMs: number | null;
  /** Sweep ticks the window had room for, so lateness has a denominator. */
  readonly expectedTicks: number;
}

/** Builds a roster whose every robot the recorded vendor A payload may be posted for. */
function manifestFor(robotId: string, siteId: string, model: string) {
  return [
    { robotId, siteId, vendorId: "A" as const, model },
    ...Array.from({ length: ROBOTS - 1 }, (_, index) => ({
      robotId: `FILLER-${String(index)}`,
      siteId,
      vendorId: "A" as const,
      model,
    })),
  ];
}

describe("freshness sweep under ingest load", () => {
  const fixture = loadVendorFixture("A");
  const registry = createAdapterRegistry();
  const decoded = registry.decodeTelemetry("A", fixture.payload, 0);
  if (!isOk(decoded)) throw new Error("the recorded vendor A fixture stopped decoding");
  const { robotId, siteId, model } = decoded.value;
  const body = JSON.stringify(fixture.payload);

  async function drive(server: RunningServer, concurrency: number): Promise<LoadOutcome> {
    const url = `http://127.0.0.1:${String(server.port)}/api/telemetry/A`;
    const before = server.health.snapshot().lateFreshnessTicks;
    let accepted = 0;
    const deadline = Date.now() + LOAD_WINDOW_MS;

    // One worker per concurrent slot, each looping until the window closes. Offered
    // load is therefore whatever the loop will take rather than a fixed rate, which
    // is what "saturation" means — a fixed rate would measure the rate.
    const worker = async (): Promise<void> => {
      while (Date.now() < deadline) {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        if (response.status === 204) accepted += 1;
      }
    };
    const startedAt = Date.now();
    await Promise.all(Array.from({ length: concurrency }, worker));
    const elapsedMs = Date.now() - startedAt;

    const after = server.health.snapshot().lateFreshnessTicks;
    return {
      concurrency,
      accepted,
      requestsPerSecond: (accepted / elapsedMs) * 1_000,
      lateTicks: after.count - before.count,
      worstLatenessMs: after.lastLatenessMs,
      expectedTicks: Math.floor(elapsedMs / ADR3_BASELINE_FRESHNESS_POLICY.sweepIntervalMs),
    };
  }

  it("keeps sweeping, or says it did not", async ({ annotate }) => {
    const server = await startServer({
      endpoints: { host: "127.0.0.1", port: 0, allowedOrigins: [] },
      configuration: {
        freshness: ADR3_BASELINE_FRESHNESS_POLICY,
        manifest: {
          sites: [{ siteId, label: "Load site" }],
          robots: manifestFor(robotId, siteId, model),
        },
      },
      // Discarded rather than printed: a late-tick warning per tick would bury the
      // annotation this test exists to produce.
      logger: createJsonLogger(() => undefined),
      clock: systemClock,
    });

    try {
      const outcomes: LoadOutcome[] = [];
      for (const concurrency of [1, 16, 128]) {
        outcomes.push(await drive(server, concurrency));
      }

      await annotate(
        outcomes
          .map(
            (outcome) =>
              `concurrency ${String(outcome.concurrency)}: ` +
              `${outcome.requestsPerSecond.toFixed(0)} req/s, ` +
              `${String(outcome.lateTicks)}/${String(outcome.expectedTicks)} sweep ticks late` +
              (outcome.worstLatenessMs === null
                ? ""
                : ` (worst ${String(outcome.worstLatenessMs)} ms over the ` +
                  `${String(ADR3_BASELINE_FRESHNESS_POLICY.lateTickToleranceMs)} ms tolerance)`),
          )
          .join(" · "),
      );

      for (const outcome of outcomes) {
        // Ingest that rejects is not load, and a run measuring rejections would report
        // a sweep that stayed on time because nothing was happening.
        expect(outcome.accepted).toBeGreaterThan(0);
        // The detector's contract: lateness is either absent or counted. A tick that ran
        // late without incrementing the counter is the silence ADR 3 names as the failure,
        // and `lastLatenessMs` staying null while `count` climbed would be exactly that.
        if (outcome.lateTicks > 0) {
          expect(outcome.worstLatenessMs).not.toBeNull();
          expect(outcome.worstLatenessMs).toBeGreaterThan(
            ADR3_BASELINE_FRESHNESS_POLICY.lateTickToleranceMs,
          );
        }
      }

      // The sweep must still be running after all of it. A saturated loop that killed
      // the interval outright is the worst version of this failure: no lateness is
      // recorded because no tick ever happens again.
      expect(server.sweep.isRunning).toBe(true);
    } finally {
      await server.stop();
    }
  }, 60_000);
});
