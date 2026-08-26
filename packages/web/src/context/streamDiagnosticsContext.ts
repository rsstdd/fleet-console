import { createContext, use, useSyncExternalStore } from "react";

/**
 * The console's own stream health, held apart from robot state (Principle 11).
 *
 * Subscribable rather than a context value carrying a number. A rejected frame is a
 * frame-rate event on a bad stream, and a number published from the router's own state
 * re-renders every route — the fleet table included — to move one field in a
 * technician-only section. Subscribers wake here instead.
 */
export interface StreamDiagnostics {
  /**
   * Session-wide across all robots; never a per-robot count.
   *
   * Null means no transport is publishing, which is not the same fact as a measured zero
   * and must not be rendered as one.
   */
  readonly rejectedFrames: number | null;
}

/**
 * What a reader needs; `useSyncExternalStore` consumes exactly this pair.
 *
 * Function properties rather than methods, as `FleetStore` declares its own: both are
 * passed detached from the object that holds them, so neither may depend on `this`.
 */
export interface StreamDiagnosticsSource {
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => StreamDiagnostics;
}

/** The writer half, held by whoever owns the transport and handed to nobody else. */
export interface StreamDiagnosticsRecorder extends StreamDiagnosticsSource {
  readonly recordRejectedFrame: () => void;
}

const UNMEASURED: StreamDiagnostics = { rejectedFrames: null };

/**
 * Fails closed, as `connectionContext` does and for the same reason: the two ways to be
 * wrong about a missing provider are not symmetric. A zero here is a measurement nobody
 * took, and it reads on screen exactly like a healthy stream.
 */
const UNMEASURED_SOURCE: StreamDiagnosticsSource = {
  subscribe: () => () => undefined,
  getSnapshot: () => UNMEASURED,
};

export const StreamDiagnosticsContext = createContext<StreamDiagnosticsSource>(UNMEASURED_SOURCE);

/**
 * @returns A counter that changes without re-rendering anything above the caller.
 */
export function useStreamDiagnostics(): StreamDiagnostics {
  const source = use(StreamDiagnosticsContext);
  return useSyncExternalStore(source.subscribe, source.getSnapshot);
}

/**
 * @returns A recorder whose snapshot identity changes only when a frame is rejected, so a
 *   quiet stream never wakes a subscriber.
 */
export function createStreamDiagnosticsRecorder(): StreamDiagnosticsRecorder {
  const listeners = new Set<() => void>();
  let snapshot: StreamDiagnostics = { rejectedFrames: 0 };

  return {
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => snapshot,
    recordRejectedFrame: () => {
      snapshot = { rejectedFrames: (snapshot.rejectedFrames ?? 0) + 1 };
      for (const listener of listeners) listener();
    },
  };
}
