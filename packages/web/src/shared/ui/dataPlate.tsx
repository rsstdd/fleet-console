import type { ElementType, ReactNode } from "react";

/**
 * Inputs for a data plate: the content, and which element carries it.
 *
 * `as` is constrained to three tags rather than left open. A plate is a caption for the
 * data beside it, and the choice between `div`, `footer` and `figcaption` is about what a
 * screen reader announces around it — not a styling hook.
 */
export interface DataPlateProps {
  readonly children: ReactNode;
  readonly as?: "div" | "footer" | "figcaption";
  readonly className?: string;
}

const DEFAULT_ELEMENT = "div" satisfies DataPlateProps["as"];

/** Mono caption for the figures beneath a table or a live snapshot. */
export function DataPlate({ children, as, className }: DataPlateProps): ReactNode {
  const Component: ElementType = as ?? DEFAULT_ELEMENT;
  const classes = ["data-plate", className].filter(Boolean).join(" ");

  return <Component className={classes}>{children}</Component>;
}
