import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FreshnessLabel, type FreshnessState } from "../freshnessLabel";

const ALL_STATES: readonly FreshnessState[] = ["live", "stale", "unreachable", "unknown"];
const STATE_LABELS: Readonly<Record<FreshnessState, string>> = {
  live: "Live",
  stale: "Stale",
  unreachable: "Unreachable",
  unknown: "Unknown",
};

function label(): HTMLElement {
  const element = document.querySelector<HTMLElement>("span.freshness");
  if (element === null) {
    throw new Error("Expected a freshness label");
  }
  return element;
}

describe("FreshnessLabel", () => {
  it("renders every state as visible text with its state class", () => {
    for (const state of ALL_STATES) {
      const { unmount } = render(<FreshnessLabel state={state} asOf={null} />);
      expect(label()).toHaveClass("freshness", `freshness--${state}`);
      expect(label()).toHaveTextContent(STATE_LABELS[state]);
      unmount();
    }
  });

  it("renders no invented time when a robot has never been observed", () => {
    render(<FreshnessLabel state="unknown" asOf={null} />);

    expect(label()).toHaveTextContent("Unknown");
    expect(label().querySelector(".freshness__asOf")).toBeNull();
  });

  it("formats source and receipt timestamps as UTC DOM text", () => {
    render(
      <FreshnessLabel
        state="live"
        asOf="2026-08-19T10:20:30.000Z"
        receivedAt="2026-08-19T10:20:31.000Z"
      />,
    );

    expect(label().querySelector(".freshness__asOf")).toHaveTextContent("19 Aug 2026, 10:20:30");
    expect(label().querySelector(".freshness__received")).toHaveTextContent(
      "(recv: 19 Aug 2026, 10:20:31)",
    );
  });

  it("omits both timestamps in compact mode", () => {
    render(
      <FreshnessLabel
        state="stale"
        asOf="2026-08-19T10:20:30.000Z"
        receivedAt="2026-08-19T10:20:31.000Z"
        compact
      />,
    );

    expect(label()).toHaveTextContent("Stale");
    expect(label().querySelector(".freshness__asOf")).toBeNull();
    expect(label().querySelector(".freshness__received")).toBeNull();
  });

  it("marks a stale label with the modifier the stylesheet keys off", () => {
    // This used to assert `text-decoration: underline dotted` directly. It could, because
    // the component set it inline — duplicating the stylesheet and overriding it. With the
    // rule where it belongs (`.freshness--stale .freshness__asOf` in `global.css`), jsdom
    // cannot evaluate it: it loads no external stylesheet, so asserting the declaration
    // here would have been asserting the test's own fixture.
    //
    // What is left to assert is the component's actual contract — the modifier class — and
    // that is genuinely less coverage than before: nothing now checks that the stylesheet
    // still carries the rule this class keys off. That residual is recorded in
    // `packages/FIXME.md` **F8** rather than papered over, because the honest trade was
    // duplicated-and-overriding styling for one unasserted CSS rule.
    const { rerender } = render(<FreshnessLabel state="stale" asOf="2026-08-19T10:20:30.000Z" />);
    expect(label()).toHaveClass("freshness--stale");
    expect(label().querySelector(".freshness__asOf")).not.toBeNull();

    rerender(<FreshnessLabel state="live" asOf="2026-08-19T10:20:30.000Z" />);
    expect(label()).toHaveClass("freshness--live");
    expect(label()).not.toHaveClass("freshness--stale");
  });

  it("throws for an invalid timestamp in development", () => {
    expect(() => render(<FreshnessLabel state="stale" asOf="not-a-date" />)).toThrow(
      'FreshnessLabel: invalid asOf timestamp "not-a-date"',
    );
  });
});
