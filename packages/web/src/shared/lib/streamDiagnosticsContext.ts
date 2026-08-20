import { createContext, useContext } from "react";

/**
 * How the transport's stream diagnostics reach the technician surfaces.
 *
 * The rejected-frame count is produced at the transport boundary in `app`, and
 * the diagnostics section that shows it lives in `features/robot`. `features`
 * may not import `app` (ADR 4), so the value travels down through a context in
 * `shared/lib` — the same constraint and the same solution as connection state
 * (ADR 23).
 *
 * Scoped to stream diagnostics and nothing else, for ADR 23's reason: a
 * context every layer can reach is where an application store grows by
 * accretion.
 */

/** Counters about the console's own stream, shown to technicians only. */
export interface StreamDiagnostics {
  /**
   * Frames dropped for failing to decode since this console session began —
   * session-wide and across all robots, never per robot. The render site must
   * state that scope rather than implying a precision the count does not have.
   *
   * A run of these means the contract is degrading silently; whether a run
   * should escalate to a terminal state is trigger-deferred (fleet TODO A4).
   */
  readonly rejectedFrames: number;
}

/**
 * The default: zero rejections, which is the truth about a console whose
 * transport has not mounted and therefore has decoded nothing.
 */
const NO_DIAGNOSTICS: StreamDiagnostics = { rejectedFrames: 0 };

/** Carries stream diagnostics from the transport boundary to technician surfaces. */
export const StreamDiagnosticsContext = createContext<StreamDiagnostics>(NO_DIAGNOSTICS);

/** Returns the diagnostics of this console's own stream. */
export function useStreamDiagnostics(): StreamDiagnostics {
  return useContext(StreamDiagnosticsContext);
}
