import type { Site } from "@/types/site";

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
