import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataPlate } from "./dataPlate";

describe("DataPlate", () => {
  it("renders its children in a div by default", () => {
    render(<DataPlate>Fleet snapshot · source: fleet-api</DataPlate>);

    const plate = screen.getByText("Fleet snapshot · source: fleet-api");
    expect(plate.tagName).toBe("DIV");
    expect(plate).toHaveClass("data-plate");
  });

  it("carries the caption in the semantic element the caller names", () => {
    render(<DataPlate as="footer">generated at 09:41:02Z</DataPlate>);

    expect(screen.getByText("generated at 09:41:02Z").tagName).toBe("FOOTER");
  });

  it("appends the caller's className after its own", () => {
    render(<DataPlate className="chart-caption">window · UTC</DataPlate>);

    expect(screen.getByText("window · UTC")).toHaveClass("data-plate", "chart-caption");
  });
});
