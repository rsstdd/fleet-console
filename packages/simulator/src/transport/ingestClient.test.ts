import { describe, expect, it, vi } from "vitest";

import { createRandomSource } from "../runtime/random.ts";
import { createIngestClient, type FetchLike, type IngestClientOptions } from "./ingestClient.ts";

/** A client whose every dependency is fake, so no test opens a socket. */
function client(overrides: Partial<IngestClientOptions> = {}) {
  return createIngestClient({
    endpoint: "http://ingest.test",
    timeoutMs: 100,
    maxInFlight: 4,
    maxRetries: 0,
    retryBaseDelayMs: 10,
    fetch: () => Promise.resolve(new Response(null, { status: 202 })),
    random: createRandomSource(1),
    // Retry backoff resolves immediately; the delay itself is not what is
    // under test, the bounded attempt count is.
    delay: () => Promise.resolve(),
    ...overrides,
  });
}

/** A fetch that never settles, for exercising the in-flight ceiling. */
function pendingFetch(): { fetch: FetchLike; release: () => void } {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release: () => {
      release();
    },
    fetch: async () => {
      await gate;
      return new Response(null, { status: 202 });
    },
  };
}

describe("request shape", () => {
  it("posts JSON to the vendor's route with the vendor in the path", async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 202 })));
    await client({ fetch }).send("A", { robot_id: "R-001" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://ingest.test/api/telemetry/A");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.body).toBe('{"robot_id":"R-001"}');
  });

  it("routes each vendor to its own path segment", async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 202 })));
    const ingest = client({ fetch });

    await ingest.send("A", {});
    await ingest.send("B", {});
    await ingest.send("C", {});

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "http://ingest.test/api/telemetry/A",
      "http://ingest.test/api/telemetry/B",
      "http://ingest.test/api/telemetry/C",
    ]);
  });

  it("does not double the slash when the endpoint has a trailing one", async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 202 })));
    await client({ endpoint: "http://ingest.test/", fetch }).send("A", {});

    expect(fetch.mock.calls[0]?.[0]).toBe("http://ingest.test/api/telemetry/A");
  });
});

describe("outcome classification", () => {
  it("classifies 2xx as success", async () => {
    const outcome = await client({
      fetch: () => Promise.resolve(new Response(null, { status: 202 })),
    }).send("A", {});
    expect(outcome).toEqual({ kind: "success", attempts: 1 });
  });

  it("classifies 4xx as a rejection carrying the status", async () => {
    const outcome = await client({
      fetch: () => Promise.resolve(new Response(null, { status: 422 })),
    }).send("A", {});
    expect(outcome).toEqual({ kind: "rejected", status: 422, attempts: 1 });
  });

  it("classifies 5xx as a server failure", async () => {
    const outcome = await client({
      fetch: () => Promise.resolve(new Response(null, { status: 503 })),
    }).send("A", {});
    expect(outcome).toEqual({ kind: "server-failure", status: 503, attempts: 1 });
  });

  it("classifies an aborted request as a timeout", async () => {
    const outcome = await client({
      timeoutMs: 1,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    }).send("A", {});

    expect(outcome).toEqual({ kind: "timeout", attempts: 1 });
  });

  it("classifies a rejected fetch as a network failure", async () => {
    const outcome = await client({
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    }).send("A", {});
    expect(outcome).toEqual({ kind: "network-failure", attempts: 1 });
  });

  it("classifies an abandoned request during shutdown as cancelled, not as a timeout", async () => {
    const ingest = client({
      timeoutMs: 10_000,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    });

    const inFlight = ingest.send("A", {});
    ingest.abortAll();

    expect(await inFlight).toEqual({ kind: "cancelled", attempts: 1 });
  });
});

describe("retry policy", () => {
  it("does not retry by default", async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 503 })));
    await client({ fetch }).send("A", {});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries a server failure up to the bound and no further", async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 503 })));
    const outcome = await client({ maxRetries: 2, fetch }).send("A", {});

    expect(fetch).toHaveBeenCalledTimes(3); // 1 original + 2 retries
    expect(outcome).toEqual({ kind: "server-failure", status: 503, attempts: 3 });
  });

  it("never retries a 4xx, because a malformed payload will be malformed again", async () => {
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 400 })));
    await client({ maxRetries: 5, fetch }).send("A", {});
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops retrying as soon as an attempt succeeds", async () => {
    const fetch = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValue(new Response(null, { status: 202 }));

    const outcome = await client({ maxRetries: 5, fetch }).send("A", {});

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(outcome).toEqual({ kind: "success", attempts: 2 });
  });

  it("retries a timeout and a network failure", async () => {
    const network = vi.fn<FetchLike>(() => Promise.reject(new TypeError("fetch failed")));
    await client({ maxRetries: 1, fetch: network }).send("A", {});
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("draws backoff from the injected source, so a retry storm is reproducible", async () => {
    const delays: number[] = [];
    const fetch = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 503 })));
    const run = async (): Promise<void> => {
      await client({
        maxRetries: 3,
        fetch,
        random: createRandomSource(7),
        delay: (ms) => {
          delays.push(Number(ms));
          return Promise.resolve();
        },
      }).send("A", {});
    };

    await run();
    const first = [...delays];
    delays.length = 0;
    await run();

    expect(delays).toEqual(first);
    expect(first).toHaveLength(3);
  });
});

describe("concurrency bound", () => {
  it("sheds rather than queueing once the in-flight ceiling is reached", async () => {
    const { fetch, release } = pendingFetch();
    const ingest = client({ maxInFlight: 2, fetch });

    const first = ingest.send("A", {});
    const second = ingest.send("A", {});
    expect(ingest.inFlight()).toBe(2);

    // The third is refused outright. An unbounded queue here is the specific
    // failure AGENTS.md § Scheduling and transport names.
    expect(await ingest.send("A", {})).toEqual({ kind: "shed" });

    release();
    await Promise.all([first, second]);
    expect(ingest.inFlight()).toBe(0);
  });

  it("never exceeds the ceiling under a burst", async () => {
    const { fetch, release } = pendingFetch();
    const ingest = client({ maxInFlight: 3, fetch });

    const sends = Array.from({ length: 50 }, () => ingest.send("A", {}));
    expect(ingest.inFlight()).toBeLessThanOrEqual(3);

    release();
    const outcomes = await Promise.all(sends);
    expect(outcomes.filter((o) => o.kind === "shed")).toHaveLength(47);
  });

  it("releases in-flight capacity after a failure, not only after a success", async () => {
    const ingest = client({
      maxInFlight: 1,
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });

    await ingest.send("A", {});
    expect(ingest.inFlight()).toBe(0);
    expect((await ingest.send("A", {})).kind).toBe("network-failure");
  });
});

describe("diagnostics", () => {
  it("keeps the payload out of the outcome, so no caller can log it by accident", async () => {
    const outcome = await client({
      fetch: () => Promise.resolve(new Response(null, { status: 422 })),
    }).send("A", { robot_id: "R-001", secret: "do-not-log" });

    expect(JSON.stringify(outcome)).not.toContain("do-not-log");
    expect(JSON.stringify(outcome)).not.toContain("R-001");
  });
});
