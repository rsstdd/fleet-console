# `__enforcement__` — fixtures that prove the lint rules still fire

Principle 15 requires enforcement to be _tested_, and ADR 7 records what happens when it
is not: `boundaries/dependencies` sat inert for most of this repository's life, reporting
nothing for the deliberate fixture and nothing for any probe, and silence was
indistinguishable from a passing check.

Every file here is a deliberate violation of one rule in `../../eslint.config.js`, plus
one file (`legal.ts`) that violates nothing. The control matters as much as the
violations: without it, a rule that reports nothing for any input passes every other
assertion in `enforcement.test.ts`.

These files are excluded from the normal lint run by the `ignores` entry in
`eslint.config.js`. The test reaches them by constructing `ESLint` with `ignore: false`.

Do not repair or delete them. A failure here means a rule stopped working, not that the
fixture is wrong.

`@ts-nocheck` appears where a fixture imports a module that deliberately does not
resolve. The import bans are syntactic, so the rule still fires; `tsc` would otherwise
fail the package build on a fixture that is doing its job.
