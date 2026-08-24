import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { RobotBatteryHistory } from "@fleet/contracts";

import type { RobotHistoryState } from "@/hooks/useRobotHistory";

import { BatteryHistoryContent } from "./batteryHistorySection";

/** A window ending at a round instant, so expected coordinates are readable. */
const CAPTURED_AT = 120_000;

/** A well-formed ready response with the given points. */
function buildHistory(
  points: RobotBatteryHistory["points"],
  overrides: Partial<RobotBatteryHistory> = {},
): RobotBatteryHistory {
  return {
    schemaVersion: "1",
    robotId: "R-118",
    capturedAt: CAPTURED_AT,
    windowMs: 60_000,
    maxPoints: 60,
    sourceSampleCount: points.length,
    missingBatterySampleCount: 0,
    points,
    ...overrides,
  };
}

function buildReadyState(value: RobotBatteryHistory): RobotHistoryState {
  return { status: "ready", history: value };
}

describe("BatteryHistoryContent", () => {
  it("labels its loading state instead of rendering an anonymous placeholder", () => {
    render(<BatteryHistoryContent state={{ status: "loading" }} />);

    expect(screen.getByText("Loading battery history…")).toBeInTheDocument();
  });

  it("offers an inline retry for a failed request, wired to the resource's retry", async () => {
    const retry = vi.fn();
    render(<BatteryHistoryContent state={{ status: "error", recoverable: true, retry }} />);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders a contract failure terminally, with no retry to press", () => {
    render(
      <BatteryHistoryContent
        state={{ status: "error", recoverable: false, message: "points: custom" }}
      />,
    );

    expect(screen.getByText(/points: custom/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("states that nothing was retained, which is not a chart of zero", () => {
    render(<BatteryHistoryContent state={buildReadyState(buildHistory([]))} />);

    expect(screen.getByText("No telemetry retained in the last 60 seconds.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("states that samples arrived without battery values, a different absence", () => {
    render(
      <BatteryHistoryContent
        state={buildReadyState(
          buildHistory([], { sourceSampleCount: 5, missingBatterySampleCount: 5 }),
        )}
      />,
    );

    expect(
      screen.getByText("Battery was not reported in the last 60 seconds."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows a single reading as a value and says a trend needs another", () => {
    render(
      <BatteryHistoryContent
        state={buildReadyState(buildHistory([{ receivedAt: 100_000, batteryPercent: 42 }]))}
      />,
    );

    expect(screen.getByText(/42%/)).toBeInTheDocument();
    expect(screen.getByText(/another reading/i)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("plots points on the fixed axes: the window on x, 0–100% on y", () => {
    render(
      <BatteryHistoryContent
        state={buildReadyState(
          buildHistory([
            { receivedAt: 60_000, batteryPercent: 0 },
            { receivedAt: 90_000, batteryPercent: 50 },
            { receivedAt: CAPTURED_AT, batteryPercent: 100 },
          ]),
        )}
      />,
    );

    const chart = screen.getByRole("img", { name: /battery history for R-118/i });
    const polyline = chart.querySelector("polyline");
    // Window start maps to x=0, capture instant to x=600; 100% to y=0, 0% to y=120.
    expect(polyline).toHaveAttribute("points", "0,120 300,60 600,0");
  });

  it("summarizes the chart in text: extremes, latest, window, and sample count", () => {
    render(
      <BatteryHistoryContent
        state={buildReadyState(
          buildHistory(
            [
              { receivedAt: 70_000, batteryPercent: 81 },
              { receivedAt: 90_000, batteryPercent: 64 },
              { receivedAt: 110_000, batteryPercent: 72 },
            ],
            { sourceSampleCount: 40, missingBatterySampleCount: 37 },
          ),
        )}
      />,
    );

    const summary = screen.getByText(/last 60 seconds/i);
    expect(summary).toHaveTextContent(/minimum 64%/i);
    expect(summary).toHaveTextContent(/maximum 81%/i);
    expect(summary).toHaveTextContent(/latest 72%/i);
    expect(summary).toHaveTextContent(/40 samples/i);
  });

  it("captions the chart with the clock the axis actually uses", () => {
    render(
      <BatteryHistoryContent
        state={buildReadyState(
          buildHistory([
            { receivedAt: 70_000, batteryPercent: 80 },
            { receivedAt: 110_000, batteryPercent: 70 },
          ]),
        )}
      />,
    );

    expect(screen.getByText(/server receipt times/i)).toBeInTheDocument();
  });
});
