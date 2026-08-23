import { render, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as TenantModule from "@/config/tenant";
import { createFixtureFetch } from "./robotDetailFixtures";

/**
 * The page fetches; these tests stub `fetch` rather than the hook.
 *
 * Stubbing the hook would delete the coverage this suite exists for — the true path
 * from wire bytes through the contract's parser and `fromEnvelope` to the panels — and
 * leave assertions about a value the test itself constructed.
 */
beforeEach(() => {
  vi.stubGlobal("fetch", createFixtureFetch());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

const { RobotDetailPage } = await import("../robotDetailPage");

/**
 * Renders and waits for the fetch to settle.
 *
 * The page loads asynchronously now, so a synchronous assertion would see the
 * loading state and report a missing element rather than a slow one.
 */
async function renderRobot(id: string): Promise<void> {
  render(
    <MemoryRouter initialEntries={[`/robots/${id}`]}>
      <Routes>
        <Route path="/robots/:id" element={<RobotDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

  // The skeleton's own text, because it is the one thing every terminal state removes.
  await waitForElementToBeRemoved(() => screen.queryByText("Loading robot…"));
}

describe("a tenant that disables a panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides the lidar panel for a robot that declares lidar health", async () => {
    // R-118 (vendor A) declares dock and lidar health — B does not, and using B here
    // would have made this pass for the wrong reason. Under tenant A both panels render;
    // under tenant B the capability is still declared and the panel is still
    // absent, which is the whole distinction ADR 17 draws.
    await renderRobot("R-118");

    const section = screen.getByRole("region", { name: "Capabilities" });
    expect(within(section).getByRole("heading", { name: "Dock" })).toBeInTheDocument();
    expect(within(section).queryByRole("heading", { name: "Lidar" })).toBeNull();
  });

  it("leaves every other declared panel alone", async () => {
    // A disabled flag turns off one panel, not the section. R-301 declares
    // water level, which this tenant does not disable.
    await renderRobot("R-301");

    const section = screen.getByRole("region", { name: "Capabilities" });
    expect(within(section).getByRole("heading", { name: "Water level" })).toBeInTheDocument();
    expect(within(section).getByRole("heading", { name: "Dock" })).toBeInTheDocument();
  });
});
