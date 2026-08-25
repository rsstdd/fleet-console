---
name: typescript
description: >
  TS authoring/review rules: compiler baseline, unknown-over-any, runtime
  validation, safe assertions, schema-derived types, discriminated unions,
  purposeful generics, immutability, async safety, public API typing, mandatory
  verification. Use for .ts/.tsx files, tsconfig, type-aware ESLint, runtime
  schemas, or public type signatures.
---

# TS Rules

Load `clean-code`, `react`, `react-mui` skills as needed.
**Authority**: `PRINCIPLES.md` > ADRs > `AGENTS.md` > this skill. State conflicts in change summary. Verified 2026-08-25. Re-check config before quoting repo state.

## Strengths

- **MUST/MUST NOT**: Correctness/safety/invariant.
- **SHOULD/SHOULD NOT**: Preferred design unless justified.
- **MAY**: Optional technique.

## Compiler Baseline

`tsconfig.base.json` is the source of truth. Every package config extends it and **MUST NOT** weaken its safety flags. Package configs add only environment- or build-specific settings such as libraries, JSX, ambient types, paths, source inclusion, build-info location, import-extension support, and the NodeNext resolution used by files that Playwright or Node executes directly.
**Snapshot Flags**: `target: es2023`, `lib: ES2023`, `module/moduleResolution: esnext/bundler`, `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitReturns`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `isolatedModules`, `moduleDetection: force`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `skipLibCheck`, and `noEmit`.
Prefer JS-native syntax + erasable types. **No enums**; use literal unions / `as const`.

## `exactOptionalPropertyTypes`

Enabled repository-wide by ADR 38. When no value exists, omit the key (`...(val !== undefined ? { val } : {})`), not widening to `T | undefined`. Explicit `| undefined` is valid only when it is part of the intentional domain model.

## Type Safety

**MUST NOT** use explicit `any`. Use `unknown` + narrowing (schema, guard, `instanceof`, discriminant, existence).
**Forbidden**: `any` laundering (`as any as T`, `as unknown as T`).

## Type Assertions

No runtime validation. **MUST NOT** use narrowing assertion to silence compiler.
**Allowed**: `as const`, non-narrowing assertions, unavoidable third-party boundaries (prefer guard/schema first, isolate scope, use scoped ESLint exception, state invariant).
**Forbidden**: `as any`, `as unknown as T`, `as T` (suppress), `!`. Prefer guards/schema.
**Lint**: `no-unsafe-type-assertion`, `no-unnecessary-type-assertion`, `no-non-null-assertion`.

## Escape Hatches

**MUST NOT** use `@ts-ignore`, `@ts-nocheck`. **MUST NOT** weaken checker.
`@ts-expect-error` MAY be used if intentional (test/boundary), MUST state why.
ESLint disables: narrow scope, inline reason, follow `AGENTS.md`. Fix model/runtime check/adapter instead.

## Index Access & Absence

`noUncheckedIndexedAccess` enabled. Check `undefined`. **No `!`**. Encode/verify invariants explicitly.

## Null & Undefined

- Optional member: `property?: T`
- Lookup/missing: `T | undefined`
- `null`: ONLY if domain/protocol/API gives distinct meaning.
  No `T | null | undefined` without reason. No interchange.

## Runtime Boundaries

Untrusted data (HTTP, SSE, WS, `JSON.parse`, storage, URL, env, files, IPC, DB, SDKs, user input) = unvalidated.
Convert to `unknown` if API unsafe. Validate before domain logic.

## Runtime Schemas

Zod standard. Valibot only if ADR-level constraint (bundle size).
Parse once per trust boundary. Downstream gets decoded type.
Shape: `packages/contracts/src/**/**Schema.ts` (schema, derived type, `parseWith` ParseResult if required).
Failures: `ContractIssue`, ADR 20 recoverable/terminal. Preserve path/error code.

## Schema vs Domain Types

Derive contract static type from schema (`z.output`). **No** handwritten parallel interface.
Zod transforms: use `z.input`, `z.output`. Don't assume interchangeable.
Domain model MAY differ; map explicitly from validated transport. Don't let DTOs become domain models.

## `satisfies` & `const` Type Params

- `satisfies`: Verify contract + preserve inferred keys/literals. Don't use mechanically.
- `const` type params: Preserve call-site literal structure. Don't use mechanically; only if literal inference provides API value.

## Generics

Must earn type param. Unconstrained valid if preserves relationship/info.
No meaningless constraints (`extends unknown`). Add `extends` for required capabilities. Constrain only to shape used. No over-constrain to concrete domain type.
**Lint**: `no-unnecessary-type-constraint` (error), `no-unnecessary-type-parameters` (SHOULD enable; MAY narrow-scope exceptions in type-test files).

## Discriminated Unions & Exhaustiveness

Use for closed states/events/variants. `switch` over discriminant.
Use shared `assertNever(value, context)` helper. No inline `_exhaustive: never`.
**Lint**: `switch-exhaustiveness-check` = error with `{ considerDefaultExhaustiveForUnions: false }`. ESLint finds incomplete, `assertNever` proves `never`. CI runs both. New union member fails until handled. Polymorphism doesn't replace boundary exhaustiveness.

## Immutability

Public contracts, domain, props, state SHOULD be immutable (`readonly T[]`, `ReadonlyArray<T>`, `ReadonlyMap`, `ReadonlySet`, per-field `readonly`).
`Readonly<T>` is shallow; use nested `readonly` or shared `DeepReadonly` (only if required and correct). Don't introduce `DeepReadonly` casually.
Local mutation OK if local ownership, no caller state mutation, no mutable contracts exposed. Never mutate param unless documented.
Props: `export interface XProps { readonly ... }`. Use `type` for unions/intersections/mapped. No drive-by conversions.

## Public API Contracts

Exported functions SHOULD declare explicit return type (prevents leaks, unstable output, accidental any). Inference OK for local/internal.

## Domain Identifiers

Branding MAY be used for distinct primitives. Don't overuse. Boundary parsing/constructor responsible for valid brands. No arbitrary assertions.

## Callback Types

Use narrowest callable contract. **MUST NOT** use `Function`. Use explicit callable signatures. Don't narrow params beyond caller guarantees.
**Lint**: `no-unsafe-function-type`.

## Primitive Wrapper Types

**MUST NOT** use wrapper types (`String`, `Number`, `Boolean`, `Object`, `Function`). Prefer lowercase primitives (`string`, `number`, `boolean`, `object`) or specific structural types.

## Error Handling

Catch vars `unknown`. Narrow before use. Don't assume `Error`. Throw `Error` or repo-defined types, not primitives. Use repo structured domain errors.

## Async Correctness

**Lint**: `no-floating-promises`, `no-misused-promises` = error.
Await promises. Detached promises: explicit + handle failure.
No async callbacks in non-awaiting APIs (e.g., `forEach`). Use `for...of` (sequential) or `Promise.all` (concurrent). Choose deliberately.

## Explicit Resource Management

`using`/`await using` MAY be used for scoped lifetimes (DB, subs, locks). Must implement `Disposable`/`AsyncDisposable`. No assuming `close()` works.
Requires `esnext.disposable` in lib. Verify runtime support. Dedicated config change.

## Linting

`tseslint.configs.strictTypeChecked`. No downgrade.
Explicit error rules: `consistent-type-imports`, `no-explicit-any`, `no-floating-promises`, `no-misused-promises`, `no-non-null-assertion`, `no-unnecessary-type-assertion`, `no-unnecessary-type-constraint`, `no-unsafe-argument`, `no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-function-type`, `no-unsafe-member-access`, `no-unsafe-return`, `no-unsafe-type-assertion`, `switch-exhaustiveness-check`.
`no-unnecessary-type-parameters` SHOULD be enabled. `prefer-readonly` is an error in every package; it covers eligible class members, not full structural immutability. No unexplained `eslint-disable`.

## Type-Only Imports

`verbatimModuleSyntax` enabled. Use `import type` for types. Don't rely on TS rewrite.

## React-Specific Typing

Load React skill. Props readonly, no unsafe event assertions, validate external data from schemas, no `!` for refs/query, discriminated unions for states. No `React.FC` unless repo convention.

## Validation is Part of Implementation

Run typecheck, type-aware ESLint, tests, build (if touches module resolution/exports/declarations/bundling/tsconfig/transforms/schemas). Use repo scripts.
**MUST NOT** claim validation passed unless run+success. If unavailable, state it.
No suppressing/weakening/disabling/deleting/broadening to get green. Fix issue.

## Review Checklist

Reject/correct without justified reason:

1. Type-system escape hatch (`any`, unsafe `as`, `!`, `@ts-ignore`, unexplained disable)
2. Unsafe indexed access (no absence handling)
3. Unvalidated boundary (external data to domain)
4. Duplicated schema contract (handwritten type shadows schema)
5. Transport/domain coupling (DTO reused as domain model)
6. Unclear absence semantics (unexplained `null`/`undefined`)
7. Non-exhaustive closed union
8. Bad generic (unnecessary, meaningless constraint, over-coupled)
9. Unnecessary mutability (mutable public/state/props, mutated param, unnecessary recursive readonly)
10. Unsafe callback contract (`Function`, narrower than caller guarantees, unsafe assertion)
11. Unsafe async (floating promise, async in non-await API, detached without handling)
12. Accidental public contract (unstable inference exposed)
13. Configuration weakening (tsconfig/lint downgrade)
14. Unverified completion (validation claimed without evidence)

## Core Principle

Encode truths program can defend. Prefer: inference > redundant annotations, runtime validation > assertions, narrow domain > broad concrete, closed unions > impossible states, readonly > shared mutation, explicit absence > implicit, schema-owned > duplicated, compiler/lint > prose.
Never make type system say something runtime behavior cannot justify.
