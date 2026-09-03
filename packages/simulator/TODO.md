# TODO — `packages/simulator`

**Authority:** Planning only. Accepted ADRs and the simulator package specification govern conflicts.
**Reconciled:** 20 August 2026 against source, 211 tests, and the live server path.

## Status

Generation, CLI/configuration, three vendor dialects, fault injection, bounded scheduling
and HTTP transport, metrics, lifecycle, fixture recording, and adapter parity are built.
Root `pnpm dev` starts simulator, server, and web together.

## Remaining work

- **Committed browser E2E — done (ADR 32, 20 August 2026).** The Playwright smoke suite
  runs this simulator against the real server per test and asserts the rendered result:
  live rows streaming, freshness degrading when the simulator is stopped, and vendor
  normalization from its recorded dialects (`packages/web/e2e/smoke.spec.ts`).
- **Recovery scenario — done (ADR 31 policy, ADR 32 browser proof).** The committed
  restart scenario kills the server under a live simulator and watches the console
  re-join without reload.
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
