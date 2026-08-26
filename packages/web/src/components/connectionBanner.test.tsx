import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionBanner } from "@/components/connectionBanner";

describe("ConnectionBanner", () => {
  it("says nothing while the stream is healthy", () => {
    render(<ConnectionBanner connection="connected" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("warns that values are last known while reconnecting", () => {
    render(<ConnectionBanner connection="reconnecting" />);
    expect(screen.getByRole("status")).toHaveTextContent(/last known, not current/i);
  });

  it("warns once disconnected", () => {
    render(<ConnectionBanner connection="disconnected" />);
    expect(screen.getByRole("status")).toHaveTextContent(/last known, not current/i);
  });
});
