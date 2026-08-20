/*
 * Process-lifetime health counters.
 *
 * Sequence continuity is **not** here. It moved to `CurrentStateStore` on 20 August 2026
 * (**D6a**), because gaps can only be counted where the previous accepted sequence
 * already lives, and keeping a second copy of that number here would have been the drift
 * Principle 1 forbids. The store serves both scopes ADR 25 defines: per robot, and the
 * per-adapter rollup folded from it.
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

/** Immutable operational health snapshot exposed by the future health endpoint. */
export interface HealthSnapshot {
  readonly malformedIngest: number;
  readonly unsupportedVendors: number;
  readonly adapterFailures: Readonly<Record<string, number>>;
  readonly lateFreshnessTicks: { readonly count: number; readonly lastLatenessMs: number | null };
}

/** Process-lifetime health counters kept separate from robot state. */
export class HealthMetrics {
  #malformedIngest = 0;
  #unsupportedVendors = 0;
  readonly #adapterFailures = new Map<string, number>();
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
      lateFreshnessTicks: { count: this.#lateTickCount, lastLatenessMs: this.#lastLatenessMs },
    };
  }
}
