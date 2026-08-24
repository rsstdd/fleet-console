// Tenant palettes. Raw colour literals are permitted here and nowhere above it:
// src/config is the layer PRINCIPLES.md 8 names for repeated visual decisions,
// and PRINCIPLES.md 13 puts tenant branding in typed configuration rather than
// in components. Consumed by `src/app/theme.ts`, whose `buildMuiTheme` reads
// these values into the MUI theme while `tokens.css` carries the same palette as
// custom properties; `applyTenantTheme` picks which of the two the document uses.
//
// This module holds data only, no logic (see packages/web/AGENTS.md). The
// validation PRINCIPLES.md 13 also calls for lives in `tenant.ts`, which decodes
// every shipped profile at module load against a schema built from the theme
// names below (ADR 17).

/**
 * The tenant colour schemes the console ships with.
 *
 * The array is the declaration and the union is derived from it, so
 * `tenant.ts` can validate a profile's `theme` against exactly the palettes
 * that exist here — a profile naming a scheme with no colours behind it is a
 * build failure rather than an undefined lookup.
 */
export const TENANT_THEMES = ["dark", "light"] as const;

/** One of the tenant colour schemes. */
export type TenantTheme = (typeof TENANT_THEMES)[number];

/** Colour values per tenant theme; the one module where raw hex literals are permitted. */
export const TENANT_PALETTE = {
  dark: {
    bg: "#141816",
    surface: "#1c211e",
    ink: "#e8e6e1",
    inkSoft: "#c5c2b8",
    inkMuted: "#8e8b82",
    accent: "#c2a671",
    accentHover: "#a8905e",
    onAccent: "#141816",
    line: "#2e3430",
  },
  light: {
    bg: "#f4f2ec",
    surface: "#ffffff",
    ink: "#1a1d1b",
    inkSoft: "#3d4240",
    inkMuted: "#6b6860",
    accent: "#a67c3a",
    accentHover: "#8f6a30",
    onAccent: "#ffffff",
    line: "#d9d4c8",
  },
} as const satisfies Record<TenantTheme, Record<string, string>>;
