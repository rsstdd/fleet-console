/**
 * Counters and the periodic summary.
 *
 * The names below are the stable vocabulary AGENTS.md § Performance and
 * observability requires. The distinction that earns its keep is
 * `readingsAttempted` against `requestsSent` against `sendSucceeded`: if the
 * three diverge, the simulator is underproducing, retrying, or being rejected,
 * and a measurement that reported only one of them could not tell those apart
 * (Principle 12).
 */
import type { MonotonicClock } from "../runtime/clock.ts";
import type { VendorId } from "../fleet/simulatedRobot.ts";

/** A point-in-time reading of every counter, plus rates derived from the monotonic clock. */
export interface MetricsSnapshot {
  readonly uptimeMs: number;
  readonly configuredRobots: number;
  readonly configuredHz: number;
  readonly activeRobots: number;
  readonly droppedRobots: number;
  /** Readings the scheduler decided were due. */
  readonly readingsAttempted: number;
  /** First-attempt HTTP requests; equals `readingsAttempted` minus what backpressure shed. */
  readonly requestsSent: number;
  /** Retry attempts, counted apart so a retry storm cannot masquerade as throughput. */
  readonly retriesSent: number;
  readonly sendSucceeded: number;
  /** 4xx — the server rejected the payload. Never retried. */
  readonly sendRejected: number;
  /** 5xx — the server failed. Retryable. */
  readonly serverFailed: number;
  readonly timedOut: number;
  readonly networkFailed: number;
  /** Requests abandoned because the shutdown deadline passed. */
  readonly cancelled: number;
  /** Per-robot ticks skipped because an earlier one was still in flight. */
  readonly skippedOverdue: number;
  /** Ticks the scheduler coalesced because it woke late by more than one interval. */
  readonly coalescedOverdue: number;
  readonly inFlight: number;
  readonly peakInFlight: number;
  /** Readings per second achieved, measured against monotonic elapsed time. */
  readonly achievedReadingsPerSecond: number;
  readonly achievedRequestsPerSecond: number;
  readonly byVendor: Readonly<Record<VendorId, number>>;
}

/** Mutable counter set for one simulator run. */
export interface SimulatorMetrics {
  readonly recordReadingAttempted: (vendor: VendorId) => void;
  readonly recordRequestSent: () => void;
  readonly recordRetrySent: () => void;
  readonly recordSuccess: () => void;
  readonly recordRejected: () => void;
  readonly recordServerFailure: () => void;
  readonly recordTimeout: () => void;
  readonly recordNetworkFailure: () => void;
  readonly recordCancelled: () => void;
  readonly recordSkippedOverdue: (count: number) => void;
  readonly recordCoalescedOverdue: (count: number) => void;
  readonly setInFlight: (count: number) => void;
  readonly snapshot: () => MetricsSnapshot;
}

/** Fixed run facts a snapshot repeats so a summary line is self-contained. */
export interface MetricsContext {
  readonly configuredRobots: number;
  readonly configuredHz: number;
  readonly activeRobots: number;
  readonly droppedRobots: number;
}

/**
 * Creates the counter set.
 *
 * Rates are computed from the injected monotonic clock rather than from the
 * configured rate, because the whole purpose of the number is to show when the
 * two disagree.
 */
export function createMetrics(
  context: MetricsContext,
  monotonic: MonotonicClock,
): SimulatorMetrics {
  const startedAt = monotonic.elapsed();
  const byVendor: Record<VendorId, number> = { A: 0, B: 0, C: 0 };

  let readingsAttempted = 0;
  let requestsSent = 0;
  let retriesSent = 0;
  let sendSucceeded = 0;
  let sendRejected = 0;
  let serverFailed = 0;
  let timedOut = 0;
  let networkFailed = 0;
  let cancelled = 0;
  let skippedOverdue = 0;
  let coalescedOverdue = 0;
  let inFlight = 0;
  let peakInFlight = 0;

  return {
    recordReadingAttempted(vendor: VendorId): void {
      readingsAttempted += 1;
      byVendor[vendor] += 1;
    },
    recordRequestSent(): void {
      requestsSent += 1;
    },
    recordRetrySent(): void {
      retriesSent += 1;
    },
    recordSuccess(): void {
      sendSucceeded += 1;
    },
    recordRejected(): void {
      sendRejected += 1;
    },
    recordServerFailure(): void {
      serverFailed += 1;
    },
    recordTimeout(): void {
      timedOut += 1;
    },
    recordNetworkFailure(): void {
      networkFailed += 1;
    },
    recordCancelled(): void {
      cancelled += 1;
    },
    recordSkippedOverdue(count: number): void {
      skippedOverdue += count;
    },
    recordCoalescedOverdue(count: number): void {
      coalescedOverdue += count;
    },
    setInFlight(count: number): void {
      inFlight = count;
      if (count > peakInFlight) {
        peakInFlight = count;
      }
    },
    snapshot(): MetricsSnapshot {
      const uptimeMs = monotonic.elapsed() - startedAt;
      const seconds = uptimeMs / 1000;
      const perSecond = (total: number): number =>
        seconds > 0 ? Math.round((total / seconds) * 100) / 100 : 0;

      return {
        uptimeMs: Math.round(uptimeMs),
        ...context,
        readingsAttempted,
        requestsSent,
        retriesSent,
        sendSucceeded,
        sendRejected,
        serverFailed,
        timedOut,
        networkFailed,
        cancelled,
        skippedOverdue,
        coalescedOverdue,
        inFlight,
        peakInFlight,
        achievedReadingsPerSecond: perSecond(readingsAttempted),
        achievedRequestsPerSecond: perSecond(requestsSent + retriesSent),
        byVendor: { ...byVendor },
      };
    },
  };
}
