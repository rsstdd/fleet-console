import { beforeEach, describe, expect, it } from "vitest";

import { createAdapterRegistry, isOk, SUPPORTED_VENDORS } from "@fleet/adapters";
import { loadMalformedPayload, loadVendorFixture } from "@fleet/adapters/testing";
import type { CanonicalEnvelope } from "@fleet/contracts";

import { ADR3_BASELINE_FRESHNESS_POLICY } from "../config/freshnessPolicy.ts";
import { PendingDeltaSet } from "../fanout/pendingDeltas.ts";
import { HealthMetrics } from "../health/healthMetrics.ts";
import { manualClock } from "../runtime/clock.ts";
import { CurrentStateStore, type ManifestRobot } from "../state/currentStateStore.ts";
import { ingestTelemetry, type IngestDependencies } from "./ingestTelemetry.ts";

/**
 * Ingest against the same recorded bytes the adapter contract tests use, reached through
 * `@fleet/adapters/testing` under the ADR 11 test-file exception.
 *
 * That import is also the standing proof the exception is configured: if the narrowed
 * `no-restricted-imports` override were wrong, this file would fail to lint rather than
 * fail to pass, which is the half that had no fixture when the rule landed.
 */
describe("ingestTelemetry", () => {
  const RECEIVED_AT = 1_755_600_000_500;

  /**
   * The manifest, derived from the fixtures rather than restated.
   *
   * ADR 14 makes the committed roster and the recorded payloads two views of one seeded
   * fleet, so hardcoding ids here would work today and drift the next time fixtures are
   * re-recorded (ADR 13). Decoding once to learn the identity keeps the test honest about
   * where that agreement comes from.
   */
  function manifestFromFixtures(): ManifestRobot[] {
    const registry = createAdapterRegistry();
    return SUPPORTED_VENDORS.map((vendor) => {
      const decoded = registry.decodeTelemetry(vendor, loadVendorFixture(vendor).payload, 0);
      if (!isOk(decoded)) throw new Error(`Recorded ${vendor} fixture no longer decodes.`);
      const { robotId, siteId, vendorId, model } = decoded.value;
      return { robotId, siteId, vendorId, model };
    });
  }

  let dependencies: IngestDependencies;
  /** The concrete set behind `dependencies.deltas`, which the interface deliberately hides. */
  let deltas: PendingDeltaSet<CanonicalEnvelope>;
  let clock: ReturnType<typeof manualClock>;

  beforeEach(() => {
    clock = manualClock(RECEIVED_AT);
    deltas = new PendingDeltaSet<CanonicalEnvelope>();
    dependencies = {
      registry: createAdapterRegistry(),
      store: new CurrentStateStore(manifestFromFixtures()),
      deltas,
      health: new HealthMetrics(),
      clock,
      policy: ADR3_BASELINE_FRESHNESS_POLICY,
    };
  });

  function ingest(vendor: (typeof SUPPORTED_VENDORS)[number]): ReturnType<typeof ingestTelemetry> {
    return ingestTelemetry(dependencies, vendor, loadVendorFixture(vendor).payload);
  }

  it("accepts every vendor's recorded payload and stamps server receipt time", () => {
    for (const vendor of SUPPORTED_VENDORS) {
      const outcome = ingest(vendor);

      expect(outcome).toMatchObject({ ok: true, disposition: "accepted" });
    }

    for (const state of dependencies.store.observed()) {
      // D2: receipt time is the server's, never the vendor's report time, and the two are
      // independent by ADR 3 § Decision rather than by coincidence.
      expect(state.receivedAt).toBe(RECEIVED_AT);
      expect(state.reportedAt).not.toBe(RECEIVED_AT);
      expect(state.freshness).toBe("live");
    }
  });

  it("marks an accepted reading for fan-out and a duplicate not at all", () => {
    ingest("A");
    expect(deltas.size).toBe(1);
    deltas.drain();

    // The same payload again: the sequence has not advanced, so stored state is unchanged
    // and a delta would flush a frame that says nothing.
    const repeat = ingest("A");

    expect(repeat).toMatchObject({ ok: true, disposition: "duplicate" });
    expect(deltas.isEmpty).toBe(true);
  });

  it("records vendor B as sequence-not-evaluated rather than as zero gaps", () => {
    // D6: B's dialect carries no counter, and "0 gaps" for it is a false statement to an
    // operator (ADR 1 § Implications). Continuity is counted in the store (**D6a**), where
    // the previous accepted sequence lives, so this reads it from there.
    const robotId = ingest("B").ok ? dependencies.store.observed()[0]?.robotId : undefined;

    expect(dependencies.store.sequenceHealth(robotId ?? "")).toStrictEqual({ evaluated: false });
  });

  it("rejects a malformed payload with the adapter's own issues, and counts it", () => {
    const malformed = loadMalformedPayload("A", "wrong-type");

    const outcome = ingestTelemetry(dependencies, "A", malformed.payload);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.response.status).toBe(400);
    // ADR 20: the issues are the adapter's, copied rather than re-derived here.
    expect(outcome.response.body.error.issues.length).toBeGreaterThan(0);
    expect(dependencies.health.snapshot().malformedIngest).toBe(1);
    expect(dependencies.store.observed()).toHaveLength(0);
  });

  it("counts unknown fields on the registry's ledger, not per robot", () => {
    // D8/ADR 15: vendor C's `telemetry.firmware_channel` is undocumented and must move the
    // adapter-scoped tally rather than be dropped.
    ingest("C");

    const tally = dependencies.registry.unknownFields();
    // `scope` is "accepted" — the population counted is fields on payloads the schema
    // accepted (ADR 15). The per-adapter keying is `byAdapter` itself.
    expect(tally.scope).toBe("accepted");
    expect(tally.byAdapter.C.total).toBeGreaterThan(0);
    expect(Object.keys(tally.byAdapter.C.fields)).toContain("telemetry.firmware_channel");
    // Vendor A was not ingested here, so its tally must not move: the counter is per
    // adapter, and a shared one would be a fleet-wide number pretending to be specific.
    expect(tally.byAdapter.A.total).toBe(0);
  });

  it("refuses telemetry for a robot the manifest never registered", () => {
    // ADR 14 makes the roster the authority. A simulator aimed at a stale manifest
    // produces exactly this, and it is an operator condition rather than a server fault.
    const bare = { ...dependencies, store: new CurrentStateStore([manifestFromFixtures()[1]!]) };

    const outcome = ingestTelemetry(bare, "A", loadVendorFixture("A").payload);

    expect(outcome).toMatchObject({ ok: false, response: { status: 404 } });
  });
});
