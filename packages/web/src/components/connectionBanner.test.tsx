import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConnectionBanner } from "./connectionBanner";

/**
 * Contract test for docs/02_component-specs/07_CONNECTION_BANNER.md §4, §5,
 * §9, §10 and the verification table in §11.
 *
 * The live-region assertions are the point of the file. This banner is the only
 * surface still making a true statement about currency while the stream is down
 * (ADR 3), so "the region exists before its message does" and "the copy admits
 * the data is last known" are both safety properties, not styling details.
 */
function banner(): HTMLElement {
  const element = document.querySelector<HTMLElement>("div.connection-banner");
  if (element === null) {
    throw new Error("Expected a connection banner");
  }
  return element;
}

describe("ConnectionBanner", () => {
  it("mounts the live region in every state, including connected (§4)", () => {
    const { rerender } = render(<ConnectionBanner state="connected" />);

    // Present, addressable as a status region, and empty.
    expect(banner()).toHaveAttribute("role", "status");
    expect(banner()).toHaveAttribute("aria-live", "polite");
    expect(banner()).toHaveAttribute("data-connected", "true");
    expect(banner()).toBeEmptyDOMElement();

    const regionWhileConnected = banner();

    rerender(<ConnectionBanner state="reconnecting" />);

    // The same node: a remount would restart the region and lose the
    // announcement, which is the failure §4 exists to prevent.
    expect(banner()).toBe(regionWhileConnected);
    expect(banner()).toHaveAttribute("data-connected", "false");
    expect(banner()).toHaveTextContent("Reconnecting to stream");
  });

  it("never uses assertive, which would interrupt during a reconnect storm (§9)", () => {
    render(<ConnectionBanner state="disconnected" />);

    expect(banner()).not.toHaveAttribute("aria-live", "assertive");
  });

  it("carries the state class so the connected case can be hidden by CSS (§4, §6)", () => {
    for (const state of ["connected", "reconnecting", "disconnected"] as const) {
      const { unmount } = render(<ConnectionBanner state={state} />);
      expect(banner()).toHaveClass("connection-banner", `connection-banner--${state}`);
      // No inline style: every visual decision is a token in global.css (Principle 8).
      expect(banner().getAttribute("style")).toBeNull();
      unmount();
    }
  });

  it("appends the caller's className last", () => {
    render(<ConnectionBanner state="connected" className="extra" />);

    expect(banner().className).toBe("connection-banner connection-banner--connected extra");
  });

  it("renders the reconnecting message with attempt and last event (§5)", () => {
    render(
      <ConnectionBanner state="reconnecting" attempt={2} lastEventAt="2026-08-19T09:41:02.000Z" />,
    );

    expect(banner()).toHaveTextContent("Reconnecting to stream · attempt 2 · last event 09:41:02Z");
  });

  it("accepts epoch milliseconds as well as ISO 8601 (§3)", () => {
    render(
      <ConnectionBanner state="reconnecting" lastEventAt={Date.parse("2026-08-19T09:41:02Z")} />,
    );

    expect(banner()).toHaveTextContent("last event 09:41:02Z");
  });

  it("omits the attempt fragment rather than printing 'attempt undefined' (§10)", () => {
    render(<ConnectionBanner state="reconnecting" lastEventAt="2026-08-19T09:41:02.000Z" />);

    expect(banner()).toHaveTextContent("Reconnecting to stream · last event 09:41:02Z");
    expect(banner()).not.toHaveTextContent("attempt");
  });

  it("omits the time fragment and never renders 'Invalid Date' (§10)", () => {
    render(<ConnectionBanner state="reconnecting" attempt={3} lastEventAt="not a timestamp" />);

    expect(banner()).toHaveTextContent("Reconnecting to stream · attempt 3");
    expect(banner()).not.toHaveTextContent("Invalid Date");
    expect(banner()).not.toHaveTextContent("NaN");
  });

  it("renders the connecting message with attempt and no last-event fragment (§5)", () => {
    // ADR 31: nothing has ever been received, so there is no event whose time would be
    // true — and "reconnecting" would describe a loss that never happened.
    render(
      <ConnectionBanner state="connecting" attempt={2} lastEventAt="2026-08-19T09:41:02.000Z" />,
    );

    expect(banner()).toHaveTextContent("Connecting to stream · attempt 2");
    expect(banner()).not.toHaveTextContent("last event");
  });

  it("names an exhausted initial probe rather than a generic disconnect (§5)", () => {
    render(<ConnectionBanner state="disconnected" terminalCause="handshake-exhausted" />);

    expect(banner()).toHaveTextContent("Unable to connect to stream after 3 attempts");
  });

  it("names a stream integrity error and that shown data is last known (§5)", () => {
    // ADR 31: the snapshot and the stream disagree about which server runtime they
    // describe; that is not a retryable outage and the copy must not claim one.
    render(<ConnectionBanner state="disconnected" terminalCause="session-mismatch" />);

    expect(banner()).toHaveTextContent(
      "Stream integrity error · showing last known state (may be stale)",
    );
  });

  it("keeps the retry control in every terminal state (§8)", async () => {
    // ADR 31 pairs every terminal state with an immediate manual retry; a dead end with
    // no control would strand the operator.
    const onRetry = vi.fn();
    render(
      <ConnectionBanner state="disconnected" terminalCause="session-mismatch" onRetry={onRetry} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry now" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("states that disconnected data is last known and may be stale (§5)", () => {
    render(
      <ConnectionBanner state="disconnected" attempt={4} lastEventAt="2026-08-19T09:41:02Z" />,
    );

    // Fixed copy: no attempt or last-event fragment once the stream is gone.
    expect(banner()).toHaveTextContent(
      "Stream disconnected · showing last known state (may be stale)",
    );
    expect(banner()).not.toHaveTextContent("attempt");
  });

  it("renders a real button named 'Retry now' that invokes onRetry (§9, §11)", async () => {
    const onRetry = vi.fn();
    render(<ConnectionBanner state="reconnecting" attempt={1} onRetry={onRetry} />);

    const retry = screen.getByRole("button", { name: "Retry now" });
    await userEvent.click(retry);

    // Invoked directly, once, with no debounce of its own (§8).
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders the message with no control when onRetry is absent (§10)", () => {
    render(<ConnectionBanner state="disconnected" />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(banner()).toHaveTextContent("Stream disconnected");
  });

  it("does not steal focus when the connection drops (§9)", async () => {
    const { rerender } = render(
      <>
        <input aria-label="Filter" />
        <ConnectionBanner state="connected" onRetry={() => undefined} />
      </>,
    );

    const input = screen.getByLabelText("Filter");
    await userEvent.click(input);
    expect(document.activeElement).toBe(input);

    rerender(
      <>
        <input aria-label="Filter" />
        <ConnectionBanner state="disconnected" attempt={1} onRetry={() => undefined} />
      </>,
    );

    // The operator's caret stays where they put it: the banner announces
    // through the live region instead of grabbing focus, even though it just
    // grew a focusable control.
    expect(document.activeElement).toBe(input);
  });
});
