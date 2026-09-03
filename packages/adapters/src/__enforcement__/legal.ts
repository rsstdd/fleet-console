/**
 * The control. Violates nothing: it imports from this package's own `core`, takes
 * time as an argument instead of reading a clock, and narrows without asserting.
 *
 * Without this file, a rule that reports nothing for any input would satisfy every
 * violation assertion in `enforcement.test.ts` (ADR 7).
 */
import { ok, type AdapterResult } from "../core/result.ts";

export function stamp(receivedAt: number): AdapterResult<number> {
  return ok(receivedAt);
}
