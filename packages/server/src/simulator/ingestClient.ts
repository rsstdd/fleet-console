import type { RandomSource, VendorId } from "./robot.ts";

export type SendOutcome =
  | { readonly kind: "success"; readonly attempts: number }
  | { readonly kind: "rejected"; readonly status: number; readonly attempts: number }
  | { readonly kind: "server-failure"; readonly status: number; readonly attempts: number }
  | { readonly kind: "timeout"; readonly attempts: number }
  | { readonly kind: "network-failure"; readonly attempts: number }
  | { readonly kind: "cancelled"; readonly attempts: number }
  | { readonly kind: "shed" };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface IngestClientOptions {
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly maxInFlight: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly fetch: FetchLike;
  readonly random: RandomSource;
  readonly delay?: (ms: number) => Promise<void>;
}

export interface IngestClient {
  send(vendor: VendorId, payload: unknown): Promise<SendOutcome>;
  inFlight(): number;
  abortAll(): void;
}

function isRetryable(outcome: SendOutcome): boolean {
  return (
    outcome.kind === "server-failure" ||
    outcome.kind === "timeout" ||
    outcome.kind === "network-failure"
  );
}

/** At capacity, shed readings instead of queueing data that will arrive stale. */
export function createIngestClient(options: IngestClientOptions): IngestClient {
  const delay =
    options.delay ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  let inFlight = 0;
  const shutdown = new AbortController();

  async function attempt(url: string, body: string, attempts: number): Promise<SendOutcome> {
    const timeout = new AbortController();
    const timer = setTimeout(() => {
      timeout.abort();
    }, options.timeoutMs);
    const onShutdown = (): void => {
      timeout.abort();
    };
    shutdown.signal.addEventListener("abort", onShutdown, { once: true });
    try {
      const response = await options.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: timeout.signal,
      });
      if (response.ok) {
        return { kind: "success", attempts };
      }
      return response.status >= 500
        ? { kind: "server-failure", status: response.status, attempts }
        : { kind: "rejected", status: response.status, attempts };
    } catch {
      if (shutdown.signal.aborted) {
        return { kind: "cancelled", attempts };
      }
      return timeout.signal.aborted
        ? { kind: "timeout", attempts }
        : { kind: "network-failure", attempts };
    } finally {
      clearTimeout(timer);
      shutdown.signal.removeEventListener("abort", onShutdown);
    }
  }

  return {
    async send(vendor, payload) {
      if (inFlight >= options.maxInFlight) {
        return { kind: "shed" };
      }
      const url = `${options.endpoint.replace(/\/$/, "")}/api/telemetry/${vendor}`;
      const body = JSON.stringify(payload);
      inFlight += 1;
      try {
        let outcome = await attempt(url, body, 1);
        for (let retry = 1; retry <= options.maxRetries && isRetryable(outcome); retry += 1) {
          await delay(
            Math.round(options.retryBaseDelayMs * 2 ** (retry - 1) * options.random.next()),
          );
          if (shutdown.signal.aborted) {
            return { kind: "cancelled", attempts: retry };
          }
          outcome = await attempt(url, body, retry + 1);
        }
        return outcome;
      } finally {
        inFlight -= 1;
      }
    },
    inFlight: () => inFlight,
    abortAll: () => {
      shutdown.abort();
    },
  };
}
