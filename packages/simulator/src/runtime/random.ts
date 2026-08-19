/**
 * The simulator's seeded pseudo-random source.
 *
 * A named local implementation rather than a dependency: the requirement is
 * reproducibility, not statistical quality, and the algorithm is nine lines
 * (TODO § 2, "do not add a random-number package when a small local
 * implementation suffices").
 */

/** A source of uniformly distributed values in `[0, 1)`. */
export interface RandomSource {
  /** The next value in `[0, 1)`. */
  next(): number;
}

/**
 * Mulberry32: a 32-bit PRNG chosen for a short, stable, and independently
 * checkable definition. The test vectors in `random.test.ts` pin the exact
 * sequence, so a change of algorithm is a visible test failure rather than a
 * silently different fleet.
 */
export function createRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;

  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/**
 * Derives a stable child seed from a parent seed and a label, so each robot can
 * own an independent stream. Without this, robots drawing from one shared
 * generator would have their sequences coupled to iteration order — adding a
 * robot would change every later robot's history.
 */
export function deriveSeed(parentSeed: number, label: string): number {
  // FNV-1a over the label, mixed with the parent seed.
  let hash = 0x811c9dc5 ^ (parentSeed >>> 0);
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Returns an integer in `[0, boundExclusive)` from the supplied source. */
export function randomInt(random: RandomSource, boundExclusive: number): number {
  return Math.floor(random.next() * boundExclusive);
}

/** Returns a value in `[min, max)` from the supplied source. */
export function randomRange(random: RandomSource, min: number, max: number): number {
  return min + random.next() * (max - min);
}
