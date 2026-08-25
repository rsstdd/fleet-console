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
  /** ISO 8601, or epoch ms. Last event actually received on the stream. */
  readonly lastEventAt?: string | number;
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

/** Omits missing or invalid timestamps rather than risking the shell's outage surface. */
function formatEventTime(value: string | number | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return `${new Date(parsed).toISOString().slice(11, 19)}Z`;
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
  lastEventAt,
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
              lastEventAt={lastEventAt}
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
  lastEventAt,
  attempt,
  terminalCause,
}: {
  readonly state: Exclude<ConnectionState, "connected">;
  readonly lastEventAt: string | number | undefined;
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

    case "reconnecting": {
      const eventTime = formatEventTime(lastEventAt);

      return (
        <>
          Reconnecting to stream
          {attemptFragment}
          {eventTime && (
            <>
              {" · "}
              <span className="mono">last event {eventTime}</span>
            </>
          )}
        </>
      );
    }
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
