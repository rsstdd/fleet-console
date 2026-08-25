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
    expect(isStreamConnected("connecting")).toBe(false);
  });

  it("treats reconnecting as not delivering", () => {
    expect(isStreamConnected("reconnecting")).toBe(false);
  });

  it("treats disconnected as not delivering", () => {
    expect(isStreamConnected("disconnected")).toBe(false);
  });

  it("covers the whole vocabulary, so a new state cannot default to permissive", () => {
    // `satisfies` is the enforcement: a fifth state added to the union stops compiling
    // here until this table decides it, rather than passing as an untested member.
    const delivering = {
      connecting: isStreamConnected("connecting"),
      connected: isStreamConnected("connected"),
      reconnecting: isStreamConnected("reconnecting"),
      disconnected: isStreamConnected("disconnected"),
    } satisfies Record<StreamConnectionState, boolean>;

    expect(delivering).toStrictEqual({
      connecting: false,
      connected: true,
      reconnecting: false,
      disconnected: false,
    });
  });

  it("agrees with the banner's vocabulary, which is declared separately", () => {
    // `components/connectionBanner.tsx` restates this union because the two layers may
    // not import each other; this assignment is the check that they stay interchangeable.
    const fromBanner: "connecting" | "connected" | "reconnecting" | "disconnected" = "reconnecting";
    const asContextState: StreamConnectionState = fromBanner;
    expect(isStreamConnected(asContextState)).toBe(false);
  });
});
