/**
 * A fixed-size, per-robot history buffer that overwrites its oldest entry once full.
 *
 * ADR 6 decides history is bounded and in memory, sized to what a decimated sparkline
 * consumes — tens of points, not hundreds — and its open question asks whether the
 * structure is an array with a write cursor or a deque. This is the array-with-cursor
 * answer: one allocation at construction and no allocation per write, which matters at
 * the 500-robot, 5 Hz workload ADR 2 measures against. Coupling: the sizing decision
 * is recorded in ADR 6's Observed consequences and exposed by CurrentStateStore as
 * HISTORY_CAPACITY; the generic structure itself remains independently reusable.
 *
 * `T` must not include `undefined`; the buffer uses absence of a value to mean an
 * unwritten slot.
 */
export class RingBuffer<T> {
  /** The fixed number of entries retained; writes past it overwrite the oldest. */
  readonly capacity: number;

  readonly #slots: (T | undefined)[];
  #cursor = 0;
  #count = 0;

  /** Creates an empty buffer holding at most `capacity` entries. */
  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(
        `Ring buffer capacity must be a positive integer, received ${String(capacity)}`,
      );
    }
    this.capacity = capacity;
    this.#slots = new Array<T | undefined>(capacity).fill(undefined);
  }

  /** How many entries the buffer currently holds, never more than its capacity. */
  get size(): number {
    return this.#count;
  }

  /** Whether the buffer has reached capacity and is now overwriting its oldest entry. */
  get isFull(): boolean {
    return this.#count === this.capacity;
  }

  /** Appends one entry, discarding the oldest if the buffer is already full. */
  push(value: T): void {
    this.#slots[this.#cursor] = value;
    this.#cursor = (this.#cursor + 1) % this.capacity;
    if (this.#count < this.capacity) this.#count += 1;
  }

  /** Returns the retained entries oldest-first; the buffer is unchanged. */
  toArray(): T[] {
    const start = (this.#cursor - this.#count + this.capacity) % this.capacity;
    const entries: T[] = [];
    for (let offset = 0; offset < this.#count; offset += 1) {
      const value = this.#slots[(start + offset) % this.capacity];
      if (value !== undefined) entries.push(value);
    }
    return entries;
  }

  /** Returns the most recently pushed entry, or `undefined` if nothing has been pushed. */
  last(): T | undefined {
    if (this.#count === 0) return undefined;
    return this.#slots[(this.#cursor - 1 + this.capacity) % this.capacity];
  }

  /** Drops every retained entry, keeping the allocated capacity. */
  clear(): void {
    this.#slots.fill(undefined);
    this.#cursor = 0;
    this.#count = 0;
  }
}
