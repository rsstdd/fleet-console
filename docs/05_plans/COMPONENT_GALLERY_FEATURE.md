# Component Gallery Feature Move

**Authority:** Planning only.
**Status:** Active
**Updated:** 2026-08-25

The implementation lives under `packages/web/src/features/component-gallery`; `AppRouter`
retains the DEV-only `/dev/ui` route and injects the app-owned MUI theme factory. All code and
documentation scope is complete, but ADR 27 evidence remains pending until the working tree is
represented by reviewable commits or a justified `Oversized-diff:` trailer.

## Outcome

The development-only component gallery lives at
`packages/web/src/features/component-gallery`, remains available at `/dev/ui` only in
development, demonstrates the complete current contracts of all eight shared components,
and switches its nested tenant theme without changing the deployment theme on the document.

## Scope

### In scope

- Move the gallery from `src/app/dev` into one-component feature modules, retaining the
  `ComponentGallery` export and route.
- Keep deterministic fixtures and compile-time-exhaustive prop descriptors in separate
  non-component modules.
- Localize section state, add terminal-cause controls, and use current React/MUI event and
  return types.
- Keep the reusable MUI theme factory and pre-paint document bridge app-owned; inject the
  factory into the DEV feature from `AppRouter` so the feature never imports upward.
- Close ADR 36's gallery-location question and synchronize current specifications,
  READMEs, and active path-bearing plans.

### Out of scope

- Dependency, lockfile, route, public component API, or component-specification changes.
- Promoting the gallery to a production route or changing product behavior.
- Package upgrades or React Compiler work gated by D27.

## Authorities and dependencies

- Principles 6, 8, 9, 10, 13, and 14; ADR 5, ADR 22, ADR 36, ADR 38, and ADR 39.
- `docs/03_package-specs/05_WEB.md`, `docs/01_page-specs/01_APP_SHELL.md`, and
  `packages/web/AGENTS.md`.
- The config layer's data-only boundary ruled out the originally proposed theme-factory
  move. App-owned dependency injection resolved the feature edge without changing policy.
- Tests defining route integration, prop-contract completeness, terminal-cause behavior,
  and isolated theme switching preceded implementation.

## Execution

1. Added the focused failing gallery and router tests.
2. Moved the gallery files, split sections, and localized their state.
3. Added exhaustive prop descriptors and deterministic fixtures.
4. Synchronized ADR 36, package documentation, READMEs, and current plan references.
5. Ran focused, package, repository, build, bundle, and browser verification.

## Acceptance criteria

- [x] `/dev/ui` renders the feature inside the app shell only in development.
- [x] Every section is a single-export feature module; fixtures and prop contracts are
      separate and deterministic.
- [x] The props table is compile-time exhaustive for all eight exported component prop
      interfaces and includes `ConnectionBanner.terminalCause?`.
- [x] Tenant, connection state, terminal causes, persona, retry, and empty-state controls
      are keyboard operable; gallery theme selection does not mutate `documentElement`.
- [x] Production output contains no gallery marker or gallery chunk.
- [x] Code, ADR, specification, READMEs, and current planning references agree on paths.
- [x] Every named check is recorded honestly, including the environment-limited WebKit
      verification below.
- [ ] The committed branch range passes `pnpm check:diff-size`, or an indivisible change has a
      justified `Oversized-diff:` trailer.

## Documentation synchronization

- ADR 36; `docs/03_package-specs/05_WEB.md`; root and web READMEs.
- Current path-bearing plans in `docs/05_plans/`.

## Verification

- Focused gallery/router Vitest: 13/13 passed; `pnpm --filter web typecheck` and
  `pnpm --filter web lint` passed.
- `pnpm check:doc-comments`, `pnpm check:dependencies`, `pnpm docs:decisions`, and
  `pnpm check:architecture-docs` passed.
- `pnpm test` passed: 38 web files / 409 web tests; 1,220 tests across all packages.
- `pnpm --filter web build` and `pnpm check:bundle` passed at 609.27 kB raw / 183.57 kB
  gzip against the 720/300 budget. The production output contained no gallery marker or
  gallery-named chunk.
- A running Vite development build passed a real Chromium check of `/dev/ui`: shell and
  first-tab skip-link behavior, both tenant themes, document-theme isolation, the complete
  prop table, persona changes, every connection and terminal-cause control, retry, and
  empty-state recovery. The new Chromium project passed 2/2: it holds the 320px document-width
  reflow boundary and checks the status-size and current/last-known visual differences through
  computed styles.
- Before the gallery project was added, the unchanged smoke suite passed all 26 Chromium and
  Firefox scenarios. Its 13 WebKit scenarios could not launch because this host lacks the
  required GTK, GStreamer, AVIF, Wayland, enchant, secret, and GLES libraries; CI remains the
  WebKit environment.
- `git diff HEAD --check` passed. `pnpm check:diff-size` is not yet valid evidence for this
  uncommitted work: it compares the committed branch range and therefore reports zero lines.

## Remaining closure

After the work is divided into reviewable commits, run `pnpm check:diff-size` against that branch
range. If the move is genuinely indivisible, record the reason in an `Oversized-diff:` commit
trailer instead. Archive this plan only after one of those two forms of ADR 27 evidence exists;
the feature modules and tests, ADR 36's closed question, `docs/03_package-specs/05_WEB.md`, and
both README folder maps consume the remaining content.
