# ADR 6 — Bounded In-Memory History, No Database

**Decision:** Current robot state and a small bounded ring buffer per robot for history live in memory; there is no database in the server package.
**Status:** Decided · 2026-08-19 · Implemented (amended by ADR 33, 20 August 2026)
**Group:** Data / server-side state.

## Issue

The server needs somewhere to keep telemetry history for two purposes: the decimated sparklines on robot detail, and the sequence-gap and duplicate/out-of-order detection the idempotent upsert path relies on. An earlier revision of the project plan specified SQLite; a later one cut it.

This ADR resolves whether persisted history is the correct mechanism for what history is actually used for here, or whether it is scope borrowed from what a production system would eventually need rather than what these read paths require.

## Assumptions

- The only consumer of telemetry history is the sparkline on robot detail, and sparklines are decimated before rendering. The fidelity a database preserves is fidelity nothing in the read path asks for.
- This is a single-process, single-machine demonstration rather than a multi-instance deployment. Persistence surviving a process restart has no audience: no operator will reload the console after a restart expecting yesterday's history.
- Sequence-gap and duplicate detection are a per-robot, single-value comparison — is this sequence number greater than the last stored one — not a query over historical sequences. They do not require a queryable store either.
- The ingest-path ceiling is a combination of per-request HTTP overhead and CPU-bound validation, not solely the latter. Zod validation of a small telemetry object at 2,500 messages per second (500 robots at 5 Hz) consumes low single-digit percent of one core, which makes per-request HTTP overhead at 2,500 discrete POSTs per second the more likely first bottleneck. The harness assigned to ADR 2 must discriminate between the two candidates (Principle 12).
- The measurement commitment covers the ingest and fan-out path, not a persistence layer. A database would add surface area to the system without adding surface area to what gets measured.

## Constraints

- Budget: a schema, a write path, a rebuild-on-restart path, and a migration file for SQLite were estimated at thirty to fifty minutes the schedule does not have.
- `CLAUDE.md`'s rule that no dependency is added without an ADR applies to `better-sqlite3` exactly as it would to a state-management library on the front end. This ADR is that record, and it records a decision not to add the dependency (Principle 14).
- Whatever is chosen must not misrepresent what "retained for diagnosis" means for the raw payload. Per the robot-detail page spec that payload is served only on the single-robot endpoint, which is a separate retention question from the history ring buffer.

## Decision

Current robot state lives in memory, one entry per robot, rebuildable from the next snapshot on restart. History lives in a small bounded ring buffer per robot, sized to what a decimated sparkline consumes — tens of points, not hundreds — also in memory. There is no database anywhere in the server package. Sequence-gap and duplicate detection read only the current stored sequence number for a robot, not a persisted log of prior sequences.

## Positions

1. **SQLite, as originally scoped.** A real embedded database, a `migrations` directory, a `history` table keyed by robot id and timestamp, queried for sparkline rendering and gap analysis. Rejected: it is the correct answer for a system that needs to survive a restart or answer ad hoc historical queries, and this one does neither. Building it anyway would be building the appearance of production-readiness rather than production-readiness itself.
2. **A time-series-oriented in-memory structure, such as a per-robot sorted array with time-bucketed rollups.** Considered for the case where the sparkline needed variable time windows — last hour against last day. Rejected as premature: the demo script runs on the order of minutes, so no window in this system is long enough to need rollups. A flat ring buffer covers every window that will be exercised.
3. **No history at all, with sparklines removed from scope.** Considered as the cheapest option. Rejected: a sparkline showing recent trend is one of the few genuinely differentiating details on robot detail, and the ring buffer is roughly twenty lines. Removing the feature saves less time than keeping the simple version costs.
4. **Bounded in-memory ring buffer, current state also in memory, both rebuildable and neither persisted.** Chosen.

## Argument

The ring buffer was chosen because it is sized to exactly what the read path consumes and nothing more. That is the same standard applied to the front end's decimation of history before it reaches a sparkline component, and this ADR is the server-side half of that decision.

SQLite was rejected because it answers a persistence question nobody here is asking. There is no multi-session continuity requirement, no operator returning after a restart, and no query more complex than "the last N points for this robot" or "is this sequence number newer than the last one I stored." A plain in-memory structure answers both without a query planner, and testing it is a pure, fast unit test (Principle 10).

The point at which persistence becomes necessary is named in Implications rather than left implicit.

## Implications

- The README's "not built" table carries an entry naming persistent history and retention as a deliberate cut, with this ADR as the reference.
- A server restart during a live demo loses all history and all current state. The demo script should avoid restarting the server mid-sequence, or narrate the rebuild-from-next-snapshot behaviour if a restart happens.
- Scaling to multiple server instances behind a load balancer makes in-memory state unviable regardless of the SQLite question, because no single instance holds the full fleet state. The same constraint prices any decision in ADR 2 to use `node:cluster`: each forked worker holds its own current-state map, so the mitigation solves the ingest bottleneck at the cost of a shared-state problem. That is the multi-instance distribution problem, solved by a shared store such as Redis rather than by SQLite. It does not invalidate the mitigation. It prices it.
- If ADR 2 names worker-thread validation as an alternative mitigation, it must account for the structured-clone transfer cost, which frequently exceeds validating inline for objects this small. Process-level forking parallelizes ingest end-to-end; worker-thread validation pays to move the payload across a boundary first.
- Sustained event-loop blocking delays the ADR 3 freshness sweep as well as fan-out. The ingest-path ceiling therefore degrades freshness accuracy and not only latency, so ADR 2's mitigation ordering is a freshness-correctness concern rather than only a throughput concern.
- The point to revisit this decision: a requirement for cross-session continuity, where an operator needs history from before they opened the console, or ad hoc historical queries such as "what did robot R-204 report between 2pm and 3pm yesterday." A real time-series or relational store becomes necessary then, not before.

## Open questions

- ~~Is the ring buffer a fixed-size array with a write cursor, or a fixed-length deque?~~
  - **Closed 19 August 2026: array with a write cursor, capacity 60.** The lean held. See Observed consequences.

## Observed consequences

- 19 August 2026: implemented as a fixed-size array with a write cursor. The server
  retains 60 canonical observations per robot, enough for a one-minute sparkline at
  the nominal 1 Hz reporting rate while remaining in the "tens of points" budget.

- **20 August 2026 — retention shape and capacity superseded by
  [ADR 33](./33_BATTERY_HISTORY_RETAINED_COMPACT_AND_SERVED_DECIMATED.md) (D24).** The
  buffer now holds compact `{receivedAt, batteryPercent | null}` samples, not canonical
  envelopes, at `HISTORY_CAPACITY = 3_001` per robot — one 60-second contract window at
  the simulator's validated 50 Hz ceiling, plus one inclusive boundary sample. The
  1 Hz-sized 60-envelope buffer covered 1.2 seconds at that ceiling, which is a sparkline
  claiming a minute while holding a second. This ADR's decision — bounded, in memory, no
  database, rebuildable, cleared on restart — stands unchanged; what moved is the
  arithmetic. Measured at the design workload: 500 robots × 3,001 samples retain 89.5 MiB
  (~63 bytes/sample), reported and not gated (ADR 22). The "tens of points" sizing
  language above now describes the **response** (60 decimated points), which is the read
  path's budget, rather than the retention that feeds it.

- **19 August 2026 — the separate retention question this ADR named is now answered.**
  § Constraints said the raw payload "is a separate retention question from the history
  ring buffer" and deliberately left it open.
  [ADR 26](./26_RAW_PAYLOAD_BOUNDED_VERBATIM_AND_UNPROTECTED_BY_DECISION.md) answers it:
  one payload per robot, replaced rather than accumulated, bounded by a 64 KiB ingest cap
  and kept verbatim with no redaction. **The number this ADR's memory budget can now be
  checked against is 500 robots x 64 KiB = 31.25 MiB** of retained payload, on top of the
  ring buffers. Nothing in this ADR changes; what changes is that "bounded in memory" is
  now arithmetic for both halves rather than one.

  Worth noticing while it is still true: retained payloads vanish on restart with all
  other in-memory state, which is a privacy property nobody chose deliberately. If
  persistence is ever added for another reason, that property leaves with it.
  Raw vendor payloads are retained separately and never enter this buffer.

## Related

- ADR 1 — the same "build only what the read path needs" reasoning governs both the capability model's refusal to model unused vendor fields and this ADR's refusal to persist unused history depth (Principle 3).
- ADR 2 — the measurement commitment referenced in Assumptions is ADR 2's territory; this ADR keeps persistence out of that measurement's scope so the ingest-path bottleneck stays legible. The cluster and worker mitigations ADR 2 evaluates must account for the in-memory state boundary identified here (Principle 12).
- ADR 3 — the freshness sweep reads `receivedAt` from the current-state map this ADR specifies.
- Requirement — the schedule's explicit SQLite cut.
- Principle 11 (state is separated by authority, lifetime, and transition model) — current state and history are two different lifetimes even though neither is persisted, and this ADR is where that separation is decided for the server side.
- Principle 12 — performance budgets are product behaviour, and the in-memory path keeps the ingest measurement legible.
- Principle 10 — tests prove behaviour at the cheapest reliable boundary; simple memory structures are pure unit tests.
- Principle 14 (the repository is operable by agents and auditable by people) — choosing not to build something is as much a decision as choosing to build it, and recording it here is what keeps the omission auditable rather than accidental.
- Artifact `packages/server` — contains the current-state map and compact bounded battery-history retention implemented under ADR 33.
- Artifact README "not built" table — carries the persistence cut with this ADR as its reference.
- Artifact frontend robot-detail component set — the sparkline is the consumer this sizing decision is calibrated against.

## Notes

- 19 August 2026: decision recorded ahead of server implementation. The later observed consequences above record the implemented capacity and ADR 33 amendment.
