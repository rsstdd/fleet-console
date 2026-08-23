# CLAUDE.md

This package is the React fleet operations console, organized into app, feature, component,
data (hooks, stores, utils, types), context, lib, and typed configuration layers.

Follow the repository-level [`CLAUDE.md`](../../CLAUDE.md),
[`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs. Also follow every web-specific
instruction in [`AGENTS.md`](./AGENTS.md); that file is the authoritative scoped guide for
this directory.

Before changing web behavior, use the task routing table in `AGENTS.md` to read only the
relevant page/component spec and mapped ADR.

In particular:

- Keep feature-sliced dependencies moving downward; never import across features.
- Keep domain mapping and selectors in the data layers (`utils`, `types`), presentational primitives in `components`,
  and tenant values in typed config.
- Display server-derived freshness without a timer, and suppress per-robot freshness while
  the stream is down.
- Render from declared capabilities, never vendor branches, and keep operator and
  technician views distinct.
- Keep observed and requested state separate; the UI never authorizes an operation.
- Use Material UI and repository tokens, meet WCAG 2.2 AA, and define complete async states.
- Preserve the measured scale and bundle gates; optimize only from evidence.
- Add one-sentence doc comments to exports, document coupling on both sides, and prefer
  focused test-first diffs.
- Stop and surface any conflict with `PRINCIPLES.md` or an ADR.
