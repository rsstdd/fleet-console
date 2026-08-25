# Web TypeScript and comment compliance

**Authority:** Historical. This plan records the TypeScript and comment compliance work completed on 25 August 2026; ADR 38, the shared configuration guard, current repository guidance, and the web package specification supersede its status claims.

**Archived 25 August 2026** from
`docs/05_plans/WEB_TYPESCRIPT_COMMENT_COMPLIANCE.md`, on completion. The implementation is
consumed by ADR 38 and D30, `tsconfig.base.json`, all five package ESLint configurations,
`scripts/typeSafetyConfig.test.mjs`, the remediated web sources and tests, `AGENTS.md`, and
`docs/03_package-specs/05_WEB.md`.

Verification evidence: all five package lint/typecheck gates passed; all 1,216 workspace tests
passed serially (including 405 web tests); all package builds passed; architecture, type-safety,
doc-comment, token, dependency, audit, fixture-drift, bundle, and diff-whitespace gates
passed. The bundle measured 608.49 kB raw / 183.24 kB gzip against the 720/300 budget. The 12
smoke scenarios passed in Chromium and Firefox (24/24). WebKit could not launch on this host
because its GTK, GStreamer, and related system libraries are absent; every WebKit entry failed
before application code or fixture startup. `pnpm check:ci` passed through audit and all package
lint/typecheck steps, then stopped at `.vscode/settings.json`, a local untracked editor file that
this repository never carries and that is already non-Prettier-formatted; CI never sees it, and the
remaining stages were run and passed individually rather than changing that unrelated file.

`pnpm check:diff-size` measures the committed `merge-base...HEAD` range, so it reported zero while
the work was uncommitted and proved nothing. Measured with the gate's own counting rules, the
change is roughly 563 counted lines — 339 in tracked files plus the new ADR and this archived
plan — against the 300-line budget, so it ships under an `Oversized-diff:` override (ADR 27). About
31 of those lines are Prettier realigning the decision table around ADR 38's filename.

## Outcome

Exact optional-property semantics and readonly-member linting are a tested monorepo baseline,
and all 116 TypeScript/TSX files in `packages/web` were audited and left compliant without a
runtime behavior or public-contract change.

## Scope

### In scope

- Decided and mechanically enforced `exactOptionalPropertyTypes` in the shared TypeScript
  configuration and `@typescript-eslint/prefer-readonly` in all five package lint configs.
- Audited all TypeScript/TSX files under `packages/web` for unsafe assertions, insufficient
  narrowing, mutable input shapes, unconstrained generics, and comments that do not explain a
  contract or rationale.
- Remediated the resulting web-only source and test findings while preserving absent optional
  keys rather than widening their types with `undefined`.
- Synchronized the decision register, generated decision index, root guidance, and web package
  specification with the implemented baseline.

### Out of scope

- Runtime, route, schema, dependency, user-visible copy, or external package API changes.
- React Compiler enablement or removal of D27-gated fleet memoization.
- Source remediation outside `packages/web`, except shared configuration and its focused guard.
- Changes to user-owned untracked skill inputs or review notes.

## Authorities and dependencies

- Principles 1, 2, 9, 10, 14, and 15 governed single authority, boundary validation, layering,
  test-first work, auditable guidance, and proportionate enforcement.
- ADR 28 and ADR 37 governed informative comments and required cross-layer web documentation.
- D27 remained open, and the measured fleet memoization was retained with its rationale stated.
- `docs/DOCUMENT_LIFECYCLES.md`, the root and package `AGENTS.md` files, and
  `docs/03_package-specs/05_WEB.md` governed process and package consequences.
- D30 and ADR 38 became the durable record for the shared baseline.

## Execution

1. Extended the focused type-safety configuration guard and confirmed it failed on the missing
   baseline settings.
2. Recorded D30/ADR 38, enabled the shared compiler flag and every-package lint rule, then fixed
   web TypeScript and TSX findings without widening contracts or changing behavior.
3. Reviewed touched comments and memo/effect rationale, synchronized durable documentation, and
   ran focused through full verification.
4. Archived this plan after its requirements were represented by implementation, ADR,
   specifications, guidance, and recorded evidence.

## Acceptance criteria

- [x] The focused guard proves all package tsconfigs, including web e2e, inherit exact optional
      semantics and all five lint configs enforce readonly members.
- [x] All TypeScript/TSX files in `packages/web` pass the stricter compiler and lint baseline
      without unsafe assertions, widened optional properties, or unintended mutable inputs.
- [x] Export, memoization, effect, coupling, and suppression comments in touched files satisfy
      the web comment policy and the informative-docs gate.
- [x] D30, ADR 38, mechanical-rule registrations, generated index, guidance, and package
      specification describe the same implemented state.
- [x] Every named check was run; the WebKit host limitation and unrelated full-gate format failure
      are recorded above without claiming they passed.

## Documentation synchronization

- Added D30 and ADR 38 and registered every mechanical enforcement path in
  `docs/decisions.json`; regenerated `docs/PENDING_ARCHITECTURE_DECISIONS.md`.
- Synchronized `AGENTS.md` and `docs/03_package-specs/05_WEB.md` with the shared baseline.
- Archived this plan here with completion evidence after implementation.

## Verification

- `pnpm check:type-safety` — passed.
- `pnpm --filter web lint` — passed.
- `pnpm --filter web test` — 405 passed.
- `pnpm --filter web build` — passed.
- `pnpm check:doc-comments` — passed.
- `pnpm docs:decisions` — passed.
- `pnpm check:architecture-docs` — passed.
- `pnpm check:dependencies` — passed.
- `pnpm check:tokens` — passed.
- `pnpm test:e2e` — Chromium and Firefox passed 24/24; WebKit was unable to launch because the
  host lacks its system libraries.
- `pnpm check:ci` — passed through package lint/typecheck, then stopped on the local untracked
  `.vscode/settings.json` format finding; all later stages passed when run individually.
- `pnpm check:diff-size` — reported zero against the uncommitted tree; the change is about 563
  counted lines and ships under a recorded `Oversized-diff:` override (ADR 27).
- `git diff --check` — passed.

## Completion

Archived 25 August 2026. Replacement evidence: ADR 38 and D30; the shared compiler and lint
configurations; `scripts/typeSafetyConfig.test.mjs`; the audited web implementation and tests;
the synchronized root guidance, generated index, and web package specification; and the
verification record above.
