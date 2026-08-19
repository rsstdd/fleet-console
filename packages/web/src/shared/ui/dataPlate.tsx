import type { ElementType, ReactNode } from "react";

export interface DataPlateProps {
  readonly children: ReactNode;
  readonly as?: "div" | "footer" | "figcaption";
  readonly className?: string;
}

const DEFAULT_ELEMENT = "div" satisfies DataPlateProps["as"];

export function DataPlate({ children, as, className }: DataPlateProps): ReactNode {
  const Component: ElementType = as ?? DEFAULT_ELEMENT;
  const classes = ["data-plate", className].filter(Boolean).join(" ");

  return <Component className={classes}>{children}</Component>;
}
