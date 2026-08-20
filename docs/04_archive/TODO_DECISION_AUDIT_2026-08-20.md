# TODO and open-decision audit — 20 August 2026

**Authority:** Historical. This point-in-time report evaluates planning documents; numbered ADRs and current package specifications remain normative.

## Executive summary

The repository has **two registered open architecture decisions**: **D22**, console stream
reconnection, and **D23**, browser-driven end-to-end automation. Both block real work.
D22 blocks automatic recovery after stream loss and exposes a correctness defect after a
server restart. D23 blocks durable browser evidence and the remaining client/stream scale
measurements, which in turn postpone the evidence-based virtualization and delta-granularity
reviews.

The planning backlog also contains **six decision-shaped gaps without register entries**.
Only two are near-term blockers: the fleet freshness-summary policy and the history API/
retention contract. The other four are conditional hardening or hygiene decisions and should
not stop current feature work.

The largest operational problem is documentation drift. Root `TODO.md` accurately says the
live server and web transport are built, while several scoped TODOs still have unchecked items
claiming that the listener, adapter contracts, live store, and server endpoints do not exist.
Those are not blockers and should be reconciled before the TODOs are used for scheduling.

## Decision inventory

### D22 — stream reconnection and server-restart policy

**State and context.** Registered open stub with no ADR. The transport connects once and
retains observed robot state after a disconnect, while the banner offers a manual retry.
There is no automatic retry schedule or stopping policy. A related correctness problem
appears after a server restart: the new process starts `flushSequence` at zero, so a client
holding a higher sequence can reject valid deltas until the new counter catches up.

**Options and tradeoffs.**

- **Bounded exponential backoff with no attempt cap, plus a process/session identifier.**
  Reduces load during an outage, continues recovering unattended, and lets the client
  distinguish a new sequence epoch. Recovery timing is less predictable, and an invalid
  endpoint could retry indefinitely unless handshake failures are classified separately.
- **Fixed-interval retry.** Simple and predictable for operators, but every open console
  repeatedly hits an unavailable server at the same rate and can create a synchronized
  recovery spike.
- **Capped retries followed by manual recovery.** Bounds traffic and makes permanent failure
  explicit, but turns a transient outage into a console that silently remains offline unless
  the stopped state and recovery control are unmistakable.
- **Manual retry only.** Preserves current simplicity and avoids speculative policy, but
  fails the documented recovery workflow and is unsuitable for an unattended operations
  console.

**Implications.** The decision affects `streamLifecycle`, `fleetTransport`, the published
connection-state union, banner copy, retry controls, sequence reconciliation, README demo
step 6, and browser tests. A session identifier is a contracts and server change, not merely
a web retry implementation. Initial handshake refusal should be distinguishable from a
previously healthy connection dropping: a rejected origin or missing route is unlikely to
heal through retries.

**Recommendation.** Adopt bounded exponential backoff with jitter and a ceiling, no attempt
cap after a connection has previously succeeded, and a terminal/manual state for a failed
initial handshake after a small bounded probe. Add a server-process session identifier to
snapshot and delta schemas; reset sequence reconciliation when it changes. Record all four
parts in one ADR so transport behavior and restart correctness cannot diverge.

### D23 — browser-driven end-to-end testing

**State and context.** Registered open stub with no ADR. The integrated path has been
observed in headless Chrome through a throwaway CDP script, but no browser test is committed.
Unit and jsdom tests cannot verify layout, paint, real socket behavior, forced colors, or
client frame cost. The repository also requires dependencies to be explicitly admitted.

**Options and tradeoffs.**

- **A narrow in-repository CDP harness using Node built-ins.** Adds no dependency or second
  test runner and matches the successful manual probe. The repository would own browser
  process discovery, protocol calls, timeouts, diagnostics, and cleanup; that small harness
  can grow into an undocumented framework.
- **Playwright.** Provides robust waiting, traces, browser lifecycle, accessibility hooks,
  screenshots, and familiar CI integration. It adds a substantial dependency, browser
  installation/cache management, a second runner or integration layer, and ongoing flake
  control.
- **Documented manual verification only.** Has no automation cost and remains appropriate
  for subjective screen-reader checks, but cannot prevent regression or generate repeatable
  client performance evidence.

**Implications.** This choice gates durable proof of disconnected freshness suppression and
rendered deltas. It also gates stream/fan-out p50/p95, WebSocket rate, memory, client frame
time, forced-colors verification, and the 500-robot delta-apply measurement that reopens ADR
18's granularity and ADR 24's virtualization questions.

**Recommendation.** Choose the narrow CDP harness now, explicitly limited to the two
load-bearing integration claims and the 500-robot measurement. Give it hard lifecycle,
timeout, and artifact rules in the ADR. Reconsider Playwright only if browser coverage grows
beyond a few end-to-end paths; keep real screen-reader verification manual because browser
automation is not equivalent evidence.

### Fleet freshness-summary suppression (A8)

**State and context.** Unregistered product/spec choice and a near-term fleet-page blocker.
ADR 3 requires per-robot freshness labels to disappear while the stream is down, because the
console cannot assert their currency. The fleet-wide summary still derives and displays
counts such as `Live 10 · Stale 2` from retained values. The page spec only settles the
per-robot case.

**Options and tradeoffs.**

- **Suppress the summary while disconnected.** Applies the same currency rule at every
  aggregation level and avoids presenting frozen counts as current. Operators lose a useful
  last-known overview precisely during an outage.
- **Retain it with explicit “last known” qualification.** Preserves operational context and
  distinguishes data loss from robot failure. It requires visible state/copy, and potentially
  a last-received timestamp, so the qualification cannot be mistaken for a live count.
- **Leave the current unqualified counts visible.** Requires no implementation change, but
  conflicts with the spirit of Principle 4 and makes the most prominent fleet indicator less
  honest than each row.

**Implications.** The page spec, summary component, accessible wording, disconnected-state
tests, and possibly the read model's last-update metadata must change together. This is a
presentation decision; it must not mutate or erase retained observed state.

**Recommendation.** Keep the summary visible but label it clearly as **last known** while
the stream is down, with the connection banner remaining the authoritative current status.
If the UI cannot provide an unambiguous qualification within the existing design, suppress
the summary instead. Never leave the counts visible as if current.

### History API response and retention capacity (G4/M4)

**State and context.** Unregistered contract choice whose ADR 6 trigger has effectively
arrived. The server has a bounded in-memory ring buffer, but the sparkline consumer, history
response schema, sampling/decimation behavior, and final capacity are not settled.

**Options and tradeoffs.**

- **Return raw retained samples with a fixed server capacity.** Simple and faithful to
  observed input, but couples payload size and chart density to telemetry rate; high-rate
  robots receive a shorter time horizon than low-rate robots.
- **Return a bounded, server-decimated time window.** Gives predictable payload and chart
  cost and makes the endpoint useful across input rates. The server must own a documented
  aggregation rule, and extrema may be lost if decimation is naive.
- **Defer or remove the sparkline endpoint.** Avoids inventing a contract for an uncommitted
  consumer, but leaves existing retained history with no user-visible purpose and keeps ADR 6
  partial.

**Implications.** The choice determines ring-buffer capacity, memory bounds at 500 robots,
the canonical response schema in contracts, server endpoint behavior, chart semantics,
freshness/absence handling, and performance tests. Capacity should derive from the time
window, sample rate, and consumer pixel/point budget rather than a round number.

**Recommendation.** First confirm the sparkline remains committed scope. If yes, define a
contracts-owned response for a fixed recent time window with an explicit maximum number of
points and server-side extrema-preserving decimation; derive per-robot retention from the
largest supported source rate plus that window. Record response and retention together in an
ADR. If the consumer is not committed, remove the endpoint from near-term TODOs and leave the
current internal bound unchanged.

### Escalation after repeated malformed stream frames

**State and context.** Unregistered conditional correctness decision. A single malformed
delta frame is dropped and counted so the next valid frame can recover. If every frame is
incompatible, the console can retain old rows indefinitely while appearing merely delayed.

**Options and tradeoffs.**

- **Escalate after a consecutive-failure threshold.** Detects sustained contract drift and
  creates a terminal, actionable state. Any fixed threshold is arbitrary and may overreact to
  a short corrupt burst.
- **Escalate by elapsed time without a valid frame.** Relates the decision to actual loss of
  trustworthy updates and works across stream rates. It requires a clock and must not confuse
  an intentionally quiet fleet with malformed traffic.
- **Never escalate; diagnostics only.** Maximizes automatic recovery and keeps transient
  corruption invisible to operators, but sustained incompatibility can degrade silently.

**Implications.** A terminal or degraded connection state needs contract-issue details,
diagnostic counters, banner copy, recovery semantics, and tests proving retained values are
not presented as current. It should compose with D22 rather than trigger an endless reconnect
against deterministically incompatible bytes.

**Recommendation.** Escalate when malformed frames are consecutive **and** no valid frame
has arrived for a configured observation window. Show a contract-mismatch state, retain rows
as last-known data, stop automatic reconnect loops until manual retry or deployment change,
and expose the count/details in diagnostics. Register this when the diagnostics surface is
scheduled; it need not block D22.

### Slow-client drain timeout (H6b)

**State and context.** Unregistered conditional resilience decision. ADR 2's per-client
keyed coalescing bounds queued content by fleet size, so a slow client cannot create an
unbounded message queue. A socket that never drains can nevertheless retain resources and
serve data too late to be operationally useful.

**Options and tradeoffs.**

- **Close after a configurable no-progress timeout.** Reclaims resources and forces a clean
  snapshot/reconnect path. Poor networks may churn, and the timeout becomes deployment
  policy requiring observability.
- **Close at a fixed buffered-byte threshold.** Responds directly to resource pressure and
  is easy to measure. It does not detect a permanently stalled client whose bounded pending
  set remains below the byte threshold.
- **Keep connections indefinitely.** Avoids churn and remains memory-bounded, but leaks
  sockets/attention and can deliver operationally obsolete updates.

**Implications.** The server needs per-client progress timestamps or buffered-byte metrics,
stable close codes/reasons, health/log events, configuration validation, and D22-compatible
client behavior. The policy must not be described as message loss: current-state coalescing
means reconnecting via a fresh snapshot is the recovery mechanism.

**Recommendation.** Use both a conservative configurable no-progress timeout and a hard
buffered-byte safety ceiling. Close with a stable application reason, count the event, and
let D22 reconnect through the snapshot-first path. Keep this out of the critical path until
real slow-client evidence or deployment hardening is required.

### Regressive sequence reporting (D6a remainder)

**State and context.** Unregistered, non-blocking observability choice. Current state already
rejects out-of-order/regressive arrivals, so robot data cannot move backward. The health
model counts gaps and duplicates but has no term for a rejected lower sequence, making that
specific integration failure invisible in the published rollup.

**Options and tradeoffs.**

- **Add a `regressions` counter to `SequenceHealth`.** Makes rejected stale input explicit
  and queryable. It changes a strict contracts-owned response and every consumer/fixture.
- **Fold regressions into duplicates or gaps.** Avoids a schema change, but destroys meaning:
  a lower sequence is neither a duplicate nor a missing forward value.
- **Log only.** Preserves the contract and provides forensic evidence, but health consumers
  cannot detect or alert on the condition.

**Implications.** A new field affects contracts, server aggregation scope, health decoding,
technician diagnostics, fixtures, and compatibility expectations. The counter should follow
the existing per-robot/per-vendor scope rules and must not change the already-correct state
transition.

**Recommendation.** Add an explicit `regressions` counter the next time the health contract
is versioned for a real consumer need; do not misclassify it under existing counters. Until
then, emit a stable structured log event and keep this off the feature critical path.

### Test-file layer classification

**State and context.** Unregistered mechanical-rule choice and hygiene only. Robot-detail
test fixtures currently live beside the feature because `*.test.tsx` files match the feature
layer before any test-layer exception. Classifying all tests as a separate layer would allow
the fixtures to move under `src/test`, but would relax import boundaries repository-wide for
test files.

**Options and tradeoffs.**

- **Keep tests classified as their production layer.** Tests exercise the same dependency
  rules as production code and cannot hide feature-to-feature coupling. Shared fixture
  placement is less tidy and some production-layer directories retain test-only data.
- **Classify every test as a permissive test layer.** Centralizes fixtures and enables broad
  integration imports. It can conceal illegal production dependency direction behind tests
  that construct architectures production code may not use.
- **Add narrow fixture-only exceptions.** Improves reuse without granting every test broad
  access, but adds ESLint pattern complexity and another boundary concept to maintain.

**Implications.** Any change modifies mechanical architecture enforcement and must cite an
ADR and be registered in `docs/decisions.json`. Boundary-violation tests must prove the new
exception cannot leak into production files.

**Recommendation.** Keep tests in their production layer by default. If duplicated fixtures
become material, introduce a narrowly named testing-fixture subpath with explicit allowed
consumers rather than a universal test-layer exemption. Do not register a decision solely to
move the current fixture file.

Other ADR “Open questions” are triggers for future evidence, not currently blocking
decisions. Examples include unknown-field ledger bounds (ADR 15), captured timestamps and
per-robot accounting (ADRs 18/25), raw-payload persistence semantics (ADR 26), and whether a
future dialect reports connectivity (ADR 30). They should remain deferred until their named
trigger occurs.

## Dependency chain

```text
D22 reconnect/restart policy
  -> automatic recovery and README demo step 6
  -> truthful retry/stopped connection states

D23 browser-E2E policy
  -> durable live-stream/browser evidence
  -> client and fan-out measurements at 500 robots
  -> reconsider whole-envelope deltas (D10 / ADR 18)
  -> reconsider fleet-table virtualization (D14 / ADR 24)

History contract + retention decision
  -> GET history endpoint
  -> sparkline consumer

Fleet-summary currency decision
  -> complete offline fleet-page state and its tests
```

## Planning-document findings

1. **The generated decision index is internally consistent.** `docs/decisions.json` maps
   D1–D21 to numbered ADRs and leaves only D22–D23 without ADRs; the generated index shows
   the same two open stubs.
2. **“Partial” does not mean “open decision.”** D5, D9, D10, D12, D16–D18 have normative
   ADRs. Their unfinished portions are implementation or measurement follow-ups unless a
   named reopening trigger fires.
3. **Scoped TODO status is stale in both directions.** `packages/contracts/TODO.md`,
   `packages/simulator/TODO.md`, `packages/server/TODO.md`, and the web feature TODOs retain
   unchecked bootstrap work that root `TODO.md` records as completed on 20 August. Current
   source includes the server listener/composition root, ingest and read handlers, fan-out,
   web fleet transport, and adapter contract suites.
4. **The server TODO's “Open decisions” section is especially stale.** M2 and M3 have
   implemented answers in root configuration and freshness policy; M4 remains genuine;
   M1, M5, M6 and M7 are explicitly resolved. This section should not be treated as a list
   of current blockers.
5. **Several unregistered choices are scattered across TODO prose.** This conflicts with
   the root completion rule that unresolved decisions be registered instead of silently
   carried as notes. Only decision-shaped items whose trigger has fired should receive new
   D-ids; speculative ADR open questions should not be promoted prematurely.

## Recommended order

1. Decide **D22** first. It is the only open decision tied to an operator-visible recovery
   failure and a known silent-update defect after restart.
2. Decide **D23** next, because it unlocks multiple verification and measurement claims.
3. Resolve the **fleet summary suppression** choice before declaring the fleet async/offline
   state complete.
4. If the sparkline is still committed scope, register and decide the combined **history
   response + retention capacity** question; otherwise explicitly defer the feature.
5. Reconcile scoped TODO checkboxes against current source and root `TODO.md`. Keep the
   repeated-frame, slow-client, sequence-reporting, and test-layer choices visibly deferred,
   but do not label unrelated work blocked by them.

## Sources evaluated

- `TODO.md` and all planning files registered under `authorityMarkers.planning` in
  `docs/decisions.json`.
- `docs/decisions.json` and generated `docs/PENDING_ARCHITECTURE_DECISIONS.md`.
- Numbered ADRs linked by partial decisions and by the open TODO items discussed above.
- Targeted current-source inventory for server transport/composition and web transport, used
  only to distinguish stale checklist claims from genuine blockers.
