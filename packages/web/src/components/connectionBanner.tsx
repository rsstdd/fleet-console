import type { ReactNode } from "react";

/**
 * Connection truth displayed while features suppress untrustworthy per-robot freshness
 * for every non-connected state (ADR 3).
 *
 * `ConnectionState` structurally mirrors `StreamConnectionState` in
 * `context/connectionContext.ts`. The sibling layers may not import one another, so the
 * component spec § API owns the vocabulary and a new state updates both declarations.
 */
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

/**
 * Why the transport stopped retrying, when it has (ADR 31). Structurally restated from
 * `lib/streamLifecycle`'s `StreamTerminalCause` for the same sibling-layer reason
 * as `ConnectionState` above. That source names this component as the other end.
 */
export type ConnectionTerminalCause = "handshake-exhausted" | "contract" | "session-mismatch";

/** Display-only inputs; socket ownership and retry policy remain outside this component. */
export interface ConnectionBannerProps {
  readonly state: ConnectionState;
  /**
   * The last stream event's time, already formatted by the caller.
   *
   * A string rather than an instant: this layer may not reach `utils/time`, and
   * reimplementing that formatter here left the console with two spellings of one format
   * and no test holding them together. Omitted where there is nothing to show — this
   * surface states an outage and must not put an em dash where a time belongs.
   */
  readonly lastEventLabel?: string;
  readonly attempt?: number;
  /**
   * Why retrying stopped, shown only while `disconnected`. Distinct copy per cause
   * (spec § 5): an operator told only "disconnected" cannot tell a server that never
   * answered from one that answered with a different runtime's stream (ADR 31).
   */
  readonly terminalCause?: ConnectionTerminalCause | null;
  /** Must force an immediate attempt whose progress becomes externally visible. */
  readonly onRetry?: () => void;
  readonly className?: string;
}

function formatAttempt(attempt: number | undefined): string | null {
  if (attempt === undefined || !Number.isFinite(attempt) || attempt < 1) {
    return null;
  }

  return String(Math.trunc(attempt));
}

/**
 * Renders the connection banner. The outer element is rendered in every state,
 * including `connected`, and only its contents are conditional.
 *
 * A live region must already exist in the accessibility tree before its content
 * changes for the change to be announced. Mounting the region together with its
 * first message is the most common way to build a live region that never fires,
 * so the connected state is an empty, visually hidden, zero-height container
 * rather than `null` (spec § 4, Principle 6). Callers must mount this
 * unconditionally; `AppShell` does.
 */
export function ConnectionBanner({
  state,
  lastEventLabel,
  attempt,
  terminalCause,
  onRetry,
  className,
}: ConnectionBannerProps): ReactNode {
  const classes = ["connection-banner", `connection-banner--${state}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role="status"
      aria-live="polite"
      data-connected={state === "connected" ? "true" : "false"}
    >
      {state !== "connected" && (
        <>
          <span className="connection-banner__message">
            <ConnectionMessage
              state={state}
              lastEventLabel={lastEventLabel}
              attempt={attempt}
              terminalCause={terminalCause}
            />
          </span>
          {onRetry && (
            <button type="button" className="connection-banner__retry" onClick={onRetry}>
              Retry now
            </button>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The fixed message patterns from spec § 5. Copy is fixed here rather than
 * passed in: a caller-supplied string is how "Reconnecting" becomes "Everything
 * is fine, one moment". Changing any of this copy updates the spec and
 * `docs/WIREFRAMES.md` § 6 in the same change (spec § 12).
 */
function ConnectionMessage({
  state,
  lastEventLabel,
  attempt,
  terminalCause,
}: {
  readonly state: Exclude<ConnectionState, "connected">;
  readonly lastEventLabel: string | undefined;
  readonly attempt: number | undefined;
  readonly terminalCause: ConnectionTerminalCause | null | undefined;
}): ReactNode {
  const attemptText = formatAttempt(attempt);
  const attemptFragment = attemptText && (
    <>
      {" · "}
      <span className="mono">attempt {attemptText}</span>
    </>
  );

  switch (state) {
    // No last-event fragment: nothing has ever been received, so there is no
    // event whose time would be true (spec § 5, ADR 31).
    case "connecting":
      return (
        <>
          Connecting to stream
          {attemptFragment}
        </>
      );

    case "reconnecting":
      return (
        <>
          Reconnecting to stream
          {attemptFragment}
          {lastEventLabel !== undefined && (
            <>
              {" · "}
              <span className="mono">last event {lastEventLabel}</span>
            </>
          )}
        </>
      );
    // Fixed strings, with no attempt or last-event fragment: once the stream is
    // gone the age of the last event is a detail beside the fact that nothing
    // on screen is current, and § 5 fixes these sentences exactly. The cause
    // picks which sentence, because "never connected" and "the stream is not the
    // snapshot's server" call for different operator responses (ADR 31).
    case "disconnected":
      switch (terminalCause ?? null) {
        case "handshake-exhausted":
          // Mirrors lib/streamLifecycle.ts's INITIAL_PROBE_ATTEMPT_LIMIT;
          // component spec 07 §5 owns the shared copy.
          return <>Unable to connect to stream after 3 attempts</>;
        case "session-mismatch":
          return <>Stream integrity error · showing last known state (may be stale)</>;
        case "contract":
        case null:
          return <>Stream disconnected · showing last known state (may be stale)</>;
      }
  }
}
