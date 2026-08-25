import { useCallback, useEffect, useState } from "react";

import type { FetchLike } from "@/lib/transportDecoding";

export interface FetchedResourceContext {
  readonly id: string;
  readonly apiBaseUrl: string;
  readonly retry: () => void;
}

/**
 * Shares per-id loading and retry while discarding stale completions after an id change
 * or unmount. Changing `load` intentionally starts a new request.
 */
export function useFetchedResource<TValue extends { readonly status: string }>(
  id: string,
  ports: { readonly apiBaseUrl: string; readonly fetchLike?: FetchLike },
  load: (request: FetchLike, context: FetchedResourceContext) => Promise<TValue>,
): TValue | { readonly status: "loading" } {
  const [loaded, setLoaded] = useState<{
    readonly forId: string;
    readonly value: TValue;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { apiBaseUrl, fetchLike } = ports;

  // Stable identity prevents this effect dependency from retriggering its own request.
  const retry = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  // These dependencies select the HTTP request; cleanup makes superseded completions stale.
  useEffect(() => {
    const request: FetchLike = fetchLike ?? ((url) => fetch(url));
    // FetchLike has no signal; this controller marks staleness rather than cancelling I/O.
    const cancellation = new AbortController();

    void (async () => {
      const value = await load(request, { id, apiBaseUrl, retry });
      if (cancellation.signal.aborted) return;
      setLoaded({ forId: id, value });
    })();

    return () => {
      cancellation.abort();
    };
  }, [id, attempt, apiBaseUrl, fetchLike, load, retry]);

  return loaded !== null && loaded.forId === id ? loaded.value : { status: "loading" };
}
