import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { StreamDiagnosticsContext, useStreamDiagnostics } from "./streamDiagnosticsContext";

const DiagnosticsProvider = ({ children }: { readonly children: ReactNode }): ReactNode => (
  <StreamDiagnosticsContext.Provider value={{ rejectedFrames: 7 }}>
    {children}
  </StreamDiagnosticsContext.Provider>
);

describe("useStreamDiagnostics", () => {
  it("reports zero rejected frames when no provider is mounted", () => {
    const { result } = renderHook(() => useStreamDiagnostics());

    expect(result.current).toStrictEqual({ rejectedFrames: 0 });
  });

  it("reports the count supplied by its provider", () => {
    const { result } = renderHook(() => useStreamDiagnostics(), {
      wrapper: DiagnosticsProvider,
    });

    expect(result.current).toStrictEqual({ rejectedFrames: 7 });
  });
});
