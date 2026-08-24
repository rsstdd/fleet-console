import { useCallback, useEffect, useState } from "react";

import type { FetchLike } from "@/lib/transportDecoding";

/**
 * What a loader is told about the request it is answering: the id being loaded,
 * the deployment's API address, and the retry handle its failure states may carry.
 */
export interface FetchedResourceContext {
  readonly id: string;
  readonly apiBaseUrl: string;
  readonly retry: () => void;
}

/**
 * The per-id fetch lifecycle shared by `useRobotDetail` and `useRobotHistory`:
 * one load per id per attempt, loading derived rather than stored, and stale
 * in-flight answers discarded on id change or unmount.
 *
 * @param id - The resource wanted. Changing it starts a new load and makes any
 *   in-flight answer stale, so the previous id's value never appears under the new one.
 * @param ports - `apiBaseUrl` is a parameter because the data layers may not import
 *   `config` (ADR 4); `fetchLike` is injectable so tests map outcomes to states without
 *   a network. Both are effect dependencies and must keep a stable identity.
 * @param load - Must be a module-level function, not an inline closure: it is an effect
 *   dependency too, and a fresh identity per render would re-fetch on every render. It
 *   is handed the retry callback to embed in whatever failure state it returns, and is
 *   expected to resolve with that state rather than to reject.
 * @returns The loaded value once it describes this `id`, and `{ status: "loading" }`
 *   otherwise — including the whole gap after an id change, which is why loading is
 *   derived here rather than written from inside the effect.
 */
export function useFetchedResource<TValue>(
  id: string,
  ports: { readonly apiBaseUrl: string; readonly fetchLike?: FetchLike },
  load: (request: FetchLike, context: FetchedResourceContext) => Promise<TValue>,
): TValue | { readonly status: "loading" } {
  /**
   * The loaded state **and the id it describes**, together.
   *
   * Two fields rather than one, so switching ids shows `loading` by derivation instead
   * of by a `setState` inside the effect — which React's own lint rule rejects as a
   * cascading render, and which would also flash the previous id's data under the new
   * id's heading for one frame.
   */
  const [loaded, setLoaded] = useState<{ forId: string; value: TValue } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { apiBaseUrl, fetchLike } = ports;

  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  // Synchronizes an external HTTP request with the two inputs that decide which answer
  // is wanted: `id` and `attempt`. The rest of the dependency list is stable by contract
  // (see the parameter docs), so a re-run means the wanted resource genuinely changed.
  // Cleanup aborts, which is what makes a completion landing after an id change or an
  // unmount stale rather than a write of one id's data under another id's heading.
  useEffect(() => {
    const request: FetchLike = fetchLike ?? ((url) => fetch(url));
    // An `AbortController` rather than a captured boolean: the compiler cannot see that a
    // cleanup closure flips a `let` across an await, so it narrows the flag to `true` and
    // the guard reads as dead code. `signal.aborted` is honest to both the reader and the
    // analyzer, and it is the handle a cancelling `fetch` would want anyway.
    const cancellation = new AbortController();

    void (async () => {
      const value = await load(request, { id, apiBaseUrl, retry });
      // The id changed or the page unmounted while this was in flight, so it describes
      // a resource nobody is looking at any more.
      if (cancellation.signal.aborted) return;
      setLoaded({ forId: id, value });
    })();

    return () => {
      cancellation.abort();
    };
  }, [id, attempt, apiBaseUrl, fetchLike, load, retry]);

  // A result for a different id is not this id's answer — derived, not written.
  return loaded !== null && loaded.forId === id ? loaded.value : { status: "loading" };
}
