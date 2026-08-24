import { type ReactElement } from "react";

/** Display states supplied by the server-derived freshness read model. */
export type FreshnessState = "live" | "stale" | "unreachable" | "unknown";

/** Display-only inputs for a freshness label and its optional receipt time. */
export interface FreshnessLabelProps {
  readonly state: FreshnessState;
  /** ISO 8601 source time, or null only when the robot has never reported. */
  readonly asOf: string | null;
  /** ISO 8601 receipt time for surfaces where transport delay matters. */
  readonly receivedAt?: string;
  /** Chip only vs chip + formatted time. Compact is intended for table cells. */
  readonly isCompact?: boolean;
  readonly className?: string;
}

const STATE_LABEL: Record<FreshnessState, string> = {
  live: "Live",
  stale: "Stale",
  unreachable: "Unreachable",
  unknown: "Unknown",
};

/** True in dev and test builds; `import.meta.env` is Vite's boundary, `process` does not exist in the browser bundle. */
function isDevelopment(): boolean {
  return import.meta.env.DEV;
}

function formatTimestamp(value: string, field: "asOf" | "receivedAt"): string | null {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    if (isDevelopment()) {
      throw new Error(`FreshnessLabel: invalid ${field} timestamp "${value}"`);
    }
    return null;
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
    hour12: false,
  }).format(parsed);
}

/**
 * Presentational freshness chip. Displays live | stale | unreachable | unknown
 * plus the observation time when there is one — `asOf` is null for a robot that
 * has never reported, and the time fragment is then omitted rather than faked.
 * Does not compute freshness.
 *
 * Styling is entirely in `styles/global.css`, keyed off the `freshness--<state>` modifier.
 * It used to be here as well, in inline style objects that duplicated — and silently
 * overrode — the stylesheet's own rules, which had drifted to class names this component
 * stopped rendering (`packages/FIXME.md` **F8**). One place per decision is Principle 8's
 * point, and a component that carries its own colours cannot be re-themed by a token.
 */
export function FreshnessLabel({
  state,
  asOf,
  receivedAt,
  isCompact = false,
  className,
}: FreshnessLabelProps): ReactElement {
  const asOfFormatted = isCompact || asOf === null ? null : formatTimestamp(asOf, "asOf");
  const receivedAtFormatted =
    isCompact || receivedAt === undefined ? null : formatTimestamp(receivedAt, "receivedAt");
  const classNames = ["freshness", `freshness--${state}`, className].filter(Boolean).join(" ");

  return (
    <span className={classNames}>
      <span className="freshness__dot" aria-hidden="true" />
      <span className="freshness__label">{STATE_LABEL[state]}</span>
      {asOfFormatted !== null ? (
        <span className="freshness__asOf mono">
          {" · "}
          {asOfFormatted}
        </span>
      ) : null}
      {receivedAtFormatted !== null ? (
        <span className="freshness__received mono">
          {" (recv: "}
          {receivedAtFormatted}
          {")"}
        </span>
      ) : null}
    </span>
  );
}
