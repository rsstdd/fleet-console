import { describe, expect, it } from "vitest";

import { TENANT_PROFILES } from "@/config/tenant";
import { selectDisabledPanels } from "./panelVisibility";

describe("selectDisabledPanels", () => {
  it("disables nothing when every panel flag is on", () => {
    expect(selectDisabledPanels({ lidarHealthPanel: true })).toEqual([]);
  });

  it("disables the lidar panel when its flag is off", () => {
    expect(selectDisabledPanels({ lidarHealthPanel: false })).toEqual(["lidarHealth"]);
  });

  it("reads the shipped profiles, so the demo's two tenants really differ", () => {
    // The design system makes "one panel disabled" part of the tenant axis.
    // This is the assertion that keeps that claim true in code rather than in
    // prose (ADR 17).
    expect(selectDisabledPanels(TENANT_PROFILES["tenant-a"].flags)).toEqual([]);
    expect(selectDisabledPanels(TENANT_PROFILES["tenant-b"].flags)).toEqual(["lidarHealth"]);
  });
});
