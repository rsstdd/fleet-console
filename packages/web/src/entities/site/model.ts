import type { FleetSite } from "@fleet/contracts";

/**
 * Site hierarchy is one level — robots belong directly to a site, no deeper
 * grouping (project outline §6).
 *
 * Labels come from the snapshot's site directory and nowhere else (ADR 34).
 * The fixture table that used to live here named four sites no deployment ever
 * produced; it is gone, and with it the console's ability to invent a label.
 */

/** One site as the console knows it: the contract's directory entry. */
export type Site = FleetSite;

/**
 * Resolves a site's display name from the snapshot directory, falling back to
 * the raw identifier.
 *
 * The fallback is transient by construction: `fleetSnapshotSchema` rejects a
 * robot referencing an undefined site (ADR 34), so a decoded fleet always
 * resolves. The raw id appears only on surfaces rendering before the directory
 * has arrived, where an identifier still serves an operator better than blank
 * (Principle 4).
 */
export function selectSiteLabel(siteId: string, sites: readonly Site[]): string {
  return sites.find((site) => site.siteId === siteId)?.label ?? siteId;
}
