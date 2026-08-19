/*
 * Process-lifetime health counters.
 *
 * Coupling: the unknown-field counts this endpoint also serves are **not** kept
 * here. They live in `packages/adapters`' `UnknownFieldLedger`, whose snapshot
 * carries `scope: "accepted"` — it counts only payloads a vendor schema
 * accepted (ADR 15). `malformedIngest` below is the counter for the other
 * population, and the two answer different questions: "is this vendor sending
 * something new?" against "is this vendor broken?".
 *
 * They must never be summed or presented as one number. A vendor that changes
 * shape in two ways at once — a new field *and* a changed type — is rejected
 * before the ledger sees it, so its unknown-field count stays flat while
 * `malformedIngest` climbs. That pairing is the signal; a total would erase it.
 *
 * When the health endpoint lands, serve the ledger under a scope-named key
 * (`unknownFields.accepted`) so the rejected-payload tally ADR 15 leaves open
 * can be added beside it rather than renaming what consumers already read.
 *
 * The response shape itself is `healthResponseSchema` in `@fleet/contracts`
 * (ADR 25). This class accumulates; it does not serialize, and it must not grow a
 * second opinion about what the wire looks like.
 */

import type { SequenceHealth } from "@fleet/contracts";

/** Reliable-sequence observation recorded by health metrics. */
export type SequenceObservation = "gap" | "duplicate" | "not-evaluated";

/** Immutable operational health snapshot exposed by the future health endpoint. */
export interface HealthSnapshot {
  readonly malformedIngest: number;
  readonly unsupportedVendors: number;
  readonly adapterFailures: Readonly<Record<string, number>>;
  /**
   * Per-adapter sequence continuity, in the contract's own representation.
   *
   * Imported from `@fleet/contracts` rather than declared here (ADR 25). This type
   * used to be a local structural twin, which is how "not evaluated" came to have
   * two spellings in this repository — the console's was `number | null`. One
   * declaration is what makes the server, the wire and the console agree by
   * construction rather than by review (Principle 1).
   *
   * Adapter scope, not robot scope. The per-robot answer travels on
   * `robotDiagnosticEnvelopeSchema`; these two must never be summed or
   * substituted for one another.
   */
  readonly sequence: Readonly<Record<string, SequenceHealth>>;
  readonly lateFreshnessTicks: { readonly count: number; readonly lastLatenessMs: number | null };
}

/** Process-lifetime health counters kept separate from robot state. */
export class HealthMetrics {
  #malformedIngest = 0;
  #unsupportedVendors = 0;
  readonly #adapterFailures = new Map<string, number>();
  readonly #sequence = new Map<string, SequenceHealth>();
  #lateTickCount = 0;
  #lastLatenessMs: number | null = null;

  /** Counts one rejected malformed request. */
  noteMalformedIngest(): void {
    this.#malformedIngest += 1;
  }

  /** Counts one request for an unsupported vendor. */
  noteUnsupportedVendor(): void {
    this.#unsupportedVendors += 1;
  }

  /** Counts one adapter failure at adapter/vendor scope. */
  noteAdapterFailure(adapterId: string): void {
    this.#adapterFailures.set(adapterId, (this.#adapterFailures.get(adapterId) ?? 0) + 1);
  }

  /** Records sequence evaluation without representing not-evaluated as zero gaps. */
  noteSequence(adapterId: string, observation: SequenceObservation): void {
    if (observation === "not-evaluated") {
      this.#sequence.set(adapterId, { evaluated: false });
      return;
    }
    const prior = this.#sequence.get(adapterId);
    const evaluated =
      prior?.evaluated === true ? prior : { evaluated: true as const, gaps: 0, duplicates: 0 };
    this.#sequence.set(adapterId, {
      evaluated: true,
      gaps: evaluated.gaps + (observation === "gap" ? 1 : 0),
      duplicates: evaluated.duplicates + (observation === "duplicate" ? 1 : 0),
    });
  }

  /** Counts a late freshness tick and retains its most recent lateness. */
  noteLateFreshnessTick(latenessMs: number): void {
    this.#lateTickCount += 1;
    this.#lastLatenessMs = latenessMs;
  }

  /** Returns a detached immutable-shape snapshot of current counters. */
  snapshot(): HealthSnapshot {
    return {
      malformedIngest: this.#malformedIngest,
      unsupportedVendors: this.#unsupportedVendors,
      adapterFailures: Object.fromEntries(this.#adapterFailures),
      sequence: Object.fromEntries(this.#sequence),
      lateFreshnessTicks: { count: this.#lateTickCount, lastLatenessMs: this.#lastLatenessMs },
    };
  }
}
