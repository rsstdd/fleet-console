import type { ReactNode } from "react";

/**
 * Consistent title, optional description, and optional action for empty
 * lists, failed filters, or unavailable detail. Does not handle routing or
 * data fetching — see component spec 06.
 */
export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

/**
 * Renders as plain semantic elements (h2 / p / div), never MUI primitives.
 * Component spec 06 §2 permits MUI only inside the caller-supplied `action`
 * node — an MUI `<Button>` passed as `action` is fine; the component's own
 * markup stays plain HTML per §4. Heading level is fixed at h2 because every
 * page using this already owns the single h1; a feature needing a different
 * level amends the spec and adds a typed prop rather than reaching for ARIA
 * or a wrapper, because a silently adjustable level is how outlines rot
 * (Principle 6). This component never moves focus — whether to focus the
 * action after a filter change is the caller's decision (§9). Coupling: the
 * empty-state__* selectors are mapped to tokens in src/styles/global.css.
 */
export function EmptyState({ title, description, action, className }: EmptyStateProps): ReactNode {
  const classes = ["empty-state", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <h2 className="empty-state__title">{title}</h2>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
