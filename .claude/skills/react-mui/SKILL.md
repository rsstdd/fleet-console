---
name: react-mui
description: Authoring rules for React components built on MUI (Material UI) v6/v7 — where styles belong (sx vs styled vs slotProps), theme tokens instead of raw units, the Grid v2 API, and CSS theme variables for SSR/RSC. Use when writing, generating, or reviewing any component that imports from @mui/material, or when a change touches theming, sx, styled(), slot overrides, or MUI layout.
---

# React + MUI component authoring

Every rule here resolves against one priority order. When two rules pull apart, the higher
number loses:

1. **Runtime performance** — no per-instance CSS-in-JS work inside loops or hot paths.
2. **Maintainability** — one design-token source; no literal that bypasses the theme.
3. **RSC/SSR correctness** — no style that needs JS to run before it is right.

Load the `clean-code` skill for structure and naming, and the `react` skill when reviewing
rather than writing.

## Establish the version first

`Grid` and the color-scheme API are the two places v6 and v7 disagree, and guessing produces
code that type-checks against the wrong major. Read the installed version before writing:
`grep '"@mui/material"' package.json`.

| Concern              | v6                                        | v7 and later                                        |
| -------------------- | ----------------------------------------- | --------------------------------------------------- |
| Grid v2              | `import Grid2 from '@mui/material/Grid2'` | `import { Grid } from '@mui/material'` — already v2 |
| Legacy grid          | `Grid` (deprecated `item`/`xs` API)       | `GridLegacy` — do not use in new code               |
| CSS theme variables  | `createTheme({ cssVariables: true })`     | same                                                |
| Deprecated vars path | `extendTheme` + `CssVarsProvider`         | removed or aliased — verify the export exists       |
| Slot overrides       | `slots` / `slotProps`                     | same, on more components                            |

`components` / `componentsProps` are the pre-v6 spelling of `slots` / `slotProps`. Never emit them.

## Decision matrix

| Situation                  | Use                                  | Acceptable fallback                      | Banned                                  |
| -------------------------- | ------------------------------------ | ---------------------------------------- | --------------------------------------- |
| One-off layout or spacing  | `sx` on `Box` / the component itself | a utility class                          | inline `style` for styling              |
| Repeated UI                | `styled()` at module scope           | a theme `variants` entry                 | deeply nested `sx`                      |
| Sub-element of a component | `slotProps`                          | a global state class (`& .Mui-selected`) | bare tag/descendant selectors           |
| Grid or layout             | `Grid` (v2) / `Stack`                | `Box` with `display: grid`               | manual percentage widths, `<Grid item>` |
| Per-item dynamic value     | a CSS custom property set in `style` | —                                        | a fresh `sx` object per item            |

## Rules

### 1. No `sx` inside a map

`sx` is not compiled. Every render, `styleFunctionSx` walks the object, resolves theme keys,
serializes the result, and hands it to Emotion — per element. A list of 200 rows with an `sx`
object built in the callback pays that 200 times per render, allocating 200 objects that fail
Emotion's cache because each one is a new identity.

```tsx
// ❌ 200 object allocations + 200 serializations per render
{
  robots.map((robot) => (
    <Box key={robot.id} sx={{ display: "flex", gap: 2, p: 1 }}>
      …
    </Box>
  ));
}

// ✅ serialized once, at module scope; every row shares the class
const Row = styled("li")(({ theme }) => ({
  display: "flex",
  gap: theme.spacing(2),
  padding: theme.spacing(1),
}));

{
  robots.map((robot) => <Row key={robot.id}>…</Row>);
}
```

Corollaries:

- **Never call `styled()` inside a component body.** It creates a new component type on every
  render, so React unmounts and remounts the whole subtree — losing DOM state, focus, and
  scroll position — and re-registers the styles each time. Module scope, always.
- A **state-dependent** style is a prop on one styled component, not a branch that returns two
  different `sx` objects. Keep the prop's value set small and closed — each distinct value is a
  distinct serialization.
- A **truly per-item scalar** (a bar width, an offset, a computed color) goes through a CSS
  custom property, which is the one legitimate use of the `style` attribute:

```tsx
const Bar = styled("div")({ inlineSize: "var(--bar-width)" });

<Bar style={{ "--bar-width": `${percent}%` } as React.CSSProperties} />;
```

- A hoisted module-level `sx` constant is a real improvement over an inline literal — stable
  identity, one cache entry — but it still runs through `styleFunctionSx` on every render.
  Use it for a handful of elements; use `styled()` for anything in a loop.

### 2. Tokens, never raw units

A hardcoded `16px` or `#1a1a1a` is invisible to the theme: it does not follow a color-scheme
switch, a tenant palette, or a density change, and nothing flags it when the scale moves.

```tsx
// ❌
<Box sx={{ padding: "16px", color: "#1a1a1a", borderRadius: "6px" }} />

// ✅ spacing units, palette paths, theme shape
<Box sx={{ p: 2, color: "text.primary", borderRadius: 1 }} />
```

- Spacing shorthands (`p`, `m`, `gap`, `rowGap`) take **multipliers**, not pixels: `p: 2` is
  `theme.spacing(2)` — 16px on the default 8px base. Confirm the base before assuming a mapping.
- Color strings are palette paths — `primary.main`, `text.secondary`, `divider`, `error.dark`.
- Inside `styled()`, reach through the theme: `theme.spacing(2)`, `theme.palette.divider`,
  `theme.shape.borderRadius`, `theme.typography.body2`.
- With `cssVariables` enabled, prefer `theme.vars.palette.divider` — it emits a `var()` reference
  that flips with the scheme instead of a value baked in at render time.
- A value with no token — an intrinsic geometry, a third-party widget's fixed height — gets one:
  add it to the token source, do not inline it.

### 3. Slot overrides, not selector archaeology

`.MuiButton-root > span` couples the component to MUI's internal DOM. A minor release that adds
a wrapper element silently deletes the style, and nothing fails until someone looks at it.

```tsx
// ❌ breaks the moment the internal structure changes
<Button sx={{ "& .MuiButton-root > span": { fontWeight: 600 } }} />

// ✅ addresses the element MUI guarantees
<Button slotProps={{ startIcon: { className: "…" } }} />
<TextField slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }} />
<Tooltip slotProps={{ tooltip: { sx: { maxInlineSize: 240 } } }} />
```

- `slots` swaps the element or component rendered for a slot; `slotProps` passes props to it.
- Global **state** classes are stable API and are fine to target: `& .Mui-disabled`,
  `& .Mui-selected`, `& .Mui-focusVisible`. Import them rather than typing the string —
  `` `&.${buttonClasses.disabled}` ``.
- Repo-wide changes belong in `theme.components.MuiX.styleOverrides` / `defaultProps`, not
  repeated at call sites.
- Pass a custom prop into `styled()` with `shouldForwardProp` so it does not reach the DOM as an
  unknown attribute.

### 4. CSS theme variables for SSR and RSC

A theme resolved in JS means the server renders one palette and the client may compute another:
a flash of the wrong scheme, and a hydration mismatch when a style depends on a value only the
client knows. CSS variables move the decision into the stylesheet, where the browser applies it
before React executes.

```ts
const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: { light: true, dark: true },
});
```

- Wrap with the standard `ThemeProvider`. `extendTheme` + `CssVarsProvider` is the pre-v6 path —
  deprecated, and gone in later majors.
- In Next.js App Router, render `InitColorSchemeScript` in `<body>` before the app so the
  attribute is set on first paint, and use the framework cache provider
  (`@mui/material-nextjs/v15-appRouter`) so Emotion's styles are collected during SSR.
- Emotion needs React context and browser APIs. Any file importing an interactive MUI component
  is a client component (`"use client"`); keep that boundary at the leaf, not on the page, so the
  server tree above it stays server-rendered.
- Do not branch on `useMediaQuery`, `window`, or `matchMedia` during first render to pick a style.
  Use a CSS media query or a variable; a JS branch renders differently on server and client.

### 5. Grid v2 and `Stack`

Grid v2 is `gap`-based: no negative margins, no padding compensation, no wrapper-width math.

```tsx
// ❌ legacy API (v6 `Grid`, v7 `GridLegacy`)
<Grid container spacing={2}>
  <Grid item xs={12} md={6}>…</Grid>
</Grid>

// ✅ v2: `size`, no `item`
<Grid container spacing={2}>
  <Grid size={{ xs: 12, md: 6 }}>…</Grid>
</Grid>
```

- `size` takes `number | "auto" | "grow"` or a breakpoint object; `offset` takes the same shape.
- One-dimensional flow — a toolbar, a stack of fields, a row of chips — is `Stack`, not a grid.
- Never hand-write `width: "33.33%"`. Use `size`, `flex`, or a `grid-template-columns` track list.

## Scope note for this repository

`fleet-console` runs `@mui/material` **^9.3.1** in `packages/web`, a Vite SPA. Practical effects:

- `Grid` is already v2 — `size={{ … }}`, no `Grid2` import, no `item`. There is no `GridLegacy`
  export at this version, so the legacy API is not reachable even by accident.
- There is no SSR here, so rule 4's hydration and RSC mechanics are informational. The rule that
  still binds is the last bullet: no first-render branch on a browser-only value.
- **Settled — do not re-flag.** ADR 5 rejected the CSS theme variables API deliberately (its
  `data-mui-color-scheme` attribute and `localStorage` mode persistence conflict with
  tenant-driven `data-theme` and the decided absence of persistence). Reopening it needs an ADR,
  not a review comment.
- Theming is therefore: authored `src/styles/tokens.ts` supplies MUI's palette and shape value
  and generates `tokens.css`; the `data-theme` attribute `app/theme.ts` sets at boot switches
  its custom-property blocks. `pnpm check:tokens` rejects stale generated CSS. `theme.vars.*`
  does not exist here.
- `theme.spacing` stays at MUI's default 8px (ADR 5, observed consequence): `p: 1/2/3/4` →
  8/16/24/32px, all on the token scale. `var(--space-1)` and `var(--space-3)` cover 4px and 12px.
- Rule 2 is enforced, not advisory, by two tools — read `scripts/webTokenLint.mjs` and
  `packages/web/.stylelintrc.json` rather than assuming the scope. ESLint rejects raw hex,
  `px`/`rem` strings, and non-zero numeric dimensions in production TypeScript; Stylelint
  rejects raw colours and `px`/`rem` in stylesheets. Authored `styles/tokens.ts` and generated
  `tokens.css` are their respective exemptions; tests may state literal expectations.
- Hand-written classes in these stylesheets are BEM (`block`, `block__element`, `block--modifier`),
  enforced by `selector-class-pattern`.
- No second styling system — no Tailwind, styled-components, or CSS Modules (ADR 5).
- `PRINCIPLES.md` and accepted ADRs outrank this skill. On a genuine conflict, stop and say so.

## Before emitting a component

- [ ] No `sx` object constructed inside a `.map`, and no `styled()` call inside a component body.
- [ ] No `px`, `rem`, or `#hex` literal where a spacing unit, palette path, or token would do.
- [ ] No inline `style` except to set a CSS custom property.
- [ ] No selector reaching into MUI internals; sub-elements addressed via `slotProps`.
- [ ] Grid uses `size={{ … }}`; one-dimensional flow uses `Stack`.
- [ ] Imports match the installed major (`Grid` vs `Grid2`, `slots` vs `components`).
- [ ] In an RSC app: every interactive MUI import sits under a client boundary, at the leaf.
