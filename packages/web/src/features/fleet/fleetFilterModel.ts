import type { FreshnessState, RobotStatus } from "@fleet/contracts";
import type { Robot } from "@/types/robot";

export interface FleetFilters {
  readonly search: string;
  /** `"all"` is the unfiltered sentinel; any other value is a site id. */
  readonly siteId: string;
  readonly status: RobotStatus | "all";
  readonly freshness: FreshnessState | "all";
}

export const NO_FILTERS: FleetFilters = {
  search: "",
  siteId: "all",
  status: "all",
  freshness: "all",
};

export function applyFilters(robots: readonly Robot[], filters: FleetFilters): readonly Robot[] {
  const search = filters.search.trim().toLowerCase();
  return robots.filter((robot) => {
    if (filters.siteId !== "all" && robot.siteId !== filters.siteId) {
      return false;
    }
    if (filters.status !== "all" && robot.status !== filters.status) {
      return false;
    }
    if (filters.freshness !== "all" && robot.freshness !== filters.freshness) {
      return false;
    }
    if (search === "") {
      return true;
    }
    return (
      robot.id.toLowerCase().includes(search) ||
      robot.vendor.toLowerCase().includes(search) ||
      (robot.model ?? "").toLowerCase().includes(search)
    );
  });
}
