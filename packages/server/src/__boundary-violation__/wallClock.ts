/** Deliberate wall-clock violation used only by enforcement.test.ts. */
export function unsafeNow(): Date {
  return new Date();
}
