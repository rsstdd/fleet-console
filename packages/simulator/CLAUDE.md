# CLAUDE.md

This package is the thin, deterministic multi-vendor telemetry producer for adapter, ingest, freshness, demonstration, and load testing.

Follow the repository-level [`CLAUDE.md`](../../CLAUDE.md), [`PRINCIPLES.md`](../../PRINCIPLES.md), and accepted ADRs. Also follow every simulator-specific instruction in [`AGENTS.md`](./AGENTS.md); that file is the authoritative scoped guide for this directory.

Before changing simulator behavior, read ADRs 1, 2, and 3 under [`docs/00_adr`](../../docs/00_adr). They define the vendor dialects, HTTP ingest/load shape, and the meaning of silence.

In particular:

- Emit raw Vendor A, B, and C payloads directly over HTTP; never construct canonical envelopes or normalize through adapters inside the simulator.
- Preserve the documented dialect disagreements, including Vendor B's missing sequence and Vendor C's intentional undocumented field.
- Keep normal defaults near 50 robots at 1 Hz and support the required `--robots 500 --hz 5` load profile.
- Make generation deterministic with injected clocks and seeded randomness, and validate all CLI/configuration at startup.
- Implement `--drop` as targeted absence: selected robots send nothing while the process and unaffected robots remain healthy.
- Never compute freshness or put synthetic freshness states into telemetry. The server sweep detects silence from missing arrivals.
- Bound HTTP concurrency and retries, expose achieved send rate and failures, and avoid per-success logging in load mode.
- Keep scheduling, generation, faults, and transport separable and test them with fake timers rather than wall-clock sleeps.
- Coordinate dialect changes with adapter fixtures/tests and transport changes with the server and ADR 2.
- Add one-sentence doc comments to exports, document non-trivial coupling on both sides, and prefer focused test-first diffs. Lint rejects a comment that only restates its signature, so the sentence has to earn its place (ADR 28).
- Stop and surface any conflict with `PRINCIPLES.md` or an ADR.

Do not duplicate the detailed scoped rules here. Update [`AGENTS.md`](./AGENTS.md) when this package's architecture or workflow changes so the two agent entry points cannot drift.
