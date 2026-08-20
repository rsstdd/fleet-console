# TODO — `packages/server`

**Authority:** Planning only. Accepted ADRs and the server package specification govern conflicts.
**Reconciled:** 20 August 2026 against source, 160 tests, and the live HTTP/WebSocket path.

## Status

The runtime process is built. It validates configuration, seeds registered state, ingests
all three vendor dialects, rejects malformed input at the boundary, retains bounded raw
diagnostics, derives freshness on the server sweep, serves fleet/robot/health reads, and
fans out robot-level deltas over `/ws`. `pnpm dev` and `pnpm start` are supported.

## Active blockers

### H3c/H6c — stream recovery and restart integrity (D22)

Automatic reconnection, stopping policy, initial-handshake classification, and the meaning
of a server restart remain one registered open decision. A restarted server resets its
flush counter, so sequence-only client reconciliation can reject valid new-process deltas.
Do not add retry timing or a session field before D22 is ratified by a numbered ADR.

### Browser evidence (D23)

The full path was observed in headless Chrome, but no browser test is committed. This blocks
durable evidence for stream-loss suppression, restart recovery, forced-colors behavior, and
client-side scale measurements; it does not mean the server listener or fan-out is absent.

## Actionable non-blockers

### G4/M4 — history response and retention capacity

The ring buffer is bounded, but the proposed battery-history consumer, response contract,
window, capacity, and decimation rule are not ratified. Keep the existing internal bound
until the history/retention decision is registered and accepted; do not expose an endpoint
from a planning document alone.

### I1/I2/I3/L7 — observability and full-stack measurement

Structured startup, shutdown, ingest-failure, and freshness-lateness events exist, as do
validation-cost and simulator-only measurements. Remaining evidence is end-to-end
ingest-to-fan-out latency, WebSocket rate, event-loop/memory behavior, browser paint cost,
and the degradation point at the documented workloads.

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
- **Regressive sequence reporting:** state already rejects lower sequences; structured
  reporting and any health-contract counter wait for an approved consumer need.
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
