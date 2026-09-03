# TODO — `packages/server`

**Authority:** Planning only. Accepted ADRs and the server package specification govern conflicts.
**Reconciled:** 20 August 2026 against source, 189 tests, and the live HTTP/WebSocket path.

## Status

The runtime process is built. It validates configuration, seeds registered state, ingests
all three vendor dialects, rejects malformed input at the boundary, retains bounded raw
diagnostics, derives freshness on the server sweep, serves fleet/robot/battery-history/health reads,
and fans out robot-level deltas over `/ws`. `pnpm dev` and `pnpm start` are supported.

## Resolved evidence

### D6a — privacy-safe regressive-sequence event — **done 20 August 2026**

Every rejected lower sequence now emits exactly one structured
`telemetry.sequence_regression` warning with canonical robot, vendor, and adapter ids,
the accepted and received sequence values, and server `receivedAt`. The store still owns
the comparison and returns both values to ingest; the event includes no raw payload or
vendor prose. Focused store, ingest, and live-composition tests prove state, retained raw
diagnostics, history, deltas, and existing counters do not change. A public `regressions`
counter remains separately trigger-deferred until a real consumer requires coordinated
contract versioning.

### H3c/H6c — stream recovery and restart integrity — **resolved by ADR 31, 20 August 2026**

Automatic reconnection, stopping policy, initial-handshake classification, and restart
reconciliation were ratified and implemented together: the server mints one
`serverSessionId` per runtime, stamps it on the snapshot and every frame, and the client's
`reconcileDeltaWithSnapshot` compares session before sequence, so a reset flush counter no
longer strands a reconnecting console. Evidence: `runServer.test.ts` (restart over real
sockets) and the web transport suite (fake-timer recovery schedule).

### Browser evidence — done (ADR 32, 20 August 2026)

D23 was ratified as ADR 32. The committed Playwright suite starts this package's real
server (and kills and restarts it) per test: stream-loss suppression, restart recovery,
and the 500-robot client measurement are durable browser evidence now. Forced-colors
inspection remains explicitly manual.

## Actionable non-blockers

### G4/M4 — history response and retention capacity — **resolved by ADR 33 (D24), 20 August 2026**

The response contract, window, capacity, and decimation rule were registered and ratified
together: the store retains compact `{receivedAt, batteryPercent | null}` samples at the
derived `HISTORY_CAPACITY = 3_001` per robot, `selectBatteryHistory` decimates the
60-second window to at most 60 extrema-preserving points, and
`GET /api/robots/:id/history` serves the contracts-owned response as the fifth route.
Evidence: `currentStateStore.test.ts` (retention, wraparound, exclusion of rejected
upserts), `selectBatteryHistory.test.ts` (decimation properties and parser round trips),
`createApp.test.ts`/`runServer.test.ts` (route statuses and live wiring), and the measured
89.5 MiB retention at the design workload, reported and not gated (ADR 22).

### I1/I2/I3/L7 — observability and full-stack measurement

Structured startup, shutdown, ingest-failure, and freshness-lateness events exist, as do
validation, HTTP-throughput, sweep-lateness, retention-memory, and browser-paint
measurements. Remaining server/stream evidence is ingest-to-fan-out latency, coalesced
WebSocket rate under load, process memory over time, and the degradation point; current
runs reached 5,971 requests/s without finding that point.

### WebSocket origin policy

HTTP CORS uses the validated allow-list, while the `/ws` handshake is not origin-checked.
ADR 8 records the open policy question. Resolve it before exposing the demo beyond its
current deployment assumptions; do not mistake CORS for authentication.

## Deliberate product cuts and release risks

### K4 — unauthenticated raw diagnostics

ADR 26 deliberately leaves `GET /api/robots/:id` raw diagnostics unauthenticated. The
technician warning is built, but this remains a release risk and deliberate product cut,
not an authorization feature silently supplied by the UI.

## Trigger-deferred decisions

- **Malformed-frame escalation:** register when a global stream-diagnostics surface is
  scheduled; current behavior drops and counts malformed frames while retaining last-known
  data.
- **H6b slow-client drain:** keyed coalescing bounds queued robot state, but timeout and
  buffered-byte closure policy wait for representative evidence or deployment hardening.
- **Regressions health counter:** add it only when a real health or technician-diagnostics
  consumer requires coordinated contract versioning. The structured log above does not
  wait on this trigger.
- **Batch ingest / worker or process scaling:** follow ADR 2's staged mitigation only after
  measured per-request or validation saturation.

## Deliberate non-goals

No database, broker/MQTT, command endpoint, authentication system, or authorization policy
is implied by this checklist. Capabilities never authorize commands.

## Verification

Current boundary, ingest, state, sweep, read, fan-out, shutdown, origin-policy, and no-leak
tests pass. Future changes start with focused tests and finish with package lint/typecheck,
repository tests, architecture-documentation checks, and a running-process verification
when user-visible behavior changes.
