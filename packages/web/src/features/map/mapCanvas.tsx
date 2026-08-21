import type { ReactNode } from "react";
import { Typography } from "@mui/material";

import type { MapMarker, ViewBoxSize } from "@/entities/robot/selectors";

/*
 * Computation-free SVG canvas: every marker arrives projected and coloured
 * (page spec 04 § 7, ADR 35). Not interactive — the side list is the
 * activation path (Principle 6). Primitive SVG, no map SDK (ADR 22).
 */

/** Drawn coordinate width; height follows the extents' aspect ratio (`computeViewBoxSize`). */
export const MAP_VIEWBOX_WIDTH = 600;

// ViewBox units: a CSS length cannot describe a coordinate-space radius (ADR 33 precedent).
const MARKER_RADIUS = 8;
const MARKER_STROKE_WIDTH = 2;

/** What the canvas draws; every field is derived upstream (page spec 04 § 7). */
export interface MapCanvasProps {
  readonly markers: readonly MapMarker[];
  /** Null renders the empty-canvas message. */
  readonly viewBox: ViewBoxSize | null;
  readonly siteLabel: string;
  readonly positionedCount: number;
  readonly totalCount: number;
}

/**
 * Renders the site's positioned robots as markers, or an empty message when
 * there are no bounds to draw (ADR 35).
 */
export function MapCanvas({
  markers,
  viewBox,
  siteLabel,
  positionedCount,
  totalCount,
}: MapCanvasProps): ReactNode {
  if (viewBox === null) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        No positioned robots in {siteLabel}.
      </Typography>
    );
  }

  return (
    <svg
      role="img"
      aria-label={`Map of ${siteLabel}: ${String(positionedCount)} of ${String(totalCount)} robots positioned`}
      viewBox={`0 0 ${String(viewBox.width)} ${String(viewBox.height)}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "var(--map-height)", display: "block" }}
    >
      <rect
        x="0"
        y="0"
        width={viewBox.width}
        height={viewBox.height}
        fill="none"
        stroke="var(--line)"
        vectorEffect="non-scaling-stroke"
      />
      {markers.map((marker) => (
        <circle
          key={marker.robotId}
          cx={marker.x}
          cy={marker.y}
          r={MARKER_RADIUS}
          fill={marker.hollow ? "none" : `var(--status-${marker.variant})`}
          stroke={`var(--status-${marker.variant})`}
          strokeWidth={MARKER_STROKE_WIDTH}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
