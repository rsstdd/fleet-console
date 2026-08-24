// Theme names are configuration because tenant profiles select one. Their visual
// values live in styles/tokens.ts, the one authored token source consumed by MUI
// and the tokens.css generator (ADR 5).

/**
 * The tenant colour schemes the console ships with.
 *
 * The array is the declaration and the union is derived from it, so
 * `tenant.ts` can validate a profile's `theme` against exactly the palettes
 * that exist here — a profile naming a scheme with no colours behind it is a
 * build failure rather than an undefined lookup.
 */
export const TENANT_THEMES = ["dark", "light"] as const;

/** Selects a tenant colour scheme across tenant configuration and the web theme and token layers. */
export type TenantTheme = (typeof TENANT_THEMES)[number];
