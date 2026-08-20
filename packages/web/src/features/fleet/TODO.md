# TODO — `features/fleet`

**Authority:** Planning only. The fleet page specification and accepted ADRs govern conflicts.
**Reconciled:** 20 August 2026 against the live store, transport, and page tests.

## Status

The page reads the app-owned decoded fleet store, renders fleet-wide filters and counts,
retains rows during connection loss, and suppresses every per-robot freshness label unless
the socket is connected. The live vertical path has been observed in a browser.

## Remaining work

- **A1 — complete resource-state modeling.** `useFleetRobots` still returns a bare robot
  array. Initial loading, background refresh, recoverable snapshot failure, and terminal
  contract failure need an entity-owned discriminated state before the page can render the
  complete Principle 5 matrix without duplicating transport state.
- **A4 — surface rejected-frame diagnostics.** Malformed snapshots are terminal and
  malformed stream frames are dropped and counted, but the rejected-frame count has no
  technician diagnostics surface. Escalation after repeated failures is trigger-deferred
  until that surface is scheduled.
- **A7 — qualify disconnected fleet counts.** Rows correctly suppress freshness while the
  stream is down, but the aggregate counts remain visible. ADR 23 owns the open product
  question: qualify the group as last known or suppress it. Do not leave it looking current.
- **D22 — automatic recovery.** Manual retry exists; retry schedule, stopping behavior,
  initial-handshake treatment, and server-restart reconciliation remain unratified.
- **D23 — committed browser automation.** Manual headless observation is not a durable test.
- **Scale evidence.** The non-virtualized table is correct at 500 static rows. Delta-to-paint
  cost at that size remains unmeasured, so ADR 24's virtualization trigger has not fired.

## Constraints

The client never derives freshness or starts a freshness timer. Stream state remains
separate from observed robot state and local filters. Any browser harness must use decoded
contract payloads and accessible roles rather than implementation selectors.
