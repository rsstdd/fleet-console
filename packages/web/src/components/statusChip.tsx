import type { ReactElement } from "react";

/**
 * StatusChip — pure presentational status indicator.
 * Spec: docs/02_component-specs/01_STATUS_CHIP.md (revision 2).
 *
 * Six variants only, matching the canonical status enum (idle, busy,
 * charging, fault, unknown) plus health severity (degraded). There is no
 * token, and therefore no variant, for a state no adapter can produce —
 * "maintenance" and "info" from the original design system are gone.
 *
 * Every visual decision — colour, tint, border, type, padding, the dot, the
 * small size and the last-known treatment — comes from the .status classes in
 * global.css, which read the --status-* custom properties in tokens.css. This
 * component contributes no inline style and no second styling system
 * (Principle 8).
 */
export type StatusVariant =
  | "neutral" // idle
  | "active" // busy
  | "charging"
  | "degraded" // health severity, not a vendor status
  | "fault"
  | "unknown";

/** Two sizes: `small` for a table cell, `medium` for a page header. */
export type StatusChipSize = "small" | "medium";

/** Display-only inputs for a status chip; `isCurrent` is what makes it hollow. */
export interface StatusChipProps {
  readonly variant: StatusVariant;
  readonly label: string; // always required; colour alone never carries meaning
  /**
   * false renders the outline-only "last known" treatment. The caller is
   * responsible for including "(last known)" in `label` — this component
   * only supplies the visual distinction, not the wording.
   */
  readonly isCurrent: boolean;
  readonly size?: StatusChipSize;
  readonly className?: string;
}

/** medium is the base .status rule, so only small carries a modifier class. */
const SIZE_CLASS: Record<StatusChipSize, string | null> = {
  small: "status--small",
  medium: null,
};

/**
 * Renders a status chip. Returns null on an empty label rather than an
 * unlabelled dot, since colour alone is never permitted to carry meaning.
 */
export function StatusChip({
  variant,
  label,
  isCurrent,
  size = "medium",
  className,
}: StatusChipProps): ReactElement | null {
  if (!label) {
    return null;
  }

  const classes = [
    "status",
    `status--${variant}`,
    isCurrent ? null : "status--last-known",
    SIZE_CLASS[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes}>{label}</span>;
}
