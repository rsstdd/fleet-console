import type { ReactNode } from "react";

/**
 * ConnectionBanner — stream connection integrity.
 * Spec: docs/02_component-specs/07_CONNECTION_BANNER.md (revision 2).
 *
 * Load-bearing for ADR 3. Freshness is derived by a server sweep and delivered
 * over the stream, so while the stream is down no per-robot freshness label can
 * be trusted. The feature layer suppresses those labels and this banner carries
 * the connection-level truth instead. Coupling: the suppression itself lives in
 * the fleet and robot features and in `FreshnessLabel`'s callers, not here —
 * this component is necessary but not sufficient for that rule.
 *
 * It does not own the socket, does not implement retry policy (that is
 * transport policy in `shared/lib` or the app layer), and computes no
 * freshness. It reflects state passed from the app layer and invokes `onRetry`.
 *
 * Every visual decision comes from the `.connection-banner` rules in
 * `src/styles/global.css`, which read `--warning` / `--error` in `tokens.css`.
 * No inline style and no second styling system (Principle 8, ADR 5).
 */
export type ConnectionState = "connected" | "reconnecting" | "disconnected";

/**
 * Display-only inputs for the banner.
 *
 * `state` is the one required field: ADR 23 makes the banner part of the freshness
 * mechanism's correctness rather than decoration, so a caller cannot omit the fact it
 * exists to carry.
 */
export interface ConnectionBannerProps {
  readonly state: ConnectionState;
  /** ISO 8601, or epoch ms. Last event actually received on the stream. */
  readonly lastEventAt?: string | number;
  /** Reconnect attempt number, surfaced so the control is visibly doing something. */
  readonly attempt?: number;
  /**
   * Must force an immediate reconnect attempt and increment `attempt`.
   * A retry control that does nothing observable is the class of lie this
   * project exists to argue against.
   */
  readonly onRetry?: () => void;
  readonly className?: string;
}

/**
 * Formats a stream event time as UTC `HH:MM:SSZ`, or null when the value is
 * missing or unparseable.
 *
 * Returns null rather than throwing, which is the opposite of `FreshnessLabel`'s
 * dev-time throw on a bad timestamp, and deliberately so: spec § 10 requires the
 * fragment to be omitted. A banner that crashes the shell during a reconnect
 * storm removes the one surface still telling the operator the truth about
 * currency, and `Invalid Date` in a connection message is worse than no time
 * at all.
 */
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

/**
 * Returns the attempt number when it is a real count, or null when it is
 * absent or nonsensical, so the fragment is omitted rather than printing
 * `attempt undefined` or `attempt NaN` (spec § 10).
 */
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
      {state === "connected" ? null : (
        <>
          <span className="connection-banner__message">
            <ConnectionMessage state={state} lastEventAt={lastEventAt} attempt={attempt} />
          </span>
          {onRetry ? (
            <button type="button" className="connection-banner__retry" onClick={onRetry}>
              Retry now
            </button>
          ) : null}
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
}: {
  readonly state: Exclude<ConnectionState, "connected">;
  readonly lastEventAt: string | number | undefined;
  readonly attempt: number | undefined;
}): ReactNode {
  switch (state) {
    case "reconnecting": {
      const attemptText = formatAttempt(attempt);
      const eventTime = formatEventTime(lastEventAt);

      return (
        <>
          Reconnecting to stream
          {attemptText === null ? null : (
            <>
              {" · "}
              <span className="mono">attempt {attemptText}</span>
            </>
          )}
          {eventTime === null ? null : (
            <>
              {" · "}
              <span className="mono">last event {eventTime}</span>
            </>
          )}
        </>
      );
    }
    // Fixed string, with no attempt or last-event fragment: once the stream is
    // gone the age of the last event is a detail beside the fact that nothing
    // on screen is current, and § 5 fixes this sentence exactly.
    case "disconnected":
      return <>Stream disconnected · showing last known state (may be stale)</>;
  }
}
