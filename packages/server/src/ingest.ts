import { type CanonicalEnvelope, deriveFreshness, withFreshness } from "@fleet/contracts";
import type { AdapterRegistry } from "./adapters/registry.ts";
import type { SupportedVendor } from "./adapters/result.ts";
import type { FreshnessPolicy } from "./config.ts";
import type { DeltaSink } from "./fanout.ts";
import { errorResponse, type ErrorResponse } from "./http/errors.ts";
import type { Clock, Logger } from "./runtime.ts";
import type { CurrentStateStore, UpsertResult } from "./store.ts";

export interface HealthCounterSink {
  noteMalformedIngest(): void;
  noteAdapterFailure(vendor: string): void;
}

export interface IngestDependencies {
  readonly registry: AdapterRegistry;
  readonly store: CurrentStateStore;
  readonly deltas: DeltaSink;
  readonly health: HealthCounterSink;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly policy: FreshnessPolicy;
}

export type IngestOutcome =
  | { readonly ok: true; readonly disposition: UpsertResult["kind"]; readonly robotId: string }
  | { readonly ok: false; readonly response: ErrorResponse };

function isRetainable(raw: unknown): raw is Readonly<Record<string, unknown>> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/** Freshness uses receipt time; retained raw payload never supplies canonical values. */
export function ingestTelemetry(
  dependencies: IngestDependencies,
  vendor: SupportedVendor,
  raw: unknown,
): IngestOutcome {
  const { registry, store, deltas, health, logger, clock, policy } = dependencies;
  const receivedAt = clock.now();

  const decoded = registry.decode(vendor, raw, receivedAt);
  if (!decoded.ok) {
    health.noteMalformedIngest();
    health.noteAdapterFailure(vendor);
    return { ok: false, response: errorResponse(decoded.error.kind, decoded.error.issues) };
  }

  const envelope: CanonicalEnvelope = withFreshness(
    decoded.value,
    deriveFreshness({ receivedAt, now: receivedAt, policy }),
  );
  const sequence = envelope.capabilities.sequence?.value ?? null;

  let result: UpsertResult;
  try {
    result = store.upsert(envelope, isRetainable(raw) ? raw : null, sequence);
  } catch {
    return { ok: false, response: errorResponse("not_found") };
  }

  if (result.kind === "accepted") {
    deltas.mark(envelope.robotId, result.state);
  } else if (result.kind === "out-of-order") {
    logger.log("warn", "telemetry.sequence_regression", {
      robotId: envelope.robotId,
      vendorId: envelope.vendorId,
      acceptedSequence: result.acceptedSequence,
      receivedSequence: result.receivedSequence,
    });
  }

  return { ok: true, disposition: result.kind, robotId: envelope.robotId };
}

export function createHealthCounters(): HealthCounterSink & {
  snapshot(): {
    readonly malformedIngest: number;
    readonly unsupportedVendors: number;
    readonly adapterFailures: Readonly<Record<string, number>>;
    readonly lateFreshnessTicks: { readonly count: number; readonly lastLatenessMs: number | null };
  };
  noteUnsupportedVendor(): void;
  noteLateFreshnessTick(latenessMs: number): void;
} {
  let malformedIngest = 0;
  let unsupportedVendors = 0;
  let lateCount = 0;
  let lastLatenessMs: number | null = null;
  const adapterFailures = new Map<string, number>();

  return {
    noteMalformedIngest: () => {
      malformedIngest += 1;
    },
    noteUnsupportedVendor: () => {
      unsupportedVendors += 1;
    },
    noteAdapterFailure: (vendor) => {
      adapterFailures.set(vendor, (adapterFailures.get(vendor) ?? 0) + 1);
    },
    noteLateFreshnessTick: (latenessMs) => {
      lateCount += 1;
      lastLatenessMs = latenessMs;
    },
    snapshot: () => ({
      malformedIngest,
      unsupportedVendors,
      adapterFailures: Object.fromEntries(adapterFailures),
      lateFreshnessTicks: { count: lateCount, lastLatenessMs },
    }),
  };
}
