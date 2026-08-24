# CLAUDE.md

This package is the framework-independent authority for the canonical robot envelope, capability contracts, runtime wire schemas, and pure freshness derivation.

Follow the repository-level [`CLAUDE.md`](../../CLAUDE.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs. Also follow every contracts-specific instruction in [`AGENTS.md`](./AGENTS.md); that file is the authoritative scoped guide for this directory.

Before changing the canonical model, read [`docs/00_adr/01_ADAPTER_BOUNDARY.md`](../../docs/00_adr/01_ADAPTER_BOUNDARY.md). Read ADR 2 for boundary or wire-format changes, ADR 3 for timestamp or freshness changes, and ADR 6 for state/history implications.

In particular:

- Keep this package pure, side-effect free, and independent of every other workspace package and application framework.
- Define runtime Zod schemas alongside canonical types; never trust a cast at an external boundary.
- Keep the normalized core limited to meaning shared across vendors and represent real differences through typed, declared capabilities.
- Preserve `reportedAt` and `receivedAt` as distinct epoch-millisecond values with distinct purposes.
- Serialize capability entries as the ADR-defined wire array and transform them into the runtime mapped record without a parallel declaration set.
- Keep freshness derivation pure and based only on `receivedAt`, injected time, and explicit thresholds. The server owns the recurring sweep.
- Evolve schema versions deliberately and test malformed, boundary, additional-field, unsupported-version, and JSON round-trip behavior.
- Add one-sentence doc comments to everything exported or re-exported by the declared public entry point, `src/index.ts` (ADR 37), document non-trivial coupling on both sides, and prefer focused test-first diffs. Lint rejects a comment that only restates its signature, so the sentence has to earn its place (ADR 28).
- Stop and surface any conflict with `PRINCIPLES.md` or an ADR.

Do not duplicate the detailed scoped rules here. Update [`AGENTS.md`](./AGENTS.md) when this package's architecture or workflow changes so the two agent entry points cannot drift.
