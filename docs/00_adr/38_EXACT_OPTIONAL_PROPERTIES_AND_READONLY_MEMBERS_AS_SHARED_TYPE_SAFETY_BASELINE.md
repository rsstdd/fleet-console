# ADR 38 — Exact Optional Properties and Readonly Members as the Shared Type-Safety Baseline

**Decision:** Every package inherits exact optional-property semantics from `tsconfig.base.json`, and every package ESLint configuration rejects class members that can be readonly.
**Status:** Decided · 2026-08-25 · Implemented
**Group:** Build / type safety

## Issue

The shared compiler baseline did not distinguish an absent optional property from a property
explicitly supplied as `undefined`, and the five package lint configurations did not enforce
readonly class members. Both gaps permit wider state than the implementation needs, but closing
them in only one package would make the repository's advertised shared baseline untrue.

## Assumptions

- Optional keys represent genuine absence unless their declared value type explicitly includes
  `undefined`.
- A class member assigned only during initialization communicates a stable identity and can be
  made readonly without changing runtime behaviour.
- All package TypeScript configurations continue to extend `tsconfig.base.json` without
  weakening shared safety options.

## Constraints

- External values remain `unknown` until runtime validation; these static checks do not replace
  the decoded boundaries required by Principle 2.
- Optional target types are not widened with `| undefined` merely to satisfy the compiler.
- Intentional mutable accumulators, stores, transports, and benchmark instrumentation remain
  mutable when their transition model requires reassignment.
- The settings apply to all packages, while the source remediation in this change is confined to
  `packages/web` because the other packages already satisfy them.

## Decision

Set `exactOptionalPropertyTypes: true` once in `tsconfig.base.json`. Configure
`@typescript-eslint/prefer-readonly: "error"` in the typed ruleset of each package ESLint
configuration. Extend `scripts/typeSafetyConfig.test.mjs` to prove the compiler flag stays on,
every package configuration—including the web e2e configuration—inherits the shared base
without disabling it, and every package config retains the readonly-member rule.

Call sites omit optional keys when no value exists. They do not manufacture explicit
`undefined`, and declarations include `undefined` only when that value is part of the actual
domain contract. Readonly lint findings are resolved only where the member is not reassigned.

## Positions

1. **Adopt both rules as one tested monorepo baseline.** Chosen because both express repository-
   wide TypeScript semantics and have one focused configuration guard.
2. **Enable the rules only in `packages/web`.** Rejected because package overrides would make
   safety depend on directory and contradict the shared-baseline contract.
3. **Keep the current settings and rely on review.** Rejected because both violations are
   mechanically recognizable and the checks are fast and actionable.
4. **Widen optional properties to include `undefined`.** Rejected as a default remediation
   because it recreates the ambiguous state the compiler option is intended to remove.

## Argument

Exact optional semantics make object construction match wire and component contracts: absence
and an explicit value are distinguishable, so spreads, JSX props, and request options cannot
silently add a key with no value. Readonly-member linting makes stable object identity visible to
the type system and prevents accidental reassignment. Central configuration avoids five drifting
compiler baselines, while the focused test proves both the setting and its inheritance.

The measured migration is small and behavior-preserving: non-web packages already pass, and web
call sites can omit absent keys or narrow unknown values at their existing boundaries. This is
proportionate static enforcement under Principle 15 rather than a new runtime abstraction.

## Implications

- Optional properties across all packages now mean absent-or-present-with-a-declared-value.
- Every future package inherits the compiler behavior by extending `tsconfig.base.json` and must
  state the readonly lint rule in its package configuration.
- `scripts/typeSafetyConfig.test.mjs` and all seven configuration paths are registered as the
  mechanical enforcement for this decision.
- Web tests and fixtures preserve JSON-derived inputs as `unknown` until parsing or narrowing,
  and optional JSX/options keys are conditionally constructed.
- No package API, schema, route behavior, dependency, or user-visible copy changes.

## Open questions

- None.

## Observed consequences

- 25 August 2026: the focused configuration guard failed before either rule was enabled and
  included the previously unguarded web e2e TypeScript configuration.
- 25 August 2026: all five package lint/typecheck gates pass with the shared settings; the 116-file
  web audit retains 405 passing tests and a successful production build without widening an
  optional property or changing a runtime contract.

## Related

- **Principle 2** (external contracts are decoded once) — runtime validation remains the
  authority for unknown data; the stronger types preserve that boundary downstream.
- **Principle 14** (operable and auditable repository) — one baseline and one focused guard make
  the supported TypeScript contract discoverable.
- **Principle 15** (proportionate and tested enforcement) — both recognizable rules are static
  errors and the configuration itself has a focused test.
- **ADR 28** (informative documentation) and **ADR 39** (exceptional comments) — govern the
  comments reviewed alongside the web remediation without adding a comment mechanism.

## Notes

- D30 records this durable shared-baseline decision.
