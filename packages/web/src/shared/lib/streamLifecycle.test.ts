import { describe, expect, it } from "vitest";

import { isStreamConnected } from "./connectionContext";
import {
  INITIAL_STREAM_STATE,
  nextStreamState,
  publishedConnectionState,
  type StreamEvent,
  type StreamState,
} from "./streamLifecycle";

/**
 * The state matrix Principle 5 requires to exist before the transport does, plus the
 * property ADR 3 depends on: anything that is not delivering must suppress per-robot
 * freshness labels.
 */
describe("nextStreamState", () => {
  function run(...events: StreamEvent[]): StreamState {
    return events.reduce(nextStreamState, INITIAL_STREAM_STATE);
  }

  it("starts idle, having attempted nothing", () => {
    expect(INITIAL_STREAM_STATE).toStrictEqual({
      phase: "idle",
      attempt: 0,
      lastConnectedAt: null,
    });
  });

  it("calls a failed first attempt connecting, never reconnecting", () => {
    // Telling an operator the connection was lost when it never existed sends them
    // looking for a fault that is not there.
    const state = run({ kind: "connect" }, { kind: "close" }, { kind: "connect" });

    expect(state.phase).toBe("connecting");
    expect(state.attempt).toBe(2);
  });

  it("clears the attempt count on a successful open", () => {
    // The banner shows this number; leaving it climbing after a success would make the
    // retry control describe work that already finished.
    const state = run(
      { kind: "connect" },
      { kind: "close" },
      { kind: "connect" },
      {
        kind: "open",
        at: 1_755_600_000_000,
      },
    );

    expect(state).toStrictEqual({
      phase: "connected",
      attempt: 0,
      lastConnectedAt: 1_755_600_000_000,
    });
  });

  it("becomes reconnecting only after it has been connected once", () => {
    const state = run({ kind: "connect" }, { kind: "open", at: 1 }, { kind: "close" });

    expect(state.phase).toBe("reconnecting");
    expect(state.lastConnectedAt).toBe(1);
  });

  it("stays failed until something explicitly retries", () => {
    const failed = run(
      { kind: "connect" },
      { kind: "open", at: 1 },
      { kind: "close" },
      {
        kind: "give-up",
      },
    );
    expect(failed.phase).toBe("failed");

    expect(nextStreamState(failed, { kind: "connect" }).phase).toBe("reconnecting");
  });

  it("ignores a connect while already connected", () => {
    const connected = run({ kind: "connect" }, { kind: "open", at: 1 });

    expect(nextStreamState(connected, { kind: "connect" })).toBe(connected);
  });
});

describe("publishedConnectionState", () => {
  const PHASES = ["idle", "connecting", "connected", "reconnecting", "failed"] as const;

  it("reports connected only when the stream is actually delivering", () => {
    for (const phase of PHASES) {
      const published = publishedConnectionState({
        phase,
        attempt: 0,
        lastConnectedAt: null,
      });

      // ADR 3: a client showing per-robot freshness over a stream that is not delivering
      // asserts a currency it cannot support. Being wrong in the permissive direction here
      // is the failure; being wrong the other way is merely a visible banner.
      expect(isStreamConnected(published)).toBe(phase === "connected");
    }
  });

  it("publishes idle as disconnected rather than as anything optimistic", () => {
    // Same reasoning that made `disconnected` the context default (ADR 23): the two ways
    // to be wrong are not symmetric.
    expect(publishedConnectionState(INITIAL_STREAM_STATE)).toBe("disconnected");
  });

  it("distinguishes a stream that is trying from one that has stopped", () => {
    const trying: StreamState = { phase: "reconnecting", attempt: 3, lastConnectedAt: 1 };
    const stopped: StreamState = { phase: "failed", attempt: 3, lastConnectedAt: 1 };

    expect(publishedConnectionState(trying)).toBe("reconnecting");
    // Both suppress freshness; only the banner copy differs, and `failed` must not claim
    // a retry is in flight when none is.
    expect(publishedConnectionState(stopped)).toBe("disconnected");
  });
});
