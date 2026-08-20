import type { UnknownFieldSnapshot } from "@fleet/adapters";
import { SUPPORTED_VENDORS } from "@fleet/adapters";
import { type HealthResponse, SCHEMA_VERSION, type SequenceHealth } from "@fleet/contracts";

import type { HealthSnapshot } from "../health/healthMetrics.ts";

/**
 * The `GET /api/health` body: three counters at three different scopes, joined without
 * being confused for one another.
 *
 * `byAdapter` is keyed by **vendor id** (`A`), settling ADR 30's open question about the
 * identifier space. The registry's ledger is already `Record<SupportedVendor, …>`, so the
 * decision was effectively taken when that type shipped; keying anything else here would
 * make the handler re-key one of its own sources, which is where a display id and a
 * counting id start to disagree.
 *
 * `malformedIngest` and the unknown-field totals must **never be summed**. Their pairing
 * is the signal: a vendor that breaks and changes shape at once shows a flat ledger and a
 * climbing malformed count, and a total erases exactly that (ADR 15). They are separate
 * fields here for that reason and not for tidiness.
 *
 * The scope travels as data (`unknownFieldScope`), so the console renders its caveat from
 * the value rather than from a caption that can go stale (ADR 25).
 */

/** Everything the health body joins, each from the component that actually counts it. */
export interface HealthResponseInput {
  readonly metrics: HealthSnapshot;
  /** The registry's process-wide ledger; per adapter, never per robot (ADR 15). */
  readonly unknownFields: UnknownFieldSnapshot;
  /** Per-dialect continuity, folded from per-robot values by the store (**D6a**). */
  readonly sequenceByVendor: Readonly<Record<string, SequenceHealth>>;
  readonly capturedAt: number;
}

/** Builds the health body for the current process. */
export function encodeHealthResponse(input: HealthResponseInput): HealthResponse {
  const byAdapter: HealthResponse["byAdapter"] = {};
  for (const vendor of SUPPORTED_VENDORS) {
    byAdapter[vendor] = {
      failures: input.metrics.adapterFailures[vendor] ?? 0,
      unknownFields: input.unknownFields.byAdapter[vendor],
      // A vendor no robot has reported for has nothing to evaluate yet. `{ evaluated:
      // false }` says that without claiming the zero gaps a `{ evaluated: true, gaps: 0 }`
      // would assert — a measurement nobody made (ADR 25).
      sequence: input.sequenceByVendor[vendor] ?? { evaluated: false },
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: input.capturedAt,
    malformedIngest: input.metrics.malformedIngest,
    unsupportedVendors: input.metrics.unsupportedVendors,
    unknownFieldScope: input.unknownFields.scope,
    byAdapter,
    lateFreshnessTicks: input.metrics.lateFreshnessTicks,
  };
}
