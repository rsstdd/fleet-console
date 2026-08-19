import { type CSSProperties, type ReactElement } from "react";

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
  readonly compact?: boolean;
  readonly className?: string;
}

const STATE_LABEL: Record<FreshnessState, string> = {
  live: "Live",
  stale: "Stale",
  unreachable: "Unreachable",
  unknown: "Unknown",
};

const ROOT_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "baseline",
  flexWrap: "wrap",
  gap: "var(--space-1)",
  padding: "0.25rem 0.6rem",
  border: "1px solid transparent",
  borderRadius: "var(--radius-sm)",
  maxWidth: "100%",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--text-caption)",
  lineHeight: "var(--leading-snug)",
  fontVariantNumeric: "tabular-nums",
  color: "var(--ink)",
};

const STATE_STYLE: Record<FreshnessState, CSSProperties> = {
  live: { color: "var(--ink)", opacity: 1 },
  stale: { color: "var(--ink-soft)", opacity: 1 },
  unreachable: { color: "var(--ink-muted)", opacity: 1 },
  unknown: { color: "var(--ink-muted)", opacity: 1 },
};

const DOT_STYLE: CSSProperties = {
  display: "inline-block",
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  flexShrink: 0,
  alignSelf: "center",
  backgroundColor: "var(--status-neutral)",
};

const DOT_STATE_STYLE: Record<FreshnessState, CSSProperties> = {
  live: { backgroundColor: "var(--status-active)" },
  stale: { backgroundColor: "var(--ink-soft)" },
  unreachable: { backgroundColor: "var(--ink-muted)" },
  unknown: { backgroundColor: "var(--ink-muted)" },
};

const AS_OF_STYLE: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
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
 * plus the required observation time. Does not compute freshness.
 */
export function FreshnessLabel({
  state,
  asOf,
  receivedAt,
  compact = false,
  className,
}: FreshnessLabelProps): ReactElement {
  const asOfFormatted = compact || asOf === null ? null : formatTimestamp(asOf, "asOf");
  const receivedAtFormatted =
    compact || receivedAt === undefined ? null : formatTimestamp(receivedAt, "receivedAt");
  const classNames = ["freshness", `freshness--${state}`, className].filter(Boolean).join(" ");

  return (
    <span className={classNames} style={{ ...ROOT_STYLE, ...STATE_STYLE[state] }}>
      <span
        className="freshness__dot"
        style={{ ...DOT_STYLE, ...DOT_STATE_STYLE[state] }}
        aria-hidden="true"
      />
      <span className="freshness__label">{STATE_LABEL[state]}</span>
      {asOfFormatted !== null ? (
        <span
          className="freshness__asOf mono"
          style={{
            ...AS_OF_STYLE,
            textDecoration: state === "stale" ? "underline dotted" : undefined,
            textUnderlineOffset: state === "stale" ? "2px" : undefined,
          }}
        >
          {" · "}
          {asOfFormatted}
        </span>
      ) : null}
      {receivedAtFormatted !== null ? (
        <span className="freshness__received mono" style={AS_OF_STYLE}>
          {" (recv: "}
          {receivedAtFormatted}
          {")"}
        </span>
      ) : null}
    </span>
  );
}

export default FreshnessLabel;
