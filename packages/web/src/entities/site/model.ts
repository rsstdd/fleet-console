/**
 * Site hierarchy is one level for this submission — robots belong directly
 * to a site, no deeper grouping. See project outline §6.
 *
 * Still fixture-backed, and now the only place in the console that is. The fleet manifest
 * the server loads carries a `siteId` per robot and no label for it, so a display name has
 * no source: `packages/FIXME.md` **F16** records the gap and the two ways to close it.
 */
export interface Site {
  readonly id: string;
  readonly label: string;
}

/** The sites this console knows how to name. Fixture-backed; see the file comment. */
export const SITES: readonly Site[] = [
  { id: "zone-a", label: "Zone A" },
  { id: "zone-b", label: "Zone B" },
  { id: "zone-c", label: "Zone C" },
  { id: "dock-a3", label: "Dock A3" },
];

/**
 * Resolves a site's display name, falling back to the raw identifier.
 *
 * The fallback is deliberate and is what makes an unnamed site render as `SITE-NORTH`
 * rather than as blank: the manifest can register a site this fixture has never heard of,
 * and an operator is better served by the identifier than by nothing (Principle 4).
 */
export function selectSiteLabel(siteId: string): string {
  return SITES.find((site) => site.id === siteId)?.label ?? siteId;
}
