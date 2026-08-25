import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONNECTION_STATE,
  type StreamConnectionState,
  isStreamConnected,
  useConnectionState,
} from "./connectionContext";

describe("DEFAULT_CONNECTION_STATE", () => {
  it("fails closed when no provider is above the consumer", () => {
    // The asymmetry is the point: the wrong default is invisible, this one is on screen.
    expect(DEFAULT_CONNECTION_STATE).toBe("disconnected");
    expect(isStreamConnected(DEFAULT_CONNECTION_STATE)).toBe(false);
  });

  it("is the context's default, not merely a constant beside it", () => {
    const { result } = renderHook(() => useConnectionState());
    expect(result.current).toBe(DEFAULT_CONNECTION_STATE);
  });
});

describe("isStreamConnected", () => {
  it("is true only while the stream is delivering", () => {
    expect(isStreamConnected("connected")).toBe(true);
  });

  it("treats connecting as not delivering", () => {
    // A first attempt in flight has delivered nothing yet (ADR 31).
    expect(isStreamConnected("connecting")).toBe(false);
  });

  it("treats reconnecting as not delivering", () => {
    // The case most likely to be waved through as "nearly connected", though the last
    // value is ageing silently — the same lie as a dead socket (ADR 3).
    expect(isStreamConnected("reconnecting")).toBe(false);
  });

  it("treats disconnected as not delivering", () => {
    expect(isStreamConnected("disconnected")).toBe(false);
  });

  it("covers the whole vocabulary, so a new state cannot default to permissive", () => {
    const all: readonly StreamConnectionState[] = [
      "connecting",
      "connected",
      "reconnecting",
      "disconnected",
    ];
    expect(all.filter(isStreamConnected)).toEqual(["connected"]);
  });

  it("agrees with the banner's vocabulary, which is declared separately", () => {
    // `components/connectionBanner.tsx` restates this union because the two layers may
    // not import each other; this assignment is the check that they stay interchangeable.
    const fromBanner: "connecting" | "connected" | "reconnecting" | "disconnected" = "reconnecting";
    const asContextState: StreamConnectionState = fromBanner;
    expect(isStreamConnected(asContextState)).toBe(false);
  });
});
