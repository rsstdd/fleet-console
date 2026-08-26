import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FetchLike } from "@/lib/transportDecoding";

import { useFetchedResource, type FetchedResourceContext } from "./useFetchedResource";

/** A test resource: the loaded value names the id and attempt it answered for. */
type TestState =
  { readonly status: "loading" } | { readonly status: "ready"; readonly label: string };

interface PendingLoad {
  readonly context: FetchedResourceContext;
  readonly request: FetchLike;
  readonly resolve: (state: TestState) => void;
}

function createControllableLoader(): {
  readonly calls: PendingLoad[];
  readonly load: (request: FetchLike, context: FetchedResourceContext) => Promise<TestState>;
} {
  const calls: PendingLoad[] = [];
  return {
    calls,
    load: (request, context) =>
      new Promise<TestState>((resolve) => {
        calls.push({ context, request, resolve });
      }),
  };
}

const unusedFetch: FetchLike = () => Promise.reject(new Error("unused"));

const PORTS = {
  apiBaseUrl: "http://example.test/api",
  requestTimeoutMs: 60_000,
  fetchLike: unusedFetch,
} satisfies {
  readonly apiBaseUrl: string;
  readonly requestTimeoutMs: number;
  readonly fetchLike: FetchLike;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFetchedResource", () => {
  it("derives loading until the load for the current id settles, then returns its value", async () => {
    const { calls, load } = createControllableLoader();
    const { result } = renderHook(() => useFetchedResource("R-1", PORTS, load));

    expect(result.current.value).toEqual({ status: "loading" });

    calls[0]?.resolve({ status: "ready", label: "R-1 answer" });
    await waitFor(() => {
      expect(result.current.value).toEqual({ status: "ready", label: "R-1 answer" });
    });
  });

  it("hands the loader the injected fetch and the id it is loading for", () => {
    const { calls, load } = createControllableLoader();
    renderHook(() => useFetchedResource("R-2", PORTS, load));

    expect(calls[0]?.request).toBe(PORTS.fetchLike);
    expect(calls[0]?.context.id).toBe("R-2");
    expect(calls[0]?.context.apiBaseUrl).toBe(PORTS.apiBaseUrl);
  });

  it("discards a stale in-flight result when the id changes", async () => {
    const { calls, load } = createControllableLoader();
    const { result, rerender } = renderHook(
      ({ id }: { readonly id: string }) => useFetchedResource(id, PORTS, load),
      { initialProps: { id: "R-1" } },
    );

    rerender({ id: "R-2" });
    expect(result.current.value).toEqual({ status: "loading" });

    // The first robot's answer arrives after the switch: it describes a robot
    // nobody is looking at any more and must never render under the new id.
    act(() => {
      calls[0]?.resolve({ status: "ready", label: "stale R-1 answer" });
    });
    expect(result.current.value).toEqual({ status: "loading" });

    calls[1]?.resolve({ status: "ready", label: "R-2 answer" });
    await waitFor(() => {
      expect(result.current.value).toEqual({ status: "ready", label: "R-2 answer" });
    });
  });

  it("re-runs the loader for the same id when the loader's retry is invoked", async () => {
    const { calls, load } = createControllableLoader();
    const { result } = renderHook(() => useFetchedResource("R-1", PORTS, load));

    calls[0]?.resolve({ status: "ready", label: "first attempt" });
    await waitFor(() => {
      expect(result.current.value).toEqual({ status: "ready", label: "first attempt" });
    });

    act(() => {
      calls[0]?.context.retry();
    });
    expect(calls).toHaveLength(2);

    calls[1]?.resolve({ status: "ready", label: "second attempt" });
    await waitFor(() => {
      expect(result.current.value).toEqual({ status: "ready", label: "second attempt" });
    });
  });

  it("abandons a request that outlives the deadline instead of loading for ever", async () => {
    vi.stubGlobal("fetch", (_url: string, init: { readonly signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const load = async (request: FetchLike): Promise<TestState> => {
      try {
        await request("http://example.test/api/never");
      } catch {
        return { status: "ready", label: "abandoned" };
      }
      return { status: "ready", label: "answered" };
    };

    const { result } = renderHook(() =>
      useFetchedResource("R-1", { apiBaseUrl: PORTS.apiBaseUrl, requestTimeoutMs: 10 }, load),
    );

    expect(result.current.value).toEqual({ status: "loading" });
    await waitFor(() => {
      expect(result.current.value).toEqual({ status: "ready", label: "abandoned" });
    });
  });

  it("reports the retry as in flight until the attempt it started settles", async () => {
    const { calls, load } = createControllableLoader();
    const { result } = renderHook(() => useFetchedResource("R-1", PORTS, load));
    calls[0]?.resolve({ status: "ready", label: "first attempt" });
    await waitFor(() => {
      expect(result.current.isReloading).toBe(false);
    });

    act(() => {
      calls[0]?.context.retry();
    });
    expect(result.current.isReloading).toBe(true);

    calls[1]?.resolve({ status: "ready", label: "second attempt" });
    await waitFor(() => {
      expect(result.current.isReloading).toBe(false);
    });
  });
});
