import { act, render, renderHook, screen } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  StreamDiagnosticsContext,
  createStreamDiagnosticsRecorder,
  useStreamDiagnostics,
} from "./streamDiagnosticsContext";

describe("useStreamDiagnostics", () => {
  it("reports the count as unmeasured when no provider is mounted", () => {
    // Not zero. A console with no transport publishing has taken no measurement, and a
    // zero reads on screen exactly like a stream that is rejecting nothing.
    const { result } = renderHook(() => useStreamDiagnostics());

    expect(result.current).toStrictEqual({ rejectedFrames: null });
  });

  it("reports the count its source is holding", () => {
    const recorder = createStreamDiagnosticsRecorder();
    recorder.recordRejectedFrame();

    const { result } = renderHook(() => useStreamDiagnostics(), {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <StreamDiagnosticsContext.Provider value={recorder}>
          {children}
        </StreamDiagnosticsContext.Provider>
      ),
    });

    expect(result.current).toStrictEqual({ rejectedFrames: 1 });
  });

  it("wakes its own reader without re-rendering a sibling", () => {
    // The reason the count is subscribable at all. Held in the router's state it moved
    // one technician-only field by re-rendering every route, the fleet table included.
    const recorder = createStreamDiagnosticsRecorder();

    function Reader(): ReactNode {
      const { rejectedFrames } = useStreamDiagnostics();
      return <output data-testid="reader">{String(rejectedFrames)}</output>;
    }

    function Sibling(): ReactNode {
      const renders = useRef(0);
      renders.current += 1;
      return <output data-testid="sibling">{String(renders.current)}</output>;
    }

    render(
      <StreamDiagnosticsContext.Provider value={recorder}>
        <Reader />
        <Sibling />
      </StreamDiagnosticsContext.Provider>,
    );
    const siblingRenders = screen.getByTestId("sibling").textContent;

    act(() => {
      recorder.recordRejectedFrame();
    });

    expect(screen.getByTestId("reader")).toHaveTextContent("1");
    expect(screen.getByTestId("sibling").textContent).toBe(siblingRenders);
  });

  it("leaves subscribers untouched while no frame is rejected", () => {
    // `useSyncExternalStore` re-reads on every render; a snapshot rebuilt per call would
    // loop rather than settle.
    const recorder = createStreamDiagnosticsRecorder();

    expect(recorder.getSnapshot()).toBe(recorder.getSnapshot());
  });
});
