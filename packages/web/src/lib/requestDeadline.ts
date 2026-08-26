/**
 * The deadline every HTTP request in this console runs under.
 *
 * A hung connection rejects nothing and decodes nothing, so its surface stays `loading`
 * for the life of the page. Bounding at the port
 * needs no new failure vocabulary: expiry rejects, `requestJson` reads it as
 * `unreachable`, both resource hooks already retry it.
 */

/**
 * Combines a caller's cancellation with a fresh deadline for one request.
 *
 * @param timeoutMs - Per call. A signal built once and reused aborts every later request
 *   the moment the first deadline passes.
 * @param cancellation - The caller's own reason to stop waiting: a changed id, an unmount.
 *   Distinct from the deadline because `useFetchedResource` discards a cancelled result
 *   and keeps an expired one; one shared controller makes every deadline a silent,
 *   permanent `loading`.
 * @returns Aborts on whichever comes first. Returns the deadline unwrapped when there is
 *   no cancellation, because `AbortSignal.any` over one input buys nothing.
 */
export function requestDeadlineSignal(timeoutMs: number, cancellation?: AbortSignal): AbortSignal {
  const deadline = AbortSignal.timeout(timeoutMs);
  if (cancellation === undefined) return deadline;
  return AbortSignal.any([cancellation, deadline]);
}
