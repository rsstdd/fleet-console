# Gated Repeated Malformed Stream-Frame Escalation

**Authority:** Planning only. This work is trigger-deferred and is not a registered decision.
**Status:** Trigger-deferred
**Updated:** 2026-08-20
**Trigger:** A repeated malformed-frame rejection run is observed on the shipped rejected-frame diagnostics surface, or escalation is explicitly scheduled.

> The diagnostics _surface_ half of the original trigger landed on 20 August 2026 (WEB
> alignment plan): the session-wide rejected-frame count now shows in technician
> Diagnostics with its scope stated. Escalation — this plan's remaining substance —
> stays deferred, and the trigger above is restated so it remains observable.

## Summary

Preserve this as a gated implementation plan after D22. Do not register a D-id or ADR
until the global stream-diagnostics surface is scheduled. The gate does not block D22,
D23, fleet-count qualification, or battery history.

When the trigger fires, two or more consecutive malformed delta frames escalate when no
valid delta has arrived for 10 seconds. The console enters a terminal contract-mismatch
state, retains rows as last-known data, suppresses freshness, cancels automatic
reconnection, and waits for manual retry or a new application deployment.

## Decision and Interface Changes

- At scheduling time, allocate the next available D-id and ADR, update
  `docs/decisions.json`, and regenerate the decision index. Do not reserve identifiers,
  or any other identifier while this plan remains gated.
- Add validated deployment configuration at TenantConfig.streamPolicy.contractMismatchObservationMs, set to 10_000 for both profiles.
- Extend the published connection vocabulary with contract-mismatch; all states except connected continue suppressing per-robot freshness.
- Add a transport diagnostics model containing:
  - lifetime rejected-frame count;
  - current consecutive count;
  - first/last rejection and last valid-frame timestamps;
  - escalation timestamp;
  - most recent frame’s issue count and first 20 ContractIssue details, with visible truncation.

- Pass rejected-frame issues out of fleetTransport instead of reporting only an unqualified increment. No server or canonical wire-contract change is
  required.

## Behavior and UI

- Start the observation period with the first malformed delta. Escalate only when at least two malformed deltas have occurred without an intervening valid
  delta and 10 seconds have elapsed since the first rejection.

- A valid delta cancels the timer and resets the current streak; cumulative count and latest diagnostic evidence remain available. Snapshots and socket opens
  do not count as valid delta frames.

- Preserve a malformed streak across automatic reconnect attempts so deterministically incompatible bytes cannot create a reconnect loop.
- On escalation, close the socket, cancel D22 retry timers, ignore stale callbacks, retain the fleet store unchanged, and publish contract-mismatch.
- Manual retry immediately clears the terminal latch and current streak, retains cumulative diagnostics, and starts one fresh D22 connection attempt. A page
  reload/new deployment creates a new application instance and therefore clears the in-memory latch.

- Update the banner and header with: Stream contract mismatch · showing last known state (may be stale) and the existing Retry now control.
- Add a closed-by-default Stream diagnostics shell toggle. Its accessible inline panel shows the policy window, counts, timestamps, and safe issue path/code/
  message details; it never displays rejected values and never opens automatically.

- When implemented, update the new normative ADR, decision mapping, generated index,
  connection-banner component specification, app-shell page specification, web package
  specification, root and web TODOs, and root and web README diagnostic workflows.
- Leave the dated decision audit unchanged. D22 remains independently implementable and
  is not amended to depend on this gated work.

## Test and Acceptance Plan

- Write focused tests first for one malformed frame followed by silence, repeated malformed frames reaching the window, a valid frame resetting the streak, a
  second rejection arriving after the deadline, and streak preservation across reconnects.

- With fake timers, prove escalation occurs exactly once, closes the socket, cancels automatic retries, ignores stale timers/callbacks, and cannot create
  concurrent sockets.

- Prove manual retry reconnects immediately, clears only the active mismatch state, and preserves cumulative diagnostic evidence.
- Verify diagnostics cap details at 20 entries, report truncation, retain no rejected values, and distinguish lifetime count from the current streak.
- Component tests cover banner copy, retry behavior, closed-by-default diagnostics, keyboard/ARIA operation, no focus theft, retained rows, and freshness
  suppression in contract-mismatch.

- Validate the new configuration field, including missing, non-integer, and non-positive values.
- In a controlled running browser, render valid rows, inject repeated malformed deltas, confirm rows remain while freshness disappears, confirm no automatic
  reconnect occurs after escalation, inspect diagnostics, then manually retry and recover with a valid frame.

- Run web tests, lint, build, type-safety and architecture-documentation checks, repository tests, and git diff --check.

## Assumptions

- D22 lands first and supplies cancellable automatic retry scheduling and
  terminal-cause handling; this work uses the next identifiers available only when its
  diagnostics trigger fires.
- “Consecutive” means at least two malformed delta frames with no valid delta between them.
- “Deployment change” means loading a newly deployed application instance; no live build-version polling is introduced.
- Diagnostics are session-local, bounded, technician-facing, and not an authorization surface.
- No dependencies or commits are added.
