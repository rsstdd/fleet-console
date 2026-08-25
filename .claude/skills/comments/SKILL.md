---
name: comments
description: >
  Minimal comment and doc-comment rules for React + TypeScript. Comments are
  exceptional: preserve invariants, safety-critical constraints, non-obvious
  external-system behavior, and necessary architectural boundaries. Prefer
  names, types, structure, tests, ADRs, and specs over prose in source.
---

# Comments

Comments are a maintenance liability. Write one only when removing it would
make an important invariant, constraint, or failure mode materially harder to
discover.

The default is **no comment**.

TypeScript, names, types, function boundaries, tests, ADRs, and specifications
carry the explanation whenever they can do so adequately.

Load `clean-code` when better naming or decomposition could remove a comment.
Load `typescript` for type-level invariants and `react` for React lifecycle
behavior.

## Authority

`PRINCIPLES.md` > accepted ADRs > repo `AGENTS.md` > path-scoped `AGENTS.md` >
this skill.

If an authoritative repository rule requires a comment, follow it even when
this skill would otherwise omit one. Treat divergence between this skill and
the authoritative rule as documentation drift.

Verified 2026-08-25.

# The rule

A comment must preserve information that the code itself cannot reasonably
express.

A comment is justified when it records one of these:

1. **Invariant**
   - a state that must always remain true;
   - a distinction that must never be collapsed;
   - an ordering requirement necessary for correctness;
   - a value that must not be inferred from another value.

2. **Critical external-system behavior**
   - lifecycle behavior involving sockets, timers, browser APIs, storage,
     workers, observers, subscriptions, or other external systems;
   - race resolution where the winning write is not obvious;
   - cleanup whose omission creates a real correctness or resource problem.

3. **Necessary deviation or workaround**
   - the normal implementation is unsafe or incorrect here;
   - the reason cannot be made obvious through structure;
   - removing the workaround without understanding the cause could reintroduce
     a known failure.

4. **Non-obvious protocol or domain constraint**
   - null/absence has a specific domain meaning;
   - units, ranges, ordering, provenance, or identity semantics are not encoded
     by the type;
   - two superficially similar states have intentionally different meanings.

5. **Public API contract that types cannot express**
   - caller-visible behavioral guarantees;
   - retry, ownership, ordering, mutation, identity, or failure semantics.

Everything else should normally be expressed in code or omitted.

# Prefer code over comments

Before writing a comment, try in this order:

1. improve the name;
2. improve the type;
3. introduce a named predicate or helper;
4. extract a function or component;
5. encode the invariant in a schema or discriminated union;
6. add or improve a test;
7. put architectural rationale in the owning ADR/spec;
8. only then add a comment.

```ts
// ❌ Comment compensates for weak naming.
const value = Date.parse(robot.lastSeenAt);

// Timestamp of the robot's most recent report.
```

````

Prefer:

```ts
const lastReportedAt = Date.parse(robot.lastSeenAt);
```

# Invariants

Invariant comments are the most valuable comments in this repository.

They should be short and state the rule directly.

```ts
// Connectivity is reported telemetry; never derive it from freshness.
const connectivity = envelope.core.connectivity;
```

```ts
// "Not evaluated" is distinct from "evaluated with zero gaps."
sequenceHealth: { evaluated: false },
```

```ts
// A robot with unknown freshness has never reported.
lastSeenAt: null,
```

Do not include the history of how the invariant was discovered unless that
history is necessary to prevent recurrence.

Bad:

```ts
// This used to derive connectivity from freshness, but ADR 1 forbids that
// because several fixtures...
```

Better:

```ts
// Connectivity and freshness are independent signals; never infer one from the other.
```

The ADR owns the history.

# Doc comments

## Public surface

ADR 39 does not require documentation solely because a symbol is public. A doc
comment must describe a contract the declaration itself does not communicate.

```ts
// ❌ Restatement
/** Returns the robot detail. */
export function getRobotDetail(): RobotDetail;
```

```ts
// ✅ Behavioral contract
/** Returns the last accepted detail snapshot; does not initiate a network request. */
export function getRobotDetail(): RobotDetail;
```

For internal exports, absence of a doc comment is the default.

Do not add documentation merely because a symbol is exported from its module.

## Tags

Use `@param`, `@returns`, `@throws`, `@deprecated`, and `@example` only when
they communicate a caller-visible contract that is not obvious from the type.

Do not mechanically document every parameter or return value.

# Interfaces and properties

Do not document ordinary members.

```ts
// ❌
/** Robot identifier. */
readonly id: string;
```

Document a member only when its type fails to capture an important semantic
constraint.

```ts
/** Null only when the robot has never reported. */
readonly lastSeenAt: string | null;
```

Prefer encoding the distinction in the type when practical.

# React effects

A `useEffect` does **not** automatically require a comment.

Comment an effect only when an important lifecycle invariant cannot be made
clear from the code.

Good reason:

```ts
// Cleanup must disconnect before StrictMode replays setup or two sockets can stream concurrently.
useEffect(() => {
  transport.connect();
  return () => transport.disconnect();
}, [transport]);
```

No comment needed:

```ts
useEffect(() => {
  document.title = title;
}, [title]);
```

If an effect requires a paragraph to explain ordinary control flow, first
consider extracting the lifecycle operation into a named hook or function.

# Memoization

`useMemo` and `useCallback` do **not** automatically require comments.

Comment only when reference identity itself is a correctness or architectural
requirement that would otherwise be easy to remove accidentally.

```ts
// Stable identity is required because this callback is an effect dependency downstream.
const reconnect = useCallback(() => {
  transport.reconnect();
}, [transport]);
```

Do not comment ordinary performance-oriented memoization unless the reason is
non-obvious and supported by evidence.

# Constants

Do not comment every number.

Prefer named constants:

```ts
const HISTORY_WINDOW_MS = 60_000;
const HISTORY_MAX_POINTS = 60;
```

Add a comment only when the value carries an important external constraint or
non-obvious invariant.

```ts
// Must remain below the server's 30-second idle timeout.
const HEARTBEAT_INTERVAL_MS = 20_000;
```

No comment is needed merely to translate milliseconds into English.

# Workarounds and deviations

A workaround comment should answer only what a future maintainer needs before
removing it:

- what invariant or external limitation requires it;
- what would break if simplified;
- where the authoritative explanation lives, when useful.

```ts
// Safari may deliver the final observer callback after disconnect; ignore it after teardown.
// See ADR 24 § Observer lifecycle.
```

Avoid issue history, author names, dates, changelog prose, and implementation
archaeology.

# Architectural references

Source comments may cite an ADR or specification when the reference helps
locate an important contract.

Prefer:

```ts
// Registered-only robots intentionally have no telemetry envelope. See ADR 1.
```

Avoid:

```ts
// ADR 1 §3.2 rev 7, updated 2026-07-14 after FIXME F1...
```

Do not copy revision numbers or mutable document metadata into source.

The source comment states the invariant. The ADR explains why the architecture
chose it.

# Cross-file coupling

Do not mechanically document coupling on both sides.

Instead:

- encode coupling through shared types or APIs where possible;
- document only load-bearing coupling that a refactor could easily violate;
- place the comment at the side where the constraint is least obvious;
- cite the owning abstraction or ADR if that is more durable than another code
  location.

Duplicated explanatory comments increase drift risk.

# JSX

JSX comments are rare.

Use them only for non-obvious behavior that cannot be represented by component
structure or naming.

```tsx
{
  /* Announce the outage before stale telemetry so assistive technology receives the cause first. */
}
<ConnectionBanner />;
```

Do not label sections of markup.

```tsx
{
  /* ❌ Robot list */
}
<RobotList />;
```

# Tests

Comments in tests are also exceptional.

The test name should explain the behavior. Add a comment only when the test
protects a subtle invariant whose importance is not evident from the assertion.

```ts
// These states must remain distinct: no sequence source is not equivalent to zero observed gaps.
expect(sequenceHealth).toEqual({ evaluated: false });
```

Do not narrate setup, execution, or assertions.

# Debt markers

Prefer repository debt files over source markers.

If an in-code marker is explicitly permitted by repository policy, use only
the repository-approved syntax.

Never use comments as a substitute for an issue description or design
document.

# Refactoring

Treat every surviving comment as code.

When modifying nearby logic:

- verify that each nearby comment is still true;
- shorten it if the code now expresses part of the explanation;
- delete it if the invariant no longer exists;
- update references when ownership moves.

An outdated comment is worse than no comment.

# Anti-patterns

Do not write:

- comments that restate identifiers or types;
- narration of the next statement;
- comments describing ordinary control flow;
- comments explaining syntax;
- comments merely labeling JSX or code sections;
- commented-out code;
- closing-brace labels;
- changelog/history prose;
- author names or dates;
- speculative explanations;
- duplicated ADR content;
- comments added solely because a construct such as `useEffect`, `useMemo`, or
  `useCallback` exists;
- comments that compensate for poor names or excessive function size.

# Examples

## Too much

```ts
// Get the fixture for this robot's vendor.
const fixture = FIXTURE_BY_VENDOR[robot.vendor];

// Parse when the robot was last seen.
const reportedAt = robot.lastSeenAt === null ? null : Date.parse(robot.lastSeenAt);

// If there is no report, build the registered response.
if (reportedAt === null || fixture === undefined) {
  return buildRegisteredResponse(robot);
}
```

## Preferred

```ts
const fixture = FIXTURE_BY_VENDOR[robot.vendor];
const reportedAt = robot.lastSeenAt === null ? null : Date.parse(robot.lastSeenAt);

// A robot that has never reported uses the registered-only contract.
if (reportedAt === null || fixture === undefined) {
  return buildRegisteredResponse(robot);
}
```

Only the contract distinction earns prose.

# Review checklist

When reviewing comments, ask:

1. Does this preserve an important invariant, constraint, failure mode, or
   external-system behavior?
2. Could a better name, type, helper, schema, or test make it unnecessary?
3. Does it explain **why**, rather than narrate **what**?
4. Would removing it make a future incorrect refactor materially more likely?
5. Is the statement still true?
6. Is architectural history better kept in an ADR/spec?
7. Can the comment be shortened without losing the invariant?

Flag:

- incorrect or stale comments;
- restatement;
- implementation narration;
- unnecessary JSDoc;
- duplicated architectural prose;
- comments compensating for unclear code.

Do **not** flag uncommented code merely because it contains an effect,
memoization, a constant, an internal export, or a non-trivial function.
````
