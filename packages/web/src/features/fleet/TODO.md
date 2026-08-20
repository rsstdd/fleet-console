# TODO — `features/fleet`

**Authority:** Planning only. The fleet page specification and accepted ADRs govern conflicts.
**Reconciled:** 20 August 2026 against the live store, transport, and page tests.

## Status

The page reads the app-owned decoded fleet store, renders fleet-wide filters and counts,
retains rows during connection loss, and suppresses every per-robot freshness label unless
the socket is connected; the summary counts stay visible under a heading qualified
"· last known" while the stream is down. The live vertical path has been observed in a
browser.

## Remaining work

- **A1 — complete resource-state modeling.** `useFleetRobots` still returns a bare robot
  array. Initial loading, background refresh, recoverable snapshot failure, and terminal
  contract failure need an entity-owned discriminated state before the page can render the
  complete Principle 5 matrix without duplicating transport state.
- **A4 — surface rejected-frame diagnostics.** Malformed snapshots are terminal and
  malformed stream frames are dropped and counted, but the rejected-frame count has no
  technician diagnostics surface. Escalation after repeated failures is trigger-deferred
  until that surface is scheduled.
- **A7 — qualify disconnected fleet counts — done (ADR 23 amendment, 20 August 2026).**
  The four counts sit in a section under a visible h2 that reads "Fleet freshness" while
  connected and "Fleet freshness · last known" in any other state, derived from the same
  `isStreamConnected` that suppresses the rows. No per-metric tag, no aria-live, no client
  timestamp. Six unit tests and the Playwright outage scenario hold it; fleet spec § 2/§ 8
  record it.
- **Automatic recovery — done (ADR 31, 20 August 2026).** The transport reconnects on a
  full-jitter schedule, detects a restarted server by its session, and the published
  vocabulary gained `connecting` plus terminal causes for the banner.
- **Committed browser automation — done (ADR 32, 20 August 2026).** Six Playwright
  scenarios drive this page against the real stack in Chromium, Firefox, and (in CI)
  WebKit, including keyboard operation with streaming updates and freshness degradation.
- **Scale evidence — measured (ADR 32, 20 August 2026).** Delta-to-paint at 500 robots
  under a live 10 Hz stream: p50 47.3 ms, p95 53.7 ms, max 74.5 ms, 120/120 frames
  applied. ADR 24's virtualization trigger was checked against a real number and has not
  fired; the deferral now rests on evidence.

## Constraints

The client never derives freshness or starts a freshness timer. Stream state remains
separate from observed robot state and local filters. Any browser harness must use decoded
contract payloads and accessible roles rather than implementation selectors.
