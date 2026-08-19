# CLAUDE.md

This package is the thin runtime authority for telemetry ingest, adapter dispatch, in-memory state/history, freshness sweeping, HTTP reads, WebSocket delta fan-out, and operational health.

Follow the repository-level [`CLAUDE.md`](../../CLAUDE.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs. Also follow every server-specific instruction in [`AGENTS.md`](./AGENTS.md); that file is the authoritative scoped guide for this directory.

Before changing server behavior, read ADRs 1, 2, 3, and 6 under [`docs/00_adr`](../../docs/00_adr). They define the adapter seam, transport, freshness ownership, and storage model.

In particular:

- Validate all external input, establish `receivedAt` at ingest, and delegate vendor decoding to `packages/adapters`.
- Store only decoded canonical state from `packages/contracts`; keep current state, bounded history, derived freshness, requested state, and health metrics separate.
- Keep state in memory with a bounded per-robot ring buffer. Do not add a database or broker under the accepted ADRs.
- Run the 500 ms freshness sweep server-side from validated configuration, using only `receivedAt` and the pure contracts function.
- Treat freshness-only transitions as deltas and keep the sweep independent from WebSocket coalescing.
- Fan out changed robots only at up to 10 Hz; never include raw vendor payloads in fleet responses, history, or deltas.
- Serve raw input only as a separate technician diagnostic field on the single-robot endpoint, and report unknown fields at their true per-adapter scope.
- Keep ingest idempotent, prevent out-of-order regression, and represent sequence checks as not evaluated where the source has no reliable sequence.
- Authorize protected operations on the server and never collapse requested command state into observed telemetry.
- Add one-sentence doc comments to exports, document non-trivial coupling on both sides, and prefer focused test-first diffs with injected clocks. Lint rejects a comment that only restates its signature, so the sentence has to earn its place (ADR 28).
- Stop and surface any conflict with `PRINCIPLES.md` or an ADR.

Do not duplicate the detailed scoped rules here. Update [`AGENTS.md`](./AGENTS.md) when this package's architecture or workflow changes so the two agent entry points cannot drift.
