import type { ReactElement } from "react";

/** Optional feedback emphasis for a summary metric. */
export type StatTone = "default" | "warning" | "critical";

/** Display-only inputs for one summary metric. */
export interface StatProps {
  readonly label: string;
  readonly value: string | number;
  /**
   * A short qualifier rendered under the label, e.g. `"of 50"` beside a count. Prose,
   * not a second metric: it is never given tone and never announced separately, so
   * anything a reader must be able to compare belongs in its own `Stat`.
   */
  readonly hint?: string;
  readonly tone?: StatTone;
  readonly className?: string;
}

const TONE_CLASS: Record<StatTone, string | null> = {
  default: null,
  warning: "stat--warning",
  critical: "stat--critical",
};

/**
 * Renders value, label, and optional hint in that DOM order (value first),
 * per the accessibility contract in component spec 05. Tone is optional
 * emphasis only — it does not encode the full status taxonomy; use
 * StatusChip in tables for that. Visual coupling: `.stat` rules in
 * `src/styles/global.css` implement the token mapping from component spec 05.
 */
export function Stat({ label, value, hint, tone = "default", className }: StatProps): ReactElement {
  const toneClass = TONE_CLASS[tone];
  const classes = ["stat", toneClass, className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <div className="stat__value mono">{value}</div>
      <div className="stat__label">{label}</div>
      {hint ? <div className="stat__hint">{hint}</div> : null}
    </div>
  );
}
