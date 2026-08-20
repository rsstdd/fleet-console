# TODO — `packages/simulator`

**Authority:** Planning only. Accepted ADRs and the simulator package specification govern conflicts.
**Reconciled:** 20 August 2026 against source, 211 tests, and the live server path.

## Status

Generation, CLI/configuration, three vendor dialects, fault injection, bounded scheduling
and HTTP transport, metrics, lifecycle, fixture recording, and adapter parity are built.
Root `pnpm dev` starts simulator, server, and web together.

## Remaining work

- **Committed browser E2E (blocked by D23).** Automate the live path from simulator ingest
  through server freshness and WebSocket fan-out to rendered fleet/detail behavior. The
  equivalent path was observed manually but is not a repository test.
- **Recovery scenario (blocked by D22).** After the reconnection policy is ratified, prove
  resumed emission and a restarted server recover without a page reload and without a
  client freshness timer.
- **Full-stack scale evidence.** Capture ingest-to-fan-out p50/p95, WebSocket frame rate,
  server memory/event-loop health, and browser delta-to-paint behavior at 50 @ 1 Hz and
  500 @ 5 Hz. Report the environment and degradation point; do not infer server or browser
  performance from the simulator-only 2,500 readings/s result.
- **Protocol changes remain deferred.** Do not add batch emission merely to improve a
  benchmark; ADR 2 requires evidence and a coordinated server mode first.

## Verification

Keep the simulator independent of workspace packages in production. Adapter use remains
test-only, fixture recording stays deterministic, and real-time/load harnesses remain out
of the default unit-test command.
