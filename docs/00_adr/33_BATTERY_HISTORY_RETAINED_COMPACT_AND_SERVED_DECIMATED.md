# ADR 33 — Battery History Is Retained Compact and Served Decimated on a Fixed Window

**Decision:** The server retains one compact `{receivedAt, batteryPercent | null}` sample per accepted telemetry upsert, 3,001 deep per robot; `GET /api/robots/:id/history` serves the preceding 60 seconds decimated to at most 60 extrema-preserving points under a contracts-owned strict schema; the console renders it as a fetch-on-visit inline SVG sparkline on robot detail.
**Group:** Data / server-side state, and the one read path built on it.
**Status:** Decided · 2026-08-20 · Implemented
**Register:** D24.

## Issue

ADR 6 decided history is bounded and in memory, sized to what a decimated sparkline consumes, and the ring buffer landed holding **60 whole canonical envelopes** per robot — one minute at the nominal 1 Hz reporting rate. Two things were left unresolved, and they are one combined question because each prices the other:

1. **The response shape.** No contract described what a history read returns. The server's `history()` returned canonical envelopes, which carry status, health, position, capabilities and vendor identity — none of which a battery sparkline reads, and some of which (the diagnostic surface's fields) must never travel on an operator route by accident.
2. **The retention capacity.** Sixty envelopes covers one minute only at 1 Hz. The simulator's validated ceiling is **50 Hz**, at which the same buffer covers 1.2 seconds — a sparkline claiming a minute while holding a second is Principle 4's failure with an axis on it.

Resolving either alone re-opens the other: a 60-point response cap does not say what the server must retain to honour a 60-second window at the supported rate, and a capacity without a response contract leaves the wire shape to whoever writes the route.

## Assumptions

- Battery percentage is the only sparkline metric. A second metric is a contract and ADR amendment, not a field addition.
- The simulator's 50 Hz ceiling is the fastest supported source. Faster external input may shorten covered time but must never grow memory.
- `receivedAt` — the server's ingest stamp — defines both retention and the x-axis. Vendor `reportedAt` rides vendor clocks, and an axis on vendor clocks can bend (ADR 3 chose the same stamp for freshness, for the same reason).
- The endpoint is fetch-on-visit, not streamed. A minute of history changes meaningfully on the scale of visits, not deltas, and streaming it would re-send 60 points to say one changed.
- Restarting the server clears history, as ADR 6 requires. The sparkline states its window, not continuity across deployments.

## Constraints

- History must stay in memory and process-local; no database, no persistence (ADR 6).
- The response is a decoded-by-the-console boundary shape, so `@fleet/contracts` owns it (ADR 25); the server may not compose a response the console reads.
- Raw payload, capabilities, status, health, position and vendor-specific fields must not enter this contract. The one route that serves a raw payload stays `GET /api/robots/:id` (ADR 1, ADR 26).
- No caller-controlled window or point-count parameters. A negotiable window makes the chart's fixed axis a lie some deployments tell.
- No client-side freshness reasoning: the console derives nothing from these timestamps except positions on a historical axis (ADR 3).

## Decision

**A strict contracts-owned response on a fixed window.** `robotBatteryHistorySchema` carries `schemaVersion: "1"` (its own version, independent of the envelope's), the robot id, the request-time `capturedAt`, literal `windowMs: 60000` and `maxPoints: 60`, a `sourceSampleCount` / `missingBatterySampleCount` pair, and at most 60 chronologically ordered `{receivedAt, batteryPercent}` points. Cross-field checks enforce what the decimator promises: every timestamp inside `[capturedAt − windowMs, capturedAt]`, counts that reconcile, all numeric samples returned when they fit the budget, and at least the preserved first and last when they do not. `BATTERY_HISTORY_WINDOW_MS` and `BATTERY_HISTORY_MAX_POINTS` are exported constants, because the server derives capacity from one and the console draws axes from both.

**Compact samples, not envelopes.** The store retains `{receivedAt, batteryPercent | null}` per accepted upsert — duplicates, regressive sequences and freshness-only sweep changes record nothing. Null battery is retained rather than skipped, so the endpoint can distinguish "samples arrived without battery" from "nothing arrived". Capacity is derived in code, not asserted: 50 Hz × 60 s + 1 inclusive boundary sample = **`HISTORY_CAPACITY = 3_001`**, with the simulator coupling documented on both sides.

**Extrema-preserving decimation.** At most 60 numeric in-window samples pass through untouched. Above that: the first and last are preserved, the time between them splits into 29 equal buckets, and each bucket emits its minimum and maximum in chronological order — one point when they are the same sample, ties broken toward the earliest retained occurrence. A spike or trough cannot vanish into an average, which is the property a battery chart exists to have.

**A thin route on an injected read.** `GET /api/robots/:id/history` takes `readHistory(robotId)` the way every route here takes a function: unknown robot → canonical 404, registered-but-unheard → the contract's empty 200 (the fleet page lists that robot; a 404 would contradict it), success → `Cache-Control: no-store`, because the response embeds its own capture instant. Selection and decimation live in `selectBatteryHistory`, pure and framework-independent.

**A fetch-on-visit sparkline with every state named.** `useRobotHistory` is its own resource beside `useRobotDetail`; its failure degrades the section inline and never blanks valid robot detail — loading skeleton, inline retry on request failure, terminal message on contract failure, and honest prose for empty, null-only and single-reading windows. The chart is a feature-local inline SVG: fixed x-axis over the window, fixed 0–100% y-axis, theme tokens, no animation, no live region. Its accessible name and visible textual summary carry minimum, maximum, latest, window and sample count, and a `DataPlate` figcaption states that times are server receipt times. Historical values stay visible during stream loss, because they are explicitly historical.

## Positions

1. **Compact samples at derived capacity, decimated behind a strict fixed contract.** Chosen.
2. **Keep retaining whole canonical envelopes and grow the buffer to 3,001.** Rejected on arithmetic: envelopes retain every field the sparkline never reads, at 500 robots × 3,001 samples. The compact sample measures ~63 bytes retained; an envelope is an order of magnitude more, spent on fields whose only consumer is the risk of leaking them.
3. **Serve raw samples and decimate in the console.** Rejected: 3,001 samples per request to draw 60 points ships the reduction cost to every client and makes the wire shape the buffer's shape — a retention change becomes a contract change (Principle 1 puts the reduction where the data is).
4. **A charting dependency for the sparkline.** Rejected: sixty points on two fixed axes is a polyline; a library brings an animation and interaction surface this section is required not to have, and a dependency needs an ADR that would say only "we drew a line" (ADR 29, Principle 14).
5. **Caller-controlled window or point count.** Rejected: the fixed window is what makes two charts comparable and the axis honest; parameters reintroduce the negotiation the Constraints forbid.

## Argument

The combined question was combined for a reason: capacity follows from the window and the supported rate, and the response contract is what makes the window a promise rather than a hope. Deriving 3,001 in code from named constants keeps the arithmetic auditable, and writing the count invariants into the schema's cross-field checks means a drift between decimator and contract fails a parser round trip rather than a reader's expectations.

The honest cost is memory, and it was measured rather than estimated: filling all 500 robots to capacity retains **89.5 MiB (~63 bytes per sample)**. Reported as a number, not gated — inventing a CI threshold for it would be exactly the numeric-gate policy ADR 22 rejects. Beside ADR 26's 31.25 MiB raw-payload ceiling, "bounded in memory" remains arithmetic for all three halves.

## Implications

- **ADR 6 is amended where superseded**: retention is compact battery samples at capacity 3,001, not 60 canonical envelopes. Its decision — bounded, in memory, no database — stands unchanged.
- **The 50 Hz coupling runs both ways.** Raising the simulator's validated ceiling without raising `MAX_SOURCE_RATE_HZ` silently shortens the covered window below the contract's 60 seconds; both sides carry the comment.
- **`GET /api/robots/:id/history` is the fifth route**, and the startup log's `routes` count says so. Server `TODO.md` **G4** closes.
- **The response can say three different nothings**: no samples, samples without battery, one reading. The console renders all three as prose, never as a chart of zero (Principle 4).
- **History does not join the delta store.** A future "live sparkline" is a new decision, not a refetch interval added to this hook.

## Open questions

- **Should decimation ever surface which points are bucket extrema versus raw?** Today the console cannot tell a decimated response from a raw one below the cap, and nothing needs to. If a UI ever annotates "peak", the contract needs a marker rather than the console re-deriving one.
- **Does a second metric (e.g. lidar RPM) share this endpoint or get its own?** Leaning: its own, keyed by the declaring capability — battery is core, capabilities are not, and one envelope-shaped "history of everything" is the aggregation ADR 1 unbundled.

## Observed consequences

- 20 August 2026: implemented end to end, test-first at each boundary. Contracts 174 tests (17 new), server 186 (23 new: store retention and wraparound, decimator properties, route statuses, live-wiring round trip), web 313 (18 new: decoder outcomes, section state matrix, SVG coordinates, page integration with isolated history failure). The Playwright scenario drives the real stack: readings accumulate, the chart and its textual summary render, the simulator stops, fleet freshness degrades to Stale while a fresh visit still serves the retained window.
- **Retained-history memory at the design workload, measured:** 500 robots × 3,001 samples = 1,500,500 samples retained in **89.5 MiB** heap (~63 bytes/sample), Node 24, measured with `--expose-gc` before/after fills. A number to know, not a gate (ADR 22).
- **The detail page's header freshness is fetch-time state**, not stream state — the browser scenario's first draft asserted "Stale" appearing on the open detail page and learned otherwise. The honest assertion became: freshness degrades on the streaming fleet rows while a re-visit's history endpoint still serves the retained minute. The two facts moving independently is the point, but "the detail page does not re-render freshness live" is now a documented observation someone may one day promote to a defect.
- **One decimation tie rule earns its test:** with all interior values equal, min and max of every bucket must collapse to one earliest-occurrence point (31 points from 300 samples); a latest-occurrence max would emit two per bucket and the difference is invisible until values tie.

## Related

- **ADR 6** (bounded in-memory history, no database) — the decision this one amends in place; its Observed consequences carry the supersession note.
- **ADR 25** (contracts own every decoded response) — why the schema lives in `@fleet/contracts` and not beside the route.
- **ADR 3** (server-derived freshness) — the same `receivedAt` clock, and the rule that none of these timestamps feed freshness display.
- **ADR 22** (numbers reported, not gated) — the memory measurement's policy.
- **ADR 26** (raw payload retention) — the sibling retention bound; raw payloads never enter this buffer or this response.
- **ADR 32** (browser evidence) — the harness the battery-history scenario runs in.
- **Register D24** — resolved by this ADR.
- **Principle 4** (never present stale data as current) — the axis, the counts, and the three nothings.
- **Principle 12** (budgets are measured) — 89.5 MiB is a measurement, not an estimate.

## Notes

- The plan executed here is archived as `docs/04_archive/BATTERY_HEALTH_VERTICAL.md`; it named the shape, counts, capacity and decimation behaviour this ADR ratifies, and implementation departed from it nowhere.
