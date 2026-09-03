import type { AdapterRegistry, SupportedVendor } from "@fleet/adapters";
import { isOk } from "@fleet/adapters";
import { type CanonicalEnvelope, deriveFreshness, withFreshness } from "@fleet/contracts";

import type { FreshnessPolicy } from "../config/freshnessPolicy.ts";
import type { DeltaSink } from "../fanout/pendingDeltas.ts";
import type { HealthMetrics } from "../health/healthMetrics.ts";
import type { Logger } from "../observability/logger.ts";
import type { Clock } from "../runtime/clock.ts";
import type { CurrentStateStore, UpsertResult } from "../state/currentStateStore.ts";
import {
  type ErrorResponse,
  errorResponse,
  errorResponseForAdapterError,
} from "./errorResponse.ts";

/**
 * One reading, from untrusted bytes to fleet state.
 *
 * The whole ingest transition, framework-independent, so the route handler is transport
 * in and a decoded value out and cannot grow a second authority over what a reading means
 * (**D9**, Principle 1). Every ordering rule this function carries is a rule about
 * correctness rather than style, and each is noted where it happens.
 */

/** Everything the transition reads or writes; all injected, none constructed here. */
export interface IngestDependencies {
  readonly registry: AdapterRegistry;
  readonly store: CurrentStateStore;
  readonly deltas: DeltaSink<CanonicalEnvelope>;
  readonly health: HealthMetrics;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly policy: FreshnessPolicy;
}

/** What one reading did, or why it was refused. */
export type IngestOutcome =
  | { readonly ok: true; readonly disposition: UpsertResult["kind"]; readonly robotId: string }
  | { readonly ok: false; readonly response: ErrorResponse };

/**
 * Whether an accepted payload is the object shape the store retains.
 *
 * A predicate rather than a cast: `no-unsafe-type-assertion` rejects the cast, and it is
 * right to — the store keeps this bytes-for-bytes as technician evidence (ADR 26), so the
 * one place its shape is decided should be a test the compiler understands.
 */
function isRetainable(raw: unknown): raw is Readonly<Record<string, unknown>> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/**
 * Decodes one vendor payload and applies it to fleet state.
 *
 * The order below is the contract:
 *
 * 1. `receivedAt` is stamped from the injected clock **before** dispatch and passed in
 *    explicitly (**D2**). It is never the vendor's `reportedAt`: the sweep reads receipt
 *    time and the operator's "last seen" reads report time, and ADR 3 § Decision makes
 *    their independence an invariant rather than a coincidence.
 * 2. The registry decodes (**D3**). A malformed payload is a counted rejection carrying
 *    the adapter's own issues, never a coercion (**D4**, ADR 20).
 * 3. `withFreshness` completes the pre-freshness envelope (ADR 10). `now` is `receivedAt`
 *    rather than a second clock read, so a reading cannot be born a microsecond stale.
 * 4. The store applies it idempotently (**D5**) and retains the raw payload for the
 *    technician endpoint alone (**D7**, ADR 26).
 *
 * Unknown fields need no step here: the registry owns one process ledger and counts them
 * as it decodes (**D8**, ADR 15).
 */
export function ingestTelemetry(
  dependencies: IngestDependencies,
  vendor: SupportedVendor,
  raw: unknown,
): IngestOutcome {
  const { registry, store, deltas, health, logger, clock, policy } = dependencies;

  const receivedAt = clock.now();
  const decoded = registry.decodeTelemetry(vendor, raw, receivedAt);

  if (!isOk(decoded)) {
    health.noteMalformedIngest();
    health.noteAdapterFailure(vendor);
    return { ok: false, response: errorResponseForAdapterError(decoded.error) };
  }

  const envelope = withFreshness(
    decoded.value,
    deriveFreshness({ receivedAt, now: receivedAt, policy }),
  );

  // `null` means "this dialect has no counter" — vendor B — and not "no reading yet". The
  // store turns that into `{ evaluated: false }` rather than zero gaps, which would be a
  // false statement to an operator (ADR 1 § Implications, **D6**). Continuity itself is
  // counted in the store, where the previous accepted sequence already lives (**D6a**).
  const sequence = envelope.capabilities.sequence?.value ?? null;

  let result: UpsertResult;
  try {
    result = store.upsert(envelope, isRetainable(raw) ? raw : null, sequence);
  } catch {
    // The store throws for a robot the manifest never registered, and for telemetry whose
    // vendor or site disagrees with it. Both are operator conditions rather than server
    // faults — a simulator aimed at a stale roster produces exactly this — so they are a
    // 404 rather than a 500, and the message says nothing derived from the payload (**G6**).
    return { ok: false, response: errorResponse("not_found") };
  }

  // Only an accepted reading is a change worth sending. A duplicate or a regression left
  // stored state alone, and marking it would flush a frame that says nothing.
  if (result.kind === "accepted") {
    deltas.mark(envelope.robotId, result.state);
  } else if (result.kind === "out-of-order") {
    // The store returns both values because it alone owns accepted ordering; this layer
    // adds canonical identity and the server receipt time, then emits no payload or
    // vendor-supplied prose. Regressions remain distinct from every health counter.
    logger.log("warn", "telemetry.sequence_regression", {
      robotId: envelope.robotId,
      vendorId: envelope.vendorId,
      adapterId: envelope.adapterId,
      acceptedSequence: result.acceptedSequence,
      receivedSequence: result.receivedSequence,
      receivedAt,
    });
  }

  return { ok: true, disposition: result.kind, robotId: envelope.robotId };
}
