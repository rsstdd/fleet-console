import { describe, expect, it } from "vitest";

import { isStreamConnected } from "@/context/connectionContext";
import {
  INITIAL_PROBE_ATTEMPT_LIMIT,
  INITIAL_STREAM_STATE,
  nextStreamState,
  selectPublishedConnectionState,
  RETRY_BASE_DELAY_MS,
  RETRY_DELAY_CEILING_MS,
  computeRetryDelayMs,
  type StreamEvent,
  type StreamState,
} from "./streamLifecycle";

/**
 * The state matrix Principle 5 requires to exist before the transport does, plus the
 * property ADR 3 depends on: anything that is not delivering must suppress per-robot
 * freshness labels. The retry schedule's bounds live here too, because ADR 31 states
 * them as inequalities and inequalities are testable without a socket.
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
      terminalCause: null,
    });
  });

  it("calls a failed first attempt connecting, never reconnecting", () => {
    // Telling an operator the connection was lost when it never existed sends them
    // looking for a fault that is not there.
    const state = run({ kind: "connect" }, { kind: "close" }, { kind: "connect" });

    expect(state.phase).toBe("connecting");
    expect(state.attempt).toBe(2);
  });

  it("keeps counting attempts across an open, until the join completes", () => {
    // ADR 31: a socket that opens onto a failing snapshot fetch has not delivered a
    // fleet. `open` alone must not zero the number the banner is showing.
    const opened = run(
      { kind: "connect" },
      { kind: "close" },
      { kind: "connect" },
      { kind: "open", at: 1_755_600_000_000 },
    );
    expect(opened).toStrictEqual({
      phase: "connected",
      attempt: 2,
      lastConnectedAt: 1_755_600_000_000,
      terminalCause: null,
    });

    expect(nextStreamState(opened, { kind: "joined" }).attempt).toBe(0);
  });

  it("becomes reconnecting only after it has been connected once", () => {
    const state = run({ kind: "connect" }, { kind: "open", at: 1 }, { kind: "close" });

    expect(state.phase).toBe("reconnecting");
    expect(state.lastConnectedAt).toBe(1);
  });

  it("stays failed, and names its cause, until something explicitly retries", () => {
    const failed = run(
      { kind: "connect" },
      { kind: "open", at: 1 },
      { kind: "close" },
      { kind: "give-up", cause: "session-mismatch" },
    );
    expect(failed.phase).toBe("failed");
    expect(failed.terminalCause).toBe("session-mismatch");

    // Retrying clears the cause: "why we stopped" is false once we are trying again.
    const retried = nextStreamState(failed, { kind: "connect" });
    expect(retried.phase).toBe("reconnecting");
    expect(retried.terminalCause).toBeNull();
  });

  it("holds a distinct cause for each of the three terminal outcomes", () => {
    // ADR 31 keeps the causes as metadata rather than phases; this pins that each one
    // survives the transition, because the banner copy switches on it.
    for (const cause of ["handshake-exhausted", "contract", "session-mismatch"] as const) {
      const state = run({ kind: "connect" }, { kind: "give-up", cause });
      expect(state).toMatchObject({ phase: "failed", terminalCause: cause });
    }
  });

  it("ignores a connect while already connected", () => {
    const connected = run({ kind: "connect" }, { kind: "open", at: 1 });

    expect(nextStreamState(connected, { kind: "connect" })).toBe(connected);
  });
});

describe("selectPublishedConnectionState", () => {
  const PHASES = ["idle", "connecting", "connected", "reconnecting", "failed"] as const;

  function buildStateInPhase(phase: StreamState["phase"]): StreamState {
    return { phase, attempt: 0, lastConnectedAt: null, terminalCause: null };
  }

  it("reports connected only when the stream is actually delivering", () => {
    for (const phase of PHASES) {
      const published = selectPublishedConnectionState(buildStateInPhase(phase));

      // ADR 3: a client showing per-robot freshness over a stream that is not delivering
      // asserts a currency it cannot support. Being wrong in the permissive direction here
      // is the failure; being wrong the other way is merely a visible banner.
      expect(isStreamConnected(published)).toBe(phase === "connected");
    }
  });

  it("publishes idle as disconnected rather than as anything optimistic", () => {
    // Same reasoning that made `disconnected` the context default (ADR 23): the two ways
    // to be wrong are not symmetric.
    expect(selectPublishedConnectionState(INITIAL_STREAM_STATE)).toBe("disconnected");
  });

  it("distinguishes a first connection from a recovery", () => {
    // ADR 31 publishes `connecting` as its own value: "we have never had a stream" and
    // "we had one and lost it" earn different operator copy.
    expect(selectPublishedConnectionState(buildStateInPhase("connecting"))).toBe("connecting");
    expect(selectPublishedConnectionState(buildStateInPhase("reconnecting"))).toBe("reconnecting");
  });

  it("distinguishes a stream that is trying from one that has stopped", () => {
    const trying: StreamState = {
      phase: "reconnecting",
      attempt: 3,
      lastConnectedAt: 1,
      terminalCause: null,
    };
    const stopped: StreamState = {
      phase: "failed",
      attempt: 3,
      lastConnectedAt: 1,
      terminalCause: "contract",
    };

    expect(selectPublishedConnectionState(trying)).toBe("reconnecting");
    // Both suppress freshness; only the banner copy differs, and `failed` must not claim
    // a retry is in flight when none is.
    expect(selectPublishedConnectionState(stopped)).toBe("disconnected");
  });
});

describe("computeRetryDelayMs", () => {
  it("draws from [0, base × 2^(n−1)) with full jitter, exactly as ADR 31 states", () => {
    // The inequality is the decision. `random()` scales the cap directly, so the two
    // endpoints of the injected randomness pin both bounds.
    expect(computeRetryDelayMs(1, () => 0)).toBe(0);
    expect(computeRetryDelayMs(1, () => 0.999)).toBeLessThan(RETRY_BASE_DELAY_MS);
    expect(computeRetryDelayMs(3, () => 1)).toBe(RETRY_BASE_DELAY_MS * 4);
  });

  it("never reaches the 30-second ceiling, however many attempts have failed", () => {
    for (const attempts of [6, 7, 10, 100, 10_000]) {
      expect(computeRetryDelayMs(attempts, () => 0.999)).toBeLessThan(RETRY_DELAY_CEILING_MS);
      expect(computeRetryDelayMs(attempts, () => 1)).toBe(RETRY_DELAY_CEILING_MS);
    }
  });

  it("treats attempt counts below one as the first retry rather than shrinking to zero", () => {
    expect(computeRetryDelayMs(0, () => 1)).toBe(RETRY_BASE_DELAY_MS);
  });

  it("caps the initial probe at three attempts, the number the banner copy states", () => {
    // The banner says "after 3 attempts"; this constant is where that number lives.
    expect(INITIAL_PROBE_ATTEMPT_LIMIT).toBe(3);
  });
});
