import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreshnessLabel } from "@/components/freshnessLabel";

describe("FreshnessLabel", () => {
  it("names the freshness state in words, not colour alone", () => {
    render(<FreshnessLabel freshness="unreachable" suppressed={false} />);
    expect(screen.getByText("UNREACHABLE")).toBeInTheDocument();
  });

  it("suppresses the label while the stream is down and says why to a screen reader", () => {
    render(<FreshnessLabel freshness="live" suppressed />);
    expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
    expect(screen.getByText(/Freshness unavailable while disconnected/)).toBeInTheDocument();
  });
});
