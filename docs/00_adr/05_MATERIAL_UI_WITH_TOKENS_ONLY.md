# ADR 5 — Material UI With a Token Layer, No Second Styling System

**Decision:** Material UI is the component library, styled through a generated CSS custom property token layer, with dark/light tied to tenant profiles and no second styling system.
**Status:** Decided · 2026-08-19 · Partial
**Group:** Presentation / cross-cutting (styling, theming, accessibility of visual state).

## Issue

React and Material UI are the confirmed stack. White-label deployment requires per-tenant theming. UI inconsistency is a live pain point named directly in the problem framing.

Three questions follow, and this ADR resolves them together because they are not independent. How does theming get wired, given that MUI reads from a theme object rather than CSS custom properties? How is tenant variation, which includes dark and light, expressed without becoming scattered conditionals? And what mechanism keeps the inconsistency pain from recurring here, given that lint enforcement is the standing answer to how a rule survives an agent that has not read the document?

## Assumptions

- Dark and light are deployment decisions rather than user preferences. No operator in this deployment needs to override the theme their tenant was configured with, which is why the absence of a preference store is a decision rather than an omission.
- Exactly two tenant profiles exist for this build — Tenant A dark, Tenant B light — so the token layer needs two complete value sets rather than an open-ended mechanism for generating more.
- IBM Plex Sans and IBM Plex Mono share metrics and design intent closely enough with the originally specified faces that substituting them costs nothing in visual character.

## Constraints

- React and Material UI are the confirmed stack. A replacement component framework is not a live option regardless of technical merit, which removes an entire class of alternative from Positions below.
- The repository is public and MIT licensed, so a commercially licensed typeface is unusable and a webfont served from an external CDN is an unwanted runtime dependency.
- No dependency is added without an ADR, per the standing rule in `CLAUDE.md`. Adding a styling library alongside MUI would need its own record, and this ADR declines to open one.
- Enforcement has to cover both TypeScript and CSS files. Neither ESLint nor Stylelint reaches both, so the token rule is necessarily two rules in two tools rather than one.

## Decision

Material UI is the component library at its installed version. A single TypeScript module, `src/styles/tokens.ts`, exports the literal values; a boot-time function emits the CSS custom properties into `tokens.css` from it, and `createTheme` consumes the same exports, so the stylesheet the browser reads and the theme object MUI reads both derive from one authored source rather than from each other. `tokens.ts` is authored. `tokens.css` is generated.

Dark and light are the two tenant profiles rather than a user preference — Tenant A dark, Tenant B light — switched together with wordmark and feature flags from `config` at boot, with no `localStorage` persistence and no `prefers-color-scheme` fallback. Typography is IBM Plex Sans and IBM Plex Mono, both open-licensed.

UI consistency is enforced, not only described. An ESLint rule rejects raw hex and raw pixel literals in `app`, `features`, `entities`, and `shared/ui` with `src/styles/tokens.ts` as the sole exemption, and a parallel Stylelint rule rejects raw hex and raw `rgb()`/`hsl()` in every stylesheet outside `tokens.css`, so between them the two tools cover both file types that neither reaches alone. No second styling system — Tailwind, styled-components, CSS Modules — is introduced alongside MUI.

## Positions

1. **Tailwind, replacing the token-layer-plus-MUI approach entirely.** Rejected: it is a second styling system, which the Decision below rules out, and it discards the component library the stack constraint above already commits to.
2. **A second, independently maintained set of literal values inside `createTheme`, alongside the existing CSS custom properties.** Considered as the naive bridge. Rejected: two token sets with the same intent drift the moment one is edited without the other. That is the class of problem principle 8 exists to prevent, reintroduced one layer up.
3. **MUI's experimental CSS theme variables API (`experimental_extendTheme` with `Experimental_CssVarsProvider`).** A more architecturally correct solution to the same problem, and one that natively supports two colour schemes. Rejected here because it introduces its own `data-mui-color-scheme` attribute and its own `localStorage`-based mode persistence. Both then need reconciling with the tenant-driven `data-theme` attribute and the deliberate absence of persistence decided above — roughly thirty minutes of reconciliation for no corresponding benefit at this scale.
4. **Generate the MUI theme object from the same token values at boot, keeping the token module as the single source.** Chosen.
5. **On typography: keep the original design system's Ministry and EB Garamond, sourced via Typekit.** Rejected on the licensing and CDN constraints above. Replaced with IBM Plex Sans and IBM Plex Mono.
6. **On dark/light as a user preference with `localStorage` persistence and `prefers-color-scheme` support.** Rejected once dark and light were redefined as tenant profiles rather than a preference. A stored preference would silently override a deployment decision, which is the opposite of what tenant configuration is for. This is also why option 3 was rejected: its persistence mechanism assumes exactly the preference model this ADR does not use.

## Argument

Generating the theme from the token module was chosen because the alternative reintroduces the exact drift the token discipline exists to prevent, one layer removed from where anyone would look for it. A reviewer checking `tokens.css` finds no hardcoded colours. `createTheme` diverges anyway.

The CSS theme variables API is the more correct long-term answer, and the cost-benefit against it is about the reconciliation work its persistence model would demand at this scale rather than about the API being wrong, which is why the cheaper option was taken deliberately and the better one left on record for when the constraint changes. Nothing here is load-bearing against it.

The enforcement half — two lint tools covering two file types neither covers alone — exists because the stated pain point was inconsistency in practice, not inconsistency in intent. A token layer nobody is required to use is decoration. The same "documented rule is a suggestion" argument that governs ADR 4's dependency rule governs this one.

## Implications

- Any file introducing a raw hex or pixel literal fails `pnpm lint` immediately, with a message naming principle 8. The rule must be verified working — a deliberate literal added and then removed — before component work begins. An unverified rule here is as bad as an unverified boundary rule in ADR 4.
- The `applyTenant` boot function is the single place tenant, theme, and MUI theme-object generation intersect. If it is not written before the app shell, the shell cannot correctly render either tenant profile, which makes this ADR's remaining implementation a hard prerequisite for feature work.
- `MuiPaper`'s default `variant` should be set to `outlined` in the same `createTheme` call, since MUI's built-in elevation shadow scale has no relationship to this design profile's two-level shadow tokens, and structure comes from hairlines. Setting `MuiPaper.defaultProps.variant` propagates to Menu, Popover, Dialog, Card, Accordion, and every other surface built on Paper. That propagation is the desired outcome given the hairline-structure principle, but it is a deliberate decision rather than a surprise.

## Open questions

- ~~Are `@emotion/react` and `@emotion/styled` still required peers under the installed MUI version?~~
  - **Closed 19 August 2026: yes, both are required and both are present.** MUI v9 still uses Emotion as its style engine; the lean that they were "likely unused in recent release lines" was wrong. They stay in `packages/web`'s dependencies.
- ~~Should `theme.spacing(1)` be set to `4px` to match `--space-1`, or left at MUI's default `8px`?~~
  - **Closed 19 August 2026: left at MUI's default 8px.** See Observed consequences. The lean recorded here was reversed by evidence that did not exist when it was written.

## Observed consequences

- **19 August 2026 — `theme.spacing` stays at MUI's default 8px, reversing this ADR's recorded lean.** The lean ("set `spacing: 4` explicitly, so `sx={{ p: 2 }}` does not render at double the intended value") was written before any UI existed. It now does: `theme.ts` sets no `spacing`, and 108 spacing-unit usages across `packages/web` were authored against the 8px default, concentrated on 1, 2 and 3. Two facts decided it. First, the default already lands on the token scale — `p:1`→8px, `p:2`→16px, `p:3`→24px, `p:4`→32px are all members of the working set (4, 8, 12, 16, 24, 32, 48) — so the feared "double the intended value" does not produce off-scale spacing, only a coarser subset of the scale. Second, switching to `spacing: 4` would halve all 108 values at once and require a visual pass over the whole application to restore its current density, which is a real cost against a mapping nicety. The 4px and 12px steps remain reachable through `var(--space-1)` and `var(--space-3)` for a component that needs them, which is the same escape hatch every other intrinsic value uses.

## Related

- ADR 4 (feature-sliced structure, enforced dependency rule) — external-dependency policies there exist to keep this ADR's token-layer boundary and ADR 4's structural boundary from silently overlapping.
- ADR 1 (canonical model, capability declarations) — owns the six status-chip variants this ADR specifies how to style.
- Principle 9 (boundaries are enforced in the build) — why `StatusChip` prop unions are presentational tokens rather than contract types.
- Principle 8 (design tokens represent repeated decisions; raw literals are lint violations) — this ADR is its primary implementation for the front end.
- Principle 13 (configuration expresses deployment policy; code expresses stable behavior) — governs the dark/light-as-tenant-not-preference half of this decision.
- The stated UI-inconsistency pain point — direct business justification for the enforcement half of this decision.
- Artifact `packages/web/src/styles/tokens.ts` — the single source of design literal values.
- Artifact `packages/web/src/styles/tokens.css`, `global.css` — the generated token layer.
- Artifact `packages/web/eslint.config.js` — the `no-restricted-syntax` hex/pixel rule, scoped to `app`, `features`, `entities`, and `shared/ui` with `tokens.ts` as the sole exemption.
- Artifact `.stylelintrc.json` — the CSS-side token rule, scoped by filename with `tokens.css` exempted.
- Artifact `docs/DESIGN_SYSTEM.md` and `docs/design-system.html` — the design profile these decisions are drawn from.
- Artifact `packages/web/CLAUDE.md` — restates this ADR's no-second-styling-system rule at the operational level.

## Notes

- 19 August 2026: The originally assumed versions (MUI v5, React 18) have been replaced with the installed versions. Verify against the lockfile before this document is shared externally.
- The `applyTenant` function and the `createTheme` bridge are the two pieces of this ADR without code yet.
