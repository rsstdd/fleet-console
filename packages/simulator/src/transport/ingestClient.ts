/**
 * The bounded HTTP ingest client.
 *
 * One JSON POST per telemetry reading, per ADR 2 § Decision. Concurrency is
 * capped and retries are bounded and separately counted, so a struggling server
 * cannot turn one simulated reading into an uncontrolled duplicate storm
 * (AGENTS.md § Scheduling and transport).
 */
import { ingestUrlFor } from "../config/simulatorConfig.ts";
import type { VendorId } from "../fleet/simulatedRobot.ts";
import type { RandomSource } from "../runtime/random.ts";

/**
 * The classified outcome of one send.
 *
 * Rejection and failure are separate because only one of them is retryable: a
 * 4xx means the payload is wrong and will be wrong again, so retrying it is
 * load without a chance of success (TODO § 14).
 */
export type SendOutcome =
  | { readonly kind: "success"; readonly attempts: number }
  | { readonly kind: "rejected"; readonly status: number; readonly attempts: number }
  | { readonly kind: "server-failure"; readonly status: number; readonly attempts: number }
  | { readonly kind: "timeout"; readonly attempts: number }
  | { readonly kind: "network-failure"; readonly attempts: number }
  | { readonly kind: "cancelled"; readonly attempts: number }
  | { readonly kind: "shed" };

/** The subset of `fetch` this client uses; tests supply their own. */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Everything the client needs, all injected so no test touches the network. */
export interface IngestClientOptions {
  readonly endpoint: string;
  readonly timeoutMs: number;
  readonly maxInFlight: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly fetch: FetchLike;
  readonly random: RandomSource;
  /** Injected so retry backoff runs on fake timers in tests. */
  readonly delay?: (ms: string | number, signal?: AbortSignal) => Promise<void>;
}

/** Posts vendor payloads to the server, bounded by an in-flight ceiling. */
export interface IngestClient {
  /**
   * Sends one reading. Resolves with `shed` without touching the network when
   * the in-flight ceiling is already reached — bounded backpressure, never a
   * growing queue (TODO § 13).
   */
  readonly send: (vendor: VendorId, payload: unknown) => Promise<SendOutcome>;
  /** Current in-flight request count. */
  readonly inFlight: () => number;
  /** Aborts everything still in flight; used when the shutdown deadline passes. */
  readonly abortAll: () => void;
}

/** Sleeps, on the timer the test can control. */
function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Creates a bounded ingest client. */
export function createIngestClient(options: IngestClientOptions): IngestClient {
  const {
    endpoint,
    timeoutMs,
    maxInFlight,
    maxRetries,
    retryBaseDelayMs,
    fetch: doFetch,
    random,
  } = options;
  const delay = options.delay ?? defaultDelay;

  let inFlight = 0;
  const shutdown = new AbortController();

  /** One HTTP attempt with its own timeout, classified into a `SendOutcome` kind. */
  async function attempt(url: string, body: string, attempts: number): Promise<SendOutcome> {
    const timeout = new AbortController();
    const timer = setTimeout(() => {
      timeout.abort();
    }, timeoutMs);
    const abortListener = (): void => {
      timeout.abort();
    };
    shutdown.signal.addEventListener("abort", abortListener, { once: true });

    try {
      const response = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: timeout.signal,
      });

      if (response.ok) {
        return { kind: "success", attempts };
      }
      if (response.status >= 500) {
        return { kind: "server-failure", status: response.status, attempts };
      }
      return { kind: "rejected", status: response.status, attempts };
    } catch {
      // `fetch` reports timeout and network failure through the same rejection,
      // so the abort signals are what separate them.
      if (shutdown.signal.aborted) {
        return { kind: "cancelled", attempts };
      }
      if (timeout.signal.aborted) {
        return { kind: "timeout", attempts };
      }
      return { kind: "network-failure", attempts };
    } finally {
      clearTimeout(timer);
      shutdown.signal.removeEventListener("abort", abortListener);
    }
  }

  /** Only a transient failure is worth another attempt; a 4xx will fail identically. */
  function isRetryable(outcome: SendOutcome): boolean {
    return (
      outcome.kind === "server-failure" ||
      outcome.kind === "timeout" ||
      outcome.kind === "network-failure"
    );
  }

  return {
    async send(vendor, payload): Promise<SendOutcome> {
      if (inFlight >= maxInFlight) {
        return { kind: "shed" };
      }

      const url = ingestUrlFor(endpoint, vendor);
      const body = JSON.stringify(payload);
      inFlight += 1;

      try {
        let outcome = await attempt(url, body, 1);
        for (let retry = 1; retry <= maxRetries && isRetryable(outcome); retry += 1) {
          // Full jitter over an exponential base, drawn from the injected source
          // so a retry storm is as reproducible as the run that caused it.
          const backoff = retryBaseDelayMs * 2 ** (retry - 1) * random.next();
          await delay(Math.round(backoff));
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
    inFlight(): number {
      return inFlight;
    },
    abortAll(): void {
      shutdown.abort();
    },
  };
}
