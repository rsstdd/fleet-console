import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FetchLike } from "@/lib/transportDecoding";

import { useFetchedResource, type FetchedResourceContext } from "./useFetchedResource";

/** A test resource: the loaded value names the id and attempt it answered for. */
type TestState =
  { readonly status: "loading" } | { readonly status: "ready"; readonly label: string };

/** One controllable in-flight load: the test decides when and with what it settles. */
interface PendingLoad {
  readonly context: FetchedResourceContext;
  readonly request: FetchLike;
  readonly resolve: (state: TestState) => void;
}

/** A loader whose every call is captured for the test to settle in any order. */
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
  fetchLike: unusedFetch,
} satisfies { readonly apiBaseUrl: string; readonly fetchLike: FetchLike };

describe("useFetchedResource", () => {
  it("derives loading until the load for the current id settles, then returns its value", async () => {
    const { calls, load } = createControllableLoader();
    const { result } = renderHook(() => useFetchedResource("R-1", PORTS, load));

    expect(result.current).toEqual({ status: "loading" });

    calls[0]?.resolve({ status: "ready", label: "R-1 answer" });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", label: "R-1 answer" });
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
    expect(result.current).toEqual({ status: "loading" });

    // The first robot's answer arrives after the switch: it describes a robot
    // nobody is looking at any more and must never render under the new id.
    act(() => {
      calls[0]?.resolve({ status: "ready", label: "stale R-1 answer" });
    });
    expect(result.current).toEqual({ status: "loading" });

    calls[1]?.resolve({ status: "ready", label: "R-2 answer" });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", label: "R-2 answer" });
    });
  });

  it("re-runs the loader for the same id when the loader's retry is invoked", async () => {
    const { calls, load } = createControllableLoader();
    const { result } = renderHook(() => useFetchedResource("R-1", PORTS, load));

    calls[0]?.resolve({ status: "ready", label: "first attempt" });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", label: "first attempt" });
    });

    act(() => {
      calls[0]?.context.retry();
    });
    expect(calls).toHaveLength(2);

    calls[1]?.resolve({ status: "ready", label: "second attempt" });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", label: "second attempt" });
    });
  });
});
