import type { ReactNode } from "react";

/**
 * Props for the section index: short index text plus an optional caller class.
 * Children should be brief (e.g. "01 — Capabilities"); the full title belongs in
 * the heading the caller places immediately after.
 */
export interface SectionLabelProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Renders the design-system section index — mono overline plus a decorative accent
 * tick supplied by CSS `::before` — marking the start of a logical block.
 *
 * Deliberately a `div` and never a heading: component spec 03 §9 requires the real
 * `h2`/`h3` to be a separate element owned by the feature, so the section appears in
 * a screen reader's heading list. Do not add `aria-label` or `role="heading"` here to
 * compensate; emit the heading instead (Principle 6). Coupling: the tick geometry and
 * colour live in `.section-label` / `.section-label::before` in `src/styles/global.css`
 * and are token-driven — change the token, then that mapping, per spec §12.
 */
export function SectionLabel({ children, className }: SectionLabelProps): ReactNode {
  return <div className={["section-label", className].filter(Boolean).join(" ")}>{children}</div>;
}
