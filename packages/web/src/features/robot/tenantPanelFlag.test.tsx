import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as TenantModule from "@/config/tenant";

/**
 * The second tenant profile, proved on the page rather than in configuration.
 *
 * `DESIGN_SYSTEM.md` § 1 makes "one panel disabled" part of the tenant axis, and
 * ADR 17 names the flag that does it. Everything else about the flag is tested
 * in `config/tenant.test.ts` and `panelVisibility.test.ts`; what only a rendered
 * page can show is that a robot which *declares* lidar health still gets no
 * lidar panel under a tenant that disabled it.
 *
 * Lives in its own file because it needs the tenant module mocked before the
 * page imports it, and the sibling suite deliberately runs against the shipped
 * tenant.
 */
vi.mock("@/config/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof TenantModule>();
  return { ...actual, TENANT: actual.TENANT_PROFILES["tenant-b"] };
});

const { RobotDetailPage } = await import("./robotDetailPage");

function renderRobot(id: string): void {
  render(
    <MemoryRouter initialEntries={[`/robots/${id}`]}>
      <Routes>
        <Route path="/robots/:id" element={<RobotDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("a tenant that disables a panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides the lidar panel for a robot that declares lidar health", () => {
    // R-055 declares dock and lidar health. Under tenant A both panels render;
    // under tenant B the capability is still declared and the panel is still
    // absent, which is the whole distinction ADR 17 draws.
    renderRobot("R-055");

    const section = screen.getByRole("region", { name: "Capabilities" });
    expect(within(section).getByRole("heading", { name: "Dock" })).toBeInTheDocument();
    expect(within(section).queryByRole("heading", { name: "Lidar" })).toBeNull();
  });

  it("leaves every other declared panel alone", () => {
    // A disabled flag turns off one panel, not the section. R-301 declares
    // water level, which this tenant does not disable.
    renderRobot("R-301");

    const section = screen.getByRole("region", { name: "Capabilities" });
    expect(within(section).getByRole("heading", { name: "Water level" })).toBeInTheDocument();
    expect(within(section).getByRole("heading", { name: "Dock" })).toBeInTheDocument();
  });
});
