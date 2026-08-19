/**
 * Site hierarchy is one level for this submission — robots belong directly
 * to a site, no deeper grouping. See project outline §6. Fixture-backed for
 * the same reason as entities/robot/useFleetRobots: no real config source
 * exists yet.
 */
export interface Site {
  readonly id: string;
  readonly label: string;
}

export const SITES: readonly Site[] = [
  { id: "zone-a", label: "Zone A" },
  { id: "zone-b", label: "Zone B" },
  { id: "zone-c", label: "Zone C" },
  { id: "dock-a3", label: "Dock A3" },
];

export function selectSiteLabel(siteId: string): string {
  return SITES.find((site) => site.id === siteId)?.label ?? siteId;
}
