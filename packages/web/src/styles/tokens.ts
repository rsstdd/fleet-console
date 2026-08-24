// Every design token the console has, authored here and nowhere else. This module supplies
// MUI's palette and shape value directly and generates `tokens.css` through
// `scripts/generateWebTokens.mjs` (ADR 5): a missing value is added here and the artifact
// regenerated, never worked around with a literal at the call site.
//
// Two tenant profiles — A dark, B light — selected by the `data-theme` attribute
// `app/theme.ts` sets from configuration at boot, never from a user preference. There is
// deliberately no `prefers-color-scheme` block: the theme arrives with the tenant
// configuration, and a system preference would silently override a deployment decision.

import type { TenantTheme } from "../config/tenantTheme.ts";

type TokenMap = Readonly<Record<`--${string}`, string>>;

const PANEL_RADIUS_PX = 6;

/**
 * Values shared by every tenant and emitted into the generated `:root` token block.
 *
 * Type scale, spacing, radii, motion and the layout minimums are shape and timing
 * decisions rather than palette ones, so a tenant switch must not move them — only
 * `THEME_TOKENS` below changes per tenant.
 */
export const SHARED_TOKENS = {
  "--font-sans":
    '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  "--font-mono":
    '"IBM Plex Mono", ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace',
  "--radius-sm": "4px",
  "--radius": `${String(PANEL_RADIUS_PX)}px`,
  "--border-width": "1px",
  "--focus-ring-width": "2px",
  "--focus-ring-offset": "2px",
  "--text-underline-offset": "2px",
  "--status-dot-size": "6px",
  "--visually-hidden-size": "1px",
  "--section-label-line-width": "1.25rem",
  "--section-label-line-height": "2px",
  "--section-label-gap": "0.6rem",
  "--data-plate-spacing": "0.6rem",
  // Component spec 08 §6's compact control height. MUI's `size="small"` alone lands near
  // 39px (13px text at the button variant's 1.75 line height plus 7px padding), so the
  // height is stated rather than inherited.
  "--compact-control-height": "32px",
  // Floors for the fleet filter controls. MUI sizes a Select to its selected value, so
  // without a floor each control resizes as the operator changes it and the whole row
  // reflows under the pointer mid-interaction. The wider floor is for the two controls
  // whose own text is longest — the Reporting status label and the Search placeholder.
  // Both are floors chosen to stop the reflow, not measured label widths.
  "--filter-control-min-width": "140px",
  "--filter-control-wide-min-width": "160px",
  "--gallery-content-max-width": "75rem",
  // Layout minimums used by robot detail: the capability grid's auto-fill track (page
  // spec 03 §4) and the technician raw-payload block's scroll height (§4, "max height
  // constrained").
  "--panel-min-width": "240px",
  "--scroll-block-max-height": "24rem",
  // The battery-history sparkline's rendered height (ADR 33) and the map canvas's (page
  // spec 04 §4, ADR 35). Both drawn coordinate spaces are fixed in their components and
  // scale into these; marker geometry stays a viewBox-unit constant there, because a CSS
  // length cannot describe a coordinate-space radius.
  "--sparkline-height": "6rem",
  "--map-height": "24rem",
  // What the loading skeletons stand in for: one heading-sized line, and a table body.
  "--skeleton-line-height": "3rem",
  "--skeleton-content-height": "15rem",
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-5": "24px",
  "--space-6": "32px",
  "--space-7": "48px",
  "--status-gap": "0.4rem",
  "--status-padding-block": "0.25rem",
  "--status-padding-inline": "0.6rem",
  "--status-small-gap": "0.3rem",
  "--status-small-padding-block": "0.15rem",
  "--status-small-padding-inline": "0.45rem",
  "--duration-fast": "120ms",
  "--duration-normal": "200ms",
  "--ease": "cubic-bezier(0.2, 0, 0, 1)",
  "--text-overline": "0.6875rem",
  "--text-caption": "0.75rem",
  "--text-small": "0.8125rem",
  "--text-body": "0.9375rem",
  "--text-h3": "1rem",
  "--text-h2": "1.25rem",
  "--text-h1": "clamp(1.75rem, 3.5vw, 2.25rem)",
  "--leading-tight": "1.2",
  "--leading-snug": "1.3",
  "--leading-normal": "1.5",
  "--tracking-overline": "0.06em",
  "--tracking-wide": "0.1em",
  // Feedback tokens are aliases, never independent values: two palettes carrying the same
  // colours drift the moment one is adjusted. The tint pairs alias the same way, because
  // ConnectionBanner needs a --warning and an --error surface (component spec 07 §6) and
  // must not reach for a status-* tint directly — a banner is not a robot status, and
  // naming the status token at the call site is how the two palettes start to drift.
  "--success": "var(--status-active)",
  "--warning": "var(--status-degraded)",
  "--error": "var(--status-fault)",
  "--warning-bg": "var(--status-degraded-bg)",
  "--warning-border": "var(--status-degraded-border)",
  "--error-bg": "var(--status-fault-bg)",
  "--error-border": "var(--status-fault-border)",
  "--focus-ring": "var(--accent)",
} as const satisfies TokenMap;

/** Colour values consumed by MUI from the same authored source that generates CSS. */
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

const DARK_THEME_TOKENS = {
  "--bg": TENANT_PALETTE.dark.bg,
  "--surface": TENANT_PALETTE.dark.surface,
  "--surface-raised": "#232925",
  "--surface-sunken": "#101412",
  "--line": TENANT_PALETTE.dark.line,
  "--line-strong": "#3f4742",
  "--ink": TENANT_PALETTE.dark.ink,
  "--ink-soft": TENANT_PALETTE.dark.inkSoft,
  "--ink-muted": TENANT_PALETTE.dark.inkMuted,
  // Accent is tenant-supplied. These are the Tenant A defaults.
  "--accent": TENANT_PALETTE.dark.accent,
  "--accent-hover": TENANT_PALETTE.dark.accentHover,
  "--accent-text": TENANT_PALETTE.dark.accent,
  "--on-accent": TENANT_PALETTE.dark.onAccent,
  // Six status variants, one per state the canonical model can produce. Five map to the
  // status enum (idle, busy, charging, fault, unknown); degraded maps to health
  // severity. No token exists for a state no adapter emits, which is why maintenance
  // and info are absent.
  //
  // --status-neutral was lightened from #6b6560 on 20 August 2026. That value measured
  // 2.84:1 against --surface, below WCAG 1.4.11's 3:1 for non-text UI components, and
  // this token is a freshness dot and a chip — carriers of meaning, even though a word
  // always sits beside them. #767068 measures 3.34:1 here and 3.66:1 against --bg.
  // `scripts/checkTokens.mjs` recomputes the --surface ratio on every `pnpm
  // check:tokens` and fails below 3:1; the --bg figure is recorded here only, because
  // no status token is rendered on --bg today.
  "--status-neutral": "#767068",
  "--status-active": "#3d9b6e",
  "--status-charging": "#3b82a0",
  "--status-degraded": "#c4a035",
  "--status-fault": "#c75138",
  "--status-unknown": "#8e8b82",
  "--status-neutral-bg": "rgba(118, 112, 104, 0.15)",
  "--status-neutral-border": "rgba(118, 112, 104, 0.3)",
  "--status-active-bg": "rgba(61, 155, 110, 0.12)",
  "--status-active-border": "rgba(61, 155, 110, 0.28)",
  "--status-charging-bg": "rgba(59, 130, 160, 0.12)",
  "--status-charging-border": "rgba(59, 130, 160, 0.3)",
  "--status-degraded-bg": "rgba(196, 160, 53, 0.12)",
  "--status-degraded-border": "rgba(196, 160, 53, 0.28)",
  "--status-fault-bg": "rgba(199, 81, 56, 0.12)",
  "--status-fault-border": "rgba(199, 81, 56, 0.3)",
  "--status-unknown-bg": "rgba(142, 139, 130, 0.12)",
  "--status-unknown-border": "rgba(142, 139, 130, 0.28)",
  "--header-bg": "rgba(20, 24, 22, 0.92)",
  "--row-hover": "rgba(255, 255, 255, 0.025)",
  "--overlay": "rgba(0, 0, 0, 0.55)",
  "--shadow-1": "0 1px 2px rgba(0, 0, 0, 0.24)",
  "--shadow-2": "0 4px 16px rgba(0, 0, 0, 0.32)",
} as const satisfies TokenMap;

type ThemeTokenName = keyof typeof DARK_THEME_TOKENS;

const LIGHT_THEME_TOKENS = {
  "--bg": TENANT_PALETTE.light.bg,
  "--surface": TENANT_PALETTE.light.surface,
  "--surface-raised": "#ffffff",
  "--surface-sunken": "#ebe8e0",
  "--line": TENANT_PALETTE.light.line,
  "--line-strong": "#c4bdb0",
  "--ink": TENANT_PALETTE.light.ink,
  "--ink-soft": TENANT_PALETTE.light.inkSoft,
  "--ink-muted": TENANT_PALETTE.light.inkMuted,
  "--accent": TENANT_PALETTE.light.accent,
  "--accent-hover": TENANT_PALETTE.light.accentHover,
  "--accent-text": TENANT_PALETTE.light.accentHover,
  "--on-accent": TENANT_PALETTE.light.onAccent,
  "--status-neutral": "#5a554f",
  "--status-active": "#2f7d56",
  "--status-charging": "#2e6a86",
  "--status-degraded": "#a67c1a",
  "--status-fault": "#b33e2a",
  "--status-unknown": "#6b6860",
  "--status-neutral-bg": "rgba(90, 85, 79, 0.1)",
  "--status-neutral-border": "rgba(90, 85, 79, 0.25)",
  "--status-active-bg": "rgba(47, 125, 86, 0.1)",
  "--status-active-border": "rgba(47, 125, 86, 0.28)",
  "--status-charging-bg": "rgba(46, 106, 134, 0.1)",
  "--status-charging-border": "rgba(46, 106, 134, 0.28)",
  "--status-degraded-bg": "rgba(166, 124, 26, 0.1)",
  "--status-degraded-border": "rgba(166, 124, 26, 0.28)",
  "--status-fault-bg": "rgba(179, 62, 42, 0.1)",
  "--status-fault-border": "rgba(179, 62, 42, 0.28)",
  "--status-unknown-bg": "rgba(107, 104, 96, 0.1)",
  "--status-unknown-border": "rgba(107, 104, 96, 0.25)",
  "--header-bg": "rgba(244, 242, 236, 0.92)",
  "--row-hover": "rgba(0, 0, 0, 0.025)",
  "--overlay": "rgba(26, 29, 27, 0.4)",
  "--shadow-1": "0 1px 2px rgba(26, 29, 27, 0.06)",
  "--shadow-2": "0 4px 16px rgba(26, 29, 27, 0.1)",
} as const satisfies Readonly<Record<ThemeTokenName, string>>;

/** Complete tenant blocks whose shared key type prevents cross-theme fallback leaks. */
export const THEME_TOKENS = {
  dark: DARK_THEME_TOKENS,
  light: LIGHT_THEME_TOKENS,
} as const satisfies Record<TenantTheme, Readonly<Record<ThemeTokenName, string>>>;

/** Numeric form of `--radius` required by MUI's border-radius multiplier. */
export const MUI_SHAPE_BORDER_RADIUS = PANEL_RADIUS_PX;
