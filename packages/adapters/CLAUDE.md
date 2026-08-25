# CLAUDE.md

This package owns the boundary between untrusted vendor telemetry dialects and the canonical robot envelope defined by `packages/contracts`.

Follow the repository-level [`CLAUDE.md`](../../CLAUDE.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs. Also follow every adapter-specific instruction in [`AGENTS.md`](./AGENTS.md); that file is the authoritative scoped guide for this directory.

Before changing adapter behavior, read [`docs/00_adr/01_ADAPTER_BOUNDARY.md`](../../docs/00_adr/01_ADAPTER_BOUNDARY.md). Read ADR 2 for ingest-boundary changes and ADR 3 for timestamp or freshness-related changes.

In particular:

- Decode `unknown` vendor input with vendor-specific runtime schemas; reject malformed data without coercion.
- Normalize only shared meaning into the canonical core and express real differences through declared capabilities.
- Keep one module plus deterministic fixtures and exact-output contract tests per generic vendor (`A`, `B`, and `C`).
- Count unknown fields per adapter, retain raw input only for technician diagnosis, and never leak raw vendor payloads into fleet state or WebSocket deltas.
- Accept server-provided `receivedAt`, normalize vendor time to `reportedAt`, and never derive freshness in this package.
- Add vendors locally without changing the canonical model for vendor convenience.
- Keep comments exceptional under ADR 39: export location and coupling do not trigger prose, and any doc comment must preserve a non-obvious contract rather than restate its signature (ADR 28). Prefer focused test-first diffs.
- Stop and surface any conflict with `PRINCIPLES.md` or an ADR.

Do not duplicate the detailed scoped rules here. Update [`AGENTS.md`](./AGENTS.md) when the adapter package's architecture or workflow changes so the two agent entry points cannot drift.
