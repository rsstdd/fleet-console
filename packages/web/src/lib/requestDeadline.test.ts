import { describe, expect, it } from "vitest";

import { requestDeadlineSignal } from "./requestDeadline";

const DEADLINE_MS = 10;

/** Resolves once the event loop has passed `ms`, so a real deadline can expire. */
const elapse = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe("requestDeadlineSignal", () => {
  it("aborts once the deadline passes", async () => {
    const signal = requestDeadlineSignal(DEADLINE_MS);
    expect(signal.aborted).toBe(false);

    await elapse(DEADLINE_MS * 3);

    expect(signal.aborted).toBe(true);
  });

  it("aborts when the caller cancels first, before any deadline has passed", () => {
    const cancellation = new AbortController();
    const signal = requestDeadlineSignal(60_000, cancellation.signal);

    cancellation.abort();

    expect(signal.aborted).toBe(true);
  });

  it("is already aborted when the caller cancelled before the request started", () => {
    const cancellation = new AbortController();
    cancellation.abort();

    expect(requestDeadlineSignal(60_000, cancellation.signal).aborted).toBe(true);
  });

  it("leaves the caller's own signal unaborted when only the deadline expires", async () => {
    // The two must stay distinguishable: `useFetchedResource` discards a cancelled
    // request's result and keeps an expired one's. One shared controller would turn
    // every deadline into a permanent, silent `loading`.
    const cancellation = new AbortController();
    const signal = requestDeadlineSignal(DEADLINE_MS, cancellation.signal);

    await elapse(DEADLINE_MS * 3);

    expect(signal.aborted).toBe(true);
    expect(cancellation.signal.aborted).toBe(false);
  });
});
