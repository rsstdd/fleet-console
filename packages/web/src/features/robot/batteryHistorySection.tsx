import type { ReactNode } from "react";
import { Alert, Button, Paper, Skeleton, Stack, Typography } from "@mui/material";

import type { RobotBatteryHistory } from "@fleet/contracts";

import { useRobotHistory, type RobotHistoryState } from "@/hooks/useRobotHistory";
import { DataPlate } from "@/components/dataPlate";

import { TENANT } from "@/config/tenant";

import { Section } from "./detailSection";

/**
 * The battery-history section's body: a fixed-axis inline SVG sparkline over
 * the contract's 60-second window, with every async and empty state named
 * (ADR 33, robot detail spec § "Battery history").
 *
 * No chart dependency, by decision: sixty points on two fixed axes is a
 * polyline, and a charting library would bring an animation and interaction
 * surface this section is required not to have. The x-axis runs from
 * `capturedAt − windowMs` to `capturedAt` and the y-axis from 0% to 100%,
 * always — a window with one cluster of points renders that cluster where it
 * happened, not stretched to fill, so two charts side by side are comparable.
 *
 * Every value here is explicitly historical. The section renders identically
 * while the stream is down, because "the last minute as the server received
 * it" is a claim about the past that a dead socket does not invalidate — which
 * is precisely why none of these timestamps feed any freshness display
 * (Principle 4, ADR 3).
 */

/**
 * The drawn coordinate space, in SVG user units.
 *
 * A resolution decision, not a shape one: `preserveAspectRatio="none"` scales x and y
 * independently to fill the rendered box, so the on-screen proportions come from the CSS
 * `width: 100%` / `--sparkline-height` pair and this 5:1 ratio never reaches the viewer.
 * Filling the section is what that mode buys, and the fixed axes — not the ratio — are what
 * make two charts comparable; switch to uniform scaling only to letterbox on purpose. The
 * units still have to be fine enough to draw on: 120 vertical units give a one-percent
 * battery step its own unit, which is what `round` below is sized against, and both strokes
 * carry `vectorEffect="non-scaling-stroke"` because the independent scaling would otherwise
 * thicken them along one axis. ADR 33 fixes the window and the point budget, not these.
 */
const CHART_WIDTH = 600;
const CHART_HEIGHT = 120;

/** Maps one point onto the fixed axes: window position on x, charge on y. */
function toCoordinates(
  point: RobotBatteryHistory["points"][number],
  history: RobotBatteryHistory,
): { x: number; y: number } {
  const windowStart = history.capturedAt - history.windowMs;
  return {
    x: ((point.receivedAt - windowStart) / history.windowMs) * CHART_WIDTH,
    y: (1 - point.batteryPercent / 100) * CHART_HEIGHT,
  };
}

/** Formats a percentage for the textual summary; fractions keep one decimal. */
function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? String(value) : value.toFixed(1)}%`;
}

/** The chart with its accessible name, textual summary, and receipt-time caption. */
function Sparkline({ history }: { readonly history: RobotBatteryHistory }): ReactNode {
  const values = history.points.map((point) => point.batteryPercent);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const latest = values.at(-1) ?? 0;
  const coordinates = history.points
    .map((point) => {
      const { x, y } = toCoordinates(point, history);
      return `${String(round(x))},${String(round(y))}`;
    })
    .join(" ");

  return (
    <Stack component="figure" spacing={1.5} sx={{ m: 0 }}>
      {/*
        The summary is visible prose, not an sr-only twin of the chart: the
        extremes and the latest value are what an operator reads a sparkline
        for, and text serves everyone the polyline serves.
      */}
      <Typography variant="body2">
        Battery over the last {String(history.windowMs / 1_000)} seconds: minimum{" "}
        {formatPercent(minimum)}, maximum {formatPercent(maximum)}, latest {formatPercent(latest)} ·{" "}
        {String(history.sourceSampleCount)} samples retained.
      </Typography>
      <svg
        role="img"
        aria-label={`Battery history for ${history.robotId}: ${formatPercent(minimum)} to ${formatPercent(maximum)} over the last ${String(history.windowMs / 1_000)} seconds`}
        viewBox={`0 0 ${String(CHART_WIDTH)} ${String(CHART_HEIGHT)}`}
        preserveAspectRatio="none"
        className="chart-surface chart-surface--sparkline"
      >
        {/* The full axis frame, so a cluster of points reads against the whole window. */}
        <rect
          x="0"
          y="0"
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          fill="none"
          stroke="var(--line)"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={coordinates}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <DataPlate as="figcaption">
        Server receipt times · 0–100% · window captured at request time
      </DataPlate>
    </Stack>
  );
}

/**
 * Rounds a plotted coordinate to two decimal places.
 *
 * Enough precision that a one-percent battery step stays distinct in a 120-unit space,
 * and few enough digits that the `points` attribute is readable and byte-identical
 * between renders of the same window — an unrounded float writes seventeen digits that
 * move on floating-point noise alone.
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The ready sub-states: empty window, no battery values, one reading, or a chart. */
function ReadyContent({ history }: { readonly history: RobotBatteryHistory }): ReactNode {
  const windowSeconds = String(history.windowMs / 1_000);

  if (history.sourceSampleCount === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        No telemetry retained in the last {windowSeconds} seconds.
      </Typography>
    );
  }

  if (history.points.length === 0) {
    // Samples arrived and none carried a battery value: a different absence
    // from silence, and the contract's counts are what let this section say so.
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Battery was not reported in the last {windowSeconds} seconds.
      </Typography>
    );
  }

  const single = history.points.length === 1 ? history.points[0] : undefined;
  if (single !== undefined) {
    return (
      <Typography variant="body2">
        One reading in the last {windowSeconds} seconds: {formatPercent(single.batteryPercent)}. A
        trend needs another reading.
      </Typography>
    );
  }

  return <Sparkline history={history} />;
}

/**
 * The last minute of battery, fetched once per visit as its own resource
 * (ADR 33). Operator-visible and placed after Summary, per the spec's section
 * order; its failure degrades this section inline and never blanks the page.
 */
export function BatteryHistorySection({ robotId }: { readonly robotId: string }): ReactNode {
  const state = useRobotHistory(robotId, { apiBaseUrl: TENANT.endpoints.apiBaseUrl });

  return (
    <Section index="02" title="Battery history">
      <BatteryHistoryContent state={state} />
    </Section>
  );
}

/**
 * Renders one `RobotHistoryState` exhaustively, inside whatever section frame
 * the caller provides.
 *
 * Coupling: `BatteryHistorySection` above mounts this under the page's
 * "Battery history" `Section` and owns the fetch through `useRobotHistory`;
 * this component is deliberately fetch-free so the full state matrix is
 * testable by construction.
 */
export function BatteryHistoryContent({ state }: { readonly state: RobotHistoryState }): ReactNode {
  switch (state.status) {
    case "loading":
      return (
        <Paper sx={{ p: 3 }} aria-busy="true">
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Loading battery history…
          </Typography>
          <Skeleton variant="rectangular" height="var(--sparkline-height)" />
        </Paper>
      );

    case "error":
      if (state.recoverable) {
        // The page around this section stays; only the history degrades.
        return (
          <Alert
            severity="warning"
            action={
              <Button color="inherit" size="small" onClick={state.retry}>
                Retry
              </Button>
            }
          >
            Battery history could not be loaded. The server did not answer.
          </Alert>
        );
      }
      return (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Battery history is unavailable: {state.message}
        </Typography>
      );

    case "ready":
      return (
        <Paper sx={{ p: 3 }}>
          <ReadyContent history={state.history} />
        </Paper>
      );
  }
}
