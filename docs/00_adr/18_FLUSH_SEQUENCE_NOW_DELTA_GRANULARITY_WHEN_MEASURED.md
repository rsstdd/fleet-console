# ADR 18 — The Flush Sequence Lands Now; Delta Granularity Stays Whole-Envelope Until Measured

**Decision:** The wire gains the server-wide flush sequence ADR 2 requires, on both the delta batch and a new fleet-snapshot response; delta granularity stays whole-envelope-per-changed-robot until a measured mass-transition flush says otherwise.
**Group:** Integration / transport (the wire-format half of ADR 2, decided before the fan-out that will carry it).
**Status:** Decided · 2026-08-19 · Implemented 2026-08-20

## Issue

Register stub **D10** asked one question and contained two. They were entangled only by living in the same schema, and they have opposite epistemic status.

**The flush sequence is not a choice.** ADR 2 § Decision, amended 19 August 2026, requires "a monotonically increasing flush sequence carried on both the snapshot and every delta", because a joining console gets initial state from `GET /api/fleet` while the socket keeps running: the client opens the socket first and buffers, then fetches the snapshot, then discards the buffered deltas the snapshot already covers. `telemetryBatchSchema` carried `sentAt` and no sequence, and **no fleet-snapshot response schema existed at all**. The shipped contract could not support the cold-start reconciliation a decided ADR had already committed to. That is a contradiction with a decided ADR, not an open option.

**Delta granularity is a choice, and it rests on an estimate.** `docs/ARCHITECTURE_AUDIT.md` § 5 and § 7 both challenge whole-envelope deltas: a freshness-only transition resends roughly 5-10x the bytes the change requires, and the mass transition — every robot crossing a threshold inside one window when telemetry stops — is exactly when that multiplier is most expensive. The audit recommends adding a freshness-only delta type _before_ the fan-out is written. But 5-10x is a multiplier, not a measurement, and nothing has measured the base it multiplies.

Deciding both together would have let the harder, unmeasured question hold up the one that blocks the socket being written correctly.

## Assumptions

- The flush sequence must exist before the fan-out is written. Retrofitting a counter into a live wire format is a coordinated three-package change; adding it to an unused schema is one package.
- `telemetryBatchSchema` has **no consumer yet** — not in `packages/server`, not in `packages/web`. Verified before changing it. That is what makes this a cheap change today and an expensive one later.
- The ADR 2 harness will exist and can measure one flush's bytes at 500 robots. If it never exists, the granularity question stays open rather than resolving by default.
- A whole-envelope delta is a keyed replace, so re-applying one is idempotent. This is what makes the boundary condition in the reconciliation forgiving _today_ and is explicitly not a property to rely on later.

## Constraints

- The socket carries **one message shape** for its whole lifetime (ADR 2 § Decision). A second shape is exactly what the initial-state decision paid the flush sequence to avoid, so adding one is a reversal of that trade, not an extension of it.
- The snapshot must carry both robot populations. ADR 3 created the never-reported population so it could read UNKNOWN rather than be absent.
- No raw vendor payload in the fleet read model or the delta stream (ADR 1). The types enforce it rather than the server remembering it.
- The reconciliation rule has to be identical on both sides of the wire, so it belongs to neither side (Principle 1).

## Decision

**Split the stub. Ship the sequence; defer the granularity.**

`packages/contracts` gains `flushSequenceSchema` — a non-negative integer, server-wide, per flush. It is not a timestamp: `sentAt` already carries wall-clock time, and two flushes inside one millisecond must still be orderable, which is precisely the mass-transition case. Zero is legal and is what a server that has never flushed reports, so a cold snapshot discards nothing.

`telemetryBatchSchema` gains `flushSequence` as a **required** field. Required rather than optional because a client cannot distinguish "flush 0" from "this server does not send sequences", and guessing wrong silently discards deltas it needed.

`fleetSnapshotSchema` is new — the `GET /api/fleet` response that ADR 2 committed to and nothing had defined. It carries `flushSequence`, `capturedAt`, and the whole fleet as a union of `canonicalEnvelopeSchema` and `registeredRobotStateSchema`. A union of two shapes this package already owns, rather than a third with nullable telemetry: ADR 1 rejects present-but-meaningless fields. The variants need no discriminator key because both are strict objects, so each rejects the other's payload and a hybrid is rejected by both.

`isDeltaCoveredBySnapshot(snapshotFlushSequence, deltaFlushSequence)` is the entire reconciliation rule, in contracts because both sides must agree on it. At-or-below is redundant: the snapshot reflects every flush up to and including its own.

**Granularity stays option 1** — whole envelope per changed robot, keyed replace on the client. Not because the audit's concern is wrong, but because acting on it costs a second message shape and a client merge path, and that price should be paid against a number rather than a multiplier. The `telemetryBatchSchema` doc comment now says so, so the next reader finds the deferral rather than assuming nobody noticed.

## Positions

On the sequence, there was no position to weigh — the alternative was leaving a decided ADR contradicted. On granularity:

1. **Whole envelope per changed robot.** Chosen, provisionally and explicitly pending measurement. One message shape, one schema, and the client cannot produce a partially-updated robot.
2. **A second, freshness-only delta type alongside it.** The next step _if_ the number justifies it. Removes most of the waste for one extra shape, and `PendingDeltaSet` already treats a freshness-only transition as first-class. Its real cost is the client merge path and the second shape ADR 2 spent the flush sequence to avoid.
3. **General field-level patch.** Rejected outright, and not merely deferred. It makes the client's store a merge engine with ordering requirements, and its failure mode is a robot displaying a mixture of two instants — which is invisible, and is the precise thing Principle 4 exists to prevent. If option 1 proves too expensive, option 2 is the next step, not this.

## Argument

Splitting was the whole decision. The two halves were bundled because they touch one schema, and bundling them meant a blocked socket waiting on a performance question nobody had data for.

Keeping option 1 unmeasured is the part worth defending, because the audit's recommendation was to act _before_ the fan-out is written and this ADR declines to. The reasoning: the wire cost of option 2 is not the extra schema, it is that the client stops being able to treat every message as a replace. Once one message merges, every future message shape has to be reasoned about for ordering, and the partial-application failure mode moves from impossible to merely unlikely. That is a real architectural loss, and 5-10x of an unmeasured base is not enough to justify paying it. A measured flush that saturates the socket or the client's frame budget is.

The counter-argument is that retrofitting option 2 after the fan-out exists is more expensive than building it now — the same argument this ADR accepts for the flush sequence. The difference is that the flush sequence is additive to a schema with no consumer, while option 2 changes the client's apply path whenever it lands. Deferring the sequence risked a coordinated three-package retrofit; deferring the granularity risks one additive schema and one client change, which the wire format already permits.

## Implications

- **`packages/server` uses one monotonic source per process.** Both shapes carry the counter; `DeltaFanOut` advances it only for a non-empty flush and the snapshot handler reads the same source. Two sources would be the defect this decision exists to prevent.
- **`packages/web` implements and tests the cold-start order.** Socket open → buffer → fetch → reconcile → apply. ADR 31 replaced the sequence-only helper with `reconcileDeltaWithSnapshot` so the process session wins before sequence comparison; unit, process, and browser tests cover the join and restart path.
- **The server must project `model` off an unobserved robot before serializing.** `UnobservedRobotState` in `packages/server` is `RegisteredRobotState & Pick<ManifestRobot, "model">`, and `registeredRobotStateSchema` is strict, so passing one through unchanged fails to parse. This is a real integration edge worth knowing before hitting it.
- **A frame assembled from several flushes carries the highest sequence it contains** (ADR 2 § Decision). Coalescing across flushes must therefore take the max, not the last-written — those differ only if flushes can be assembled out of order, and relying on them not being is the kind of assumption that survives until it does not.
- **The reconciliation boundary is at-or-below, and that choice has a shelf life.** Under whole-envelope replace, getting it wrong by one re-applies a flush harmlessly. The moment option 2 lands and application becomes a merge, the same off-by-one duplicates a merge. The comment on `isDeltaCoveredBySnapshot` says this, so whoever implements option 2 finds it.
- **Option 3 is closed, not deferred.** Reopening it needs a new ADR, not a measurement.
- **The granularity question reopens with a number.** The ADR 32 client measurement did
  not trigger it. One mass-transition flush containing all 500 transitions still needs its
  wire-byte measurement before this half can be revisited on evidence.

## Open questions

- **What is one mass-transition flush actually worth in bytes?** The reopening condition. 500 robots all crossing LIVE → STALE inside one window, whole-envelope, measured. The general browser harness exists under ADR 32; this specific byte case has not been added.
- **Does the snapshot need `capturedAt` at all, given `flushSequence`?** It is there as the analogue of a batch's `sentAt` and for measuring snapshot age, but nothing consumes it yet. If the client never reads it, it is a field ADR 1 would call a defect.
- ~~**Should the flush sequence survive a server restart?**~~ **Resolved by ADR 31** (20 August 2026): it does not survive, by design. A per-process `serverSessionId` UUID now scopes the sequence on both the snapshot and every batch, and `reconcileDeltaWithSnapshot` compares the session before any sequence — the "per-process session identifier alongside the sequence" this question predicted, taken instead of persistence.

## Observed consequences

- **20 August 2026 — the deferred granularity half has its first client-side number (ADR 32).** The browser harness drove 500 robots at ten whole-envelope frames per second, 250 robots per frame, against the production build: 120/120 frames applied, delta-to-next-paint p50 47.3 ms / p95 53.7 ms / max 74.5 ms, animation-frame interval p50 16.7 ms. Whole-envelope frames at the documented workload are absorbed inside a few frame intervals, so nothing in this number compels field-level deltas. The mass-transition byte question below remains open — this workload alternates halves; it does not put 500 simultaneous transitions in one flush.
- **20 August 2026 — the restart gap this ADR predicted was closed by ADR 31.** The comparison this ADR shipped as `isDeltaCoveredBySnapshot` was subsumed into `reconcileDeltaWithSnapshot`, which checks the new `serverSessionId` epoch before the sequence; the at-or-below boundary and its merge-path shelf-life warning carry over unchanged into the same-session branch. The wire version advanced to 2 in the same change.
- **20 August 2026 — one counter, and it advances only on a flush that sends something.** `createFlushSequence()` is the single source; `DeltaFanOut` advances it and `GET /api/fleet` reads it, so the comparison a client makes is between two views of one number rather than two numbers that both look plausible. The rule that a tick sending nothing does **not** advance it was not stated here and matters: a counter climbing on empty ticks describes no state, and a client reconciling against its snapshot would discard deltas it needed. Verified end to end — snapshot 0, then frames 1 and 2, then snapshot 2.
- 19 August 2026: contracts half implemented. `flushSequenceSchema` and `FlushSequence` in `shared/primitives.ts`; `flushSequence` required on `telemetryBatchSchema`; `fleetSnapshotSchema`, `fleetSnapshotRobotSchema`, `parseFleetSnapshot` and `isDeltaCoveredBySnapshot` added; all exported and pinned in the public-surface test. Contracts at 115 tests, up from 103.
- Making `flushSequence` required broke three existing batch tests and the pinned public-surface test, which is the wire-format change being noticed exactly where it should be. No other package broke, confirming the assumption that `telemetryBatchSchema` had no consumer.
- The union's lack of a discriminator key is pinned by a test asserting a half-populated robot — registered fields plus `receivedAt` — is rejected by both variants rather than accepted by one.
- That contracts-only landing was **Partial** at the time. The server and client halves
  landed later on 20 August 2026 and are recorded above; the decision is now implemented.

## Related

- **ADR 2** (HTTP ingest, WebSocket fan-out) — the parent. Its 19 August amendment created this requirement and its Implications already said "the initial-state contract requires a flush sequence on the wire, which is a `packages/contracts` change before it is a server or client change". This ADR is that change.
- **ADR 3** (freshness derived on a timer) — produces the mass transition that makes granularity a question at all, and the never-reported population the snapshot must carry.
- **ADR 1** (adapter boundary) — keeps the raw payload out of both the snapshot and the delta stream, enforced by the strict schemas rather than by server discipline.
- **ADR 6** (bounded in-memory state, no database) — the source of the restart question in Open questions.
- **ADR 31** (jittered reconnect and server session reconciliation) — closed that restart question with a per-process session epoch and replaced `isDeltaCoveredBySnapshot` with `reconcileDeltaWithSnapshot`.
- **Register D10** — resolved by this ADR, with its granularity half explicitly deferred rather than closed.
- **Register D17 / ADR 22** — resolved the numeric-gate policy. ADR 32 supplied the
  browser harness and client-churn result; this ADR's narrower 500-robot mass-transition
  byte measurement remains the trigger.
- **Principle 4** (freshness is explicit; never present stale data as current) — the reason option 3's mixed-instant robot is disqualifying rather than merely risky.
- **Principle 12** (performance is product behaviour, budgets are measured) — the reason option 2 waits for a measurement instead of an estimate.
