/**
 * The set of robots changed since the last WebSocket flush, coalesced per robot.
 *
 * ADR 2 decides fan-out sends changed robots only — never a full snapshot — flushed at
 * no more than 10 Hz, with multiple changes to one robot between flushes collapsing to
 * its latest canonical state. This structure is that collapse, kept framework-independent
 * so it can be unit-tested without opening a socket (AGENTS.md § Tests).
 *
 * Coupling: ADR 3 requires a freshness-only transition to enter this set even though no
 * telemetry field moved. That is why `mark` takes whatever the current state is rather
 * than a diff — the caller decides what changed, and the sweep is one of the callers.
 * If this class ever starts comparing states to decide whether a change is real, the
 * freshness-only case is the one it will get wrong.
 */
export class PendingDeltaSet<TState> {
  readonly #pending = new Map<string, TState>();

  /** Records a robot's latest state for the next flush, replacing any earlier entry. */
  mark(robotId: string, state: TState): void {
    this.#pending.set(robotId, state);
  }

  /** How many distinct robots would be sent if the set were flushed now. */
  get size(): number {
    return this.#pending.size;
  }

  /** Whether nothing has changed since the last flush, so the flush can be skipped. */
  get isEmpty(): boolean {
    return this.#pending.size === 0;
  }

  /** Whether this robot is already awaiting a flush. */
  has(robotId: string): boolean {
    return this.#pending.has(robotId);
  }

  /** Returns the pending entries and empties the set, so a flush cannot send twice. */
  drain(): Map<string, TState> {
    const drained = new Map(this.#pending);
    this.#pending.clear();
    return drained;
  }

  /** Discards pending entries without sending them; for shutdown, not for flushing. */
  clear(): void {
    this.#pending.clear();
  }
}
