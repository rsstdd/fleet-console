/**
 * Violates the no-unsafe-type-assertion ban (Principle 2): vendor input stays
 * `unknown` until a schema has decoded it. An assertion is the coercion the
 * adapter boundary exists to prevent.
 */
export function coerce(payload: unknown): string {
  return payload as string;
}
