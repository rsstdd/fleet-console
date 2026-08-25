import { createContext, use } from "react";

export interface StreamDiagnostics {
  /** Session-wide across all robots; never a per-robot count. */
  readonly rejectedFrames: number;
}

const DEFAULT_STREAM_DIAGNOSTICS: StreamDiagnostics = { rejectedFrames: 0 };

export const StreamDiagnosticsContext = createContext<StreamDiagnostics>(
  DEFAULT_STREAM_DIAGNOSTICS,
);

export function useStreamDiagnostics(): StreamDiagnostics {
  return use(StreamDiagnosticsContext);
}
