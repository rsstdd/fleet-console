import type { ReactElement } from "react";

/**
 * Presentation vocabulary accepted by the token-backed status primitive; domain
 * interpretation remains in the data layers.
 *
 * Coupling: `utils/robotSelectors.ts` mirrors this union as
 * `StatusPresentationVariant` because the sibling layers cannot import one another.
 */
export type StatusVariant = "neutral" | "active" | "charging" | "degraded" | "fault" | "unknown";

export type StatusChipSize = "small" | "medium";

export interface StatusChipProps {
  readonly variant: StatusVariant;
  /**
   * Required, and never derivable from `variant` alone: colour is not permitted
   * to carry meaning on its own, so a chip with no label renders nothing at all.
   */
  readonly label: string;
  /**
   * false renders the outline-only "last known" treatment. The caller is
   * responsible for including "(last known)" in `label` — this component
   * only supplies the visual distinction, not the wording.
   */
  readonly isCurrent: boolean;
  readonly size?: StatusChipSize;
  readonly className?: string;
}

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
