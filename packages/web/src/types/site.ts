import type { FleetSite } from "@fleet/contracts";

/**
 * Site hierarchy is one level — robots belong directly to a site, no deeper
 * grouping (project outline §6).
 *
 * Labels come from the snapshot's site directory and nowhere else (ADR 34).
 * The fixture table that used to live here named four sites no deployment ever
 * produced; it is gone, and with it the console's ability to invent a label.
 * Label resolution itself is `selectSiteLabel` in `utils/siteLabel.ts`.
 */

/** One site as the console knows it: the contract's directory entry. */
export type Site = FleetSite;
