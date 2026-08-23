import { describe, expect, it } from "vitest";

import {
  ConnectionContext,
  DEFAULT_CONNECTION_STATE,
  type StreamConnectionState,
  isStreamConnected,
} from "../connectionContext";

describe("DEFAULT_CONNECTION_STATE", () => {
  it("fails closed when no provider is above the consumer", () => {
    // The asymmetry is the whole point. A missing provider is a programming error,
    // and defaulting to `connected` would make every row assert a currency nothing
    // is supplying — the defect ADR 23 replaced. `disconnected` suppresses the
    // labels and shows the banner, so the mistake is visible on screen.
    expect(DEFAULT_CONNECTION_STATE).toBe("disconnected");
    expect(isStreamConnected(DEFAULT_CONNECTION_STATE)).toBe(false);
  });

  it("is the context's default, not merely a constant beside it", () => {
    // Reading React's own default rather than trusting the two agree by inspection.
    const contextDefault = (
      ConnectionContext as unknown as { readonly _currentValue: StreamConnectionState }
    )._currentValue;
    expect(contextDefault).toBe(DEFAULT_CONNECTION_STATE);
  });
});

describe("isStreamConnected", () => {
  it("is true only while the stream is delivering", () => {
    expect(isStreamConnected("connected")).toBe(true);
  });

  it("treats connecting as not delivering", () => {
    // A first attempt in flight has delivered nothing yet; suppressing until the join
    // completes is what keeps the fleet table honest during startup (ADR 31).
    expect(isStreamConnected("connecting")).toBe(false);
  });

  it("treats reconnecting as not delivering", () => {
    // Nothing updates freshness during a reconnect, so the last value ages
    // silently — the same lie as a dead socket, and the case most likely to be
    // waved through as "nearly connected" (ADR 3).
    expect(isStreamConnected("reconnecting")).toBe(false);
  });

  it("treats disconnected as not delivering", () => {
    expect(isStreamConnected("disconnected")).toBe(false);
  });

  it("covers the whole vocabulary, so a new state cannot default to permissive", () => {
    // A fourth state added to the union without a decision here would be a
    // compile error at this array, not a silently-suppressing runtime surprise.
    const all: readonly StreamConnectionState[] = [
      "connecting",
      "connected",
      "reconnecting",
      "disconnected",
    ];
    expect(all.filter(isStreamConnected)).toEqual(["connected"]);
  });

  it("agrees with the banner's vocabulary, which is declared separately", () => {
    // Coupling: `shared/ui/connectionBanner.tsx` holds a structurally identical
    // union, restated because `shared/lib` and `shared/ui` may not import each
    // other (ADR 4, ADR 23). Structural typing is what keeps them interchangeable;
    // this assignment is the check that they still are.
    const fromBanner: "connecting" | "connected" | "reconnecting" | "disconnected" = "reconnecting";
    const asContextState: StreamConnectionState = fromBanner;
    expect(isStreamConnected(asContextState)).toBe(false);
  });
});
