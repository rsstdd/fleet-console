import { useCallback, useEffect, useState } from "react";

import type { FetchLike } from "@/lib/transportDecoding";

export interface FetchedResourceContext {
  readonly id: string;
  readonly apiBaseUrl: string;
  readonly retry: () => void;
}

interface LoadedValue<TValue> {
  readonly forId: string;
  readonly forAttempt: number;
  readonly value: TValue;
}

const LOADING = { status: "loading" } as const;

export interface FetchedResource<TValue> {
  readonly value: TValue | typeof LOADING;
  /** A newer attempt for the same id is in flight behind the value on screen. */
  readonly isReloading: boolean;
}

/**
 * Shares per-id loading and retry while discarding stale completions after an id change
 * or unmount.
 *
 * `load` and `ports.fetchLike` must keep their identity across renders: a change to either
 * intentionally starts a new request, so a value rebuilt per render requests without end.
 */
export function useFetchedResource<TValue extends { readonly status: string }>(
  id: string,
  ports: { readonly apiBaseUrl: string; readonly fetchLike?: FetchLike },
  load: (request: FetchLike, context: FetchedResourceContext) => Promise<TValue>,
): FetchedResource<TValue> {
  const [loaded, setLoaded] = useState<LoadedValue<TValue> | null>(null);
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
      setLoaded({ forId: id, forAttempt: attempt, value });
    })();

    return () => {
      cancellation.abort();
    };
  }, [id, attempt, apiBaseUrl, fetchLike, load, retry]);

  const held = loaded !== null && loaded.forId === id ? loaded : null;
  return {
    value: held === null ? LOADING : held.value,
    isReloading: held !== null && held.forAttempt !== attempt,
  };
}
