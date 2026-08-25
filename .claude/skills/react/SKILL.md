---
name: react
description: Senior-engineer review of React and TypeScript changes — rendering correctness, hooks and effect discipline, state ownership, accessibility, performance, and test integrity. Use whenever the user asks to review, critique, audit, or sanity-check React, TSX, or frontend code — a single component, a custom hook, a diff, a PR, or a whole package — even if they do not say the word "review."
---

# React code review

Review as a senior frontend engineer: React rendering semantics, hooks rules, state ownership,
data fetching and cache invalidation, TypeScript type safety, accessibility, bundle and render
performance, and test integrity.

Load the `clean-code` skill alongside this one for the style and structure rules.

> **Scope note for this repository.** `fleet-console` is a TypeScript monorepo whose one
> frontend is `packages/web`: a React 19 + Vite + MUI operator console. `PRINCIPLES.md` and
> accepted ADRs are binding and outrank this skill and every `AGENTS.md`; on conflict, stop
> and surface it. Review web changes against `packages/web/AGENTS.md` and the page/component
> specs under `docs/`. Questions already decided — do not re-flag: the fleet table is
> deliberately not virtualized (ADR 24, on measured evidence, with a recorded reopening
> condition); bundle size and scale behavior are measured gates (ADR 22, ADR 24) — optimize
> only from evidence; freshness is server-derived and never client-timed (ADR 3); product
> code carries zero `eslint-disable` escapes, and a disable anywhere else states its reason
> inline.

## Non-negotiables

- **Reviewing is not editing.** Report findings; apply them only when asked.
- **Never commit, push, branch, merge, or open a PR.**
- **Do not claim a check passed unless it ran.**

## Procedure

1. Establish the target. With no files given, review uncommitted work:
   `git status --short && git diff --stat`.
2. Read the package's own conventions first — `AGENTS.md`/`CLAUDE.md`, ESLint and TS config,
   and the existing components nearest the change. Match the surrounding idiom.
3. Run the checks the package actually defines (read `package.json`; do not invent scripts):
   typecheck, lint, test, and a production build when bundle size is in question.
4. Verify each finding against the code before reporting it.
5. Rank most severe first.

## Severity

| Marker   | Meaning                                                                              |
| -------- | ------------------------------------------------------------------------------------ |
| Critical | Broken render, data loss, injected HTML, leaked secret, unhandled auth state         |
| Major    | Effect that loops or races, stale closure, missing cleanup, key misuse, a11y blocker |
| Minor    | Naming, prop shape, avoidable re-render, missing type narrowing                      |
| Lint     | A specific ESLint / `react-hooks` rule that applies                                  |

## What to review

### Rendering correctness

- Purity: no side effects, mutation of props or state, or non-deterministic values (`Date.now`,
  `Math.random`, `crypto.randomUUID`) during render. Under StrictMode and concurrent rendering a
  component renders twice — anything impure surfaces as a heisenbug.
- Keys: stable and identity-bearing. Array index as key is a defect wherever the list can
  reorder, insert, or filter — it silently transplants state between rows.
- **Hooks top-level only:** Except for React `use(resource)`, never call hooks inside loops,
  conditions, nested functions, or `try/catch`, or after an early return. `use(resource)` may be
  called in loops and conditions, but never inside `try/catch` or a nested function. React tracks
  state via an internal linked list; conditional execution shifts indices and corrupts state.
- **Hooks React-only:** Call hooks exclusively from functional components or custom hooks,
  never from plain JS, classes, or event handlers.
- `useRef`: Never read or write `ref.current` during render (breaks Concurrent React);
  restrict mutations to effects or event handlers.
- Derived state duplicated into `useState` and resynced by an effect: compute during render
  instead, or key the component to reset it.

### Effects

- `useState`/`useReducer`: State updates must be pure; direct mutation (e.g., `arr.push()`)
  skips re-renders. Use functional updates (`setState(prev => next)`) when depending on
  previous state.
- An effect whose only job is to transform props into state, or to respond to a user event,
  is the wrong tool. Effects are for synchronizing with something outside React.
- Every subscription, timer, listener, observer, and in-flight request has a cleanup.
- Dependency arrays are complete and honest. A disabled exhaustive-deps warning needs a comment
  saying why; suppressing it to stop a loop hides the real bug (an unstable dependency).
- Async effects handle unmount and out-of-order resolution — a late response must not overwrite
  newer state. Use an abort signal or an ignore flag.

### State ownership and data

- State lives at the lowest common owner; server data is not mirrored into local state without
  a reason. Check invalidation on mutation, and what the UI shows while stale.
- Context holding a new object literal per render re-renders every consumer; check the value is
  memoized or split by update frequency.
- Loading, empty, error, and partial states are all handled — not just success.

### TypeScript

- No `any`, no unexplained `as`, no non-null `!` on values that can genuinely be null.
- Discriminated unions for mutually exclusive props, so impossible states are unrepresentable.
- Props typed at the boundary; avoid `React.FC` where it obscures generics or children.
- Event and ref types are the real DOM types, not `any`.

### Accessibility

- Semantic elements before ARIA. A `div` with `onClick` is not a button: no focus, no keyboard,
  no role.
- Every control has an accessible name; every input has a label association.
- Focus is managed across route changes, dialogs, and disclosure; focus is trapped in modals and
  restored on close.
- Interactive state is not conveyed by color alone; check contrast.
- Images carry meaningful `alt`, or empty `alt` when decorative.

### Security

- `dangerouslySetInnerHTML` requires sanitization at the boundary and a comment naming the source.
- No secrets in client bundles or `NEXT_PUBLIC_*`-style public env vars.
- User-controlled URLs validated before use in `href`/`src` (`javascript:` and `data:` schemes).
- Untrusted content is never interpolated into a template that reaches the DOM as markup.

### Performance

- Measure before optimizing. `memo`, `useMemo`, and `useCallback` on a cheap component cost more
  than they save — flag both missing memoization on a proven hot path and cargo-culted memoization.
- Look for: work inside render that belongs outside it, new function or object identities passed
  to memoized children, large lists without virtualization, an unnecessary client component,
  and images or fonts without sizing or preload strategy.

### Tests

- Query by role and accessible name, not by test id or class — the query is itself an a11y assertion.
- Assert user-visible behavior, not implementation details or internal state.
- No arbitrary waits; wait for a condition. Deterministic time and network via fake timers and
  request mocking at the network boundary.
- A test that re-implements the component's own logic to compute its expectation cannot fail.

## Output

Markdown, most severe first. For each finding: severity marker, one-line claim, the
`file_path:line` anchor, a concrete failure scenario (what the user does → what breaks), and the
suggested change as a code block.

Close with what you ran, a recommended order of application, and anything unverified. State
plainly when the code is sound.
