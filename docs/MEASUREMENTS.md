# Measurements

The full tables behind the root README's [Measurements section](../README.md#11-measurements):
what was measured, on which date, by which committed harness, and what remains
unmeasured. Numbers here are reported from real runs; the two that gate a merge are
marked.

## Ingest and validation

> **ADR 2's own question is now answered, and the answer is decisive.** ADR 2 estimated
> that schema validation costs tens of microseconds and that per-request HTTP overhead was
> the likelier first bottleneck, and committed to a harness that would confirm or falsify
> it. Measured 20 August 2026 by `packages/server/src/ingest/validationCost.test.ts`:
>
> | Cost                                              | 50 robots | 500 robots |
> | ------------------------------------------------- | --------- | ---------- |
> | Strict canonical decode (`JSON.parse` + Zod)      | 5.8 µs    | 5.8 µs     |
> | Whole request (route, cap, parse, decode, upsert) | 892 µs    | 926 µs     |
>
> **Transport dominates validation by roughly 150×**, so ADR 2's estimate holds and its
> staged mitigation should start with batch ingest rather than with worker-pooled
> validation. Per-request cost is essentially flat from 50 to 500 robots (+3.8%), which is
> what the map-keyed store predicted.
>
> Read the 892 µs honestly: it is a **sequential round trip over loopback including the
> client's own `fetch`**, so it bounds server-side per-request work from above rather than
> isolating it — and it is emphatically **not** a capacity figure.
>
> **Under concurrency, measured 20 August 2026 by `src/freshness/sweepUnderLoad.test.ts`
> at 500 robots:**
>
> | Offered concurrency | Accepted    | Sweep ticks late |
> | ------------------- | ----------- | ---------------- |
> | 1                   | 1,264 req/s | 0 of 4           |
> | 16                  | 4,786 req/s | 0 of 4           |
> | 128                 | 5,971 req/s | 0 of 4           |
>
> That is **~2.4× ADR 2's 2,500 msg/s design scale**, and the freshness sweep never ran
> late at any level — which is the measurement that actually matters, because ADR 3's
> failure under saturation is not slowness but a sweep that stops firing and leaves stale
> robots reported as LIVE. No degradation point was found on this machine; the honest
> statement is that saturation was not reached, not that it cannot be.

## The client half

> **Re-measured 21 August 2026 by the Playwright scale project**
> (`packages/web/e2e/scale.spec.ts`,
> [ADR 32](00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md)):
> 500 robots at ten WebSocket frames per second (250 robots changing per frame) against
> the production build in a real Chromium:
>
> | Client metric at 500 robots, live stream | Measured                                |
> | ---------------------------------------- | --------------------------------------- |
> | Frames applied                           | 120 of 120                              |
> | Achieved frame rate                      | 9.78 Hz of 10 Hz offered                |
> | Delta to next paint                      | p50 44.6 ms · p95 50.5 ms · max 53.7 ms |
> | Animation-frame interval                 | p50 16.7 ms · p95 50.0 ms               |
> | Client JS heap after the run             | ~119 MB                                 |
>
> The un-virtualized table absorbs the documented workload with the frame budget intact,
> so ADR 24's virtualization deferral now rests on evidence. Integrity is asserted in CI;
> the numbers are reported, never gated, and each run writes its own `scale-report.json`
> with the environment attached.

## Budgets and gates ([ADR 22](00_adr/22_GATE_THE_BUNDLE_AND_THE_FALSIFIER_REPORT_COVERAGE.md))

Two numbers fail the build, and each carries its derivation in the file that enforces it.
A third is printed and enforces nothing, because nobody could derive it.

| Number                         | Budget                     | Measured (21 Aug 2026) | Enforced in                                                    |
| ------------------------------ | -------------------------- | ---------------------- | -------------------------------------------------------------- |
| Console first load (JS + CSS)  | 720 kB raw / 300 kB gzip   | 605.97 kB / 182.52 kB  | `scripts/checkBundleBudget.mjs` — **gate**                     |
| Ingest validation, per message | 400 µs (ADR 2's falsifier) | 5.8–6.4 µs             | `packages/server/src/ingest/validationCost.test.ts` — **gate** |
| Adapter test coverage          | none, deliberately         | 94.25% statements      | CI job summary — **reported, not gated**                       |

The bundle budget is derived from a warehouse-floor tablet on ~3 Mbps of shared site
Wi-Fi and a 2.0 s target to the fleet table showing data; raising it is a claim that the
operator's device or network is different from that one. The 400 µs figure is ADR 2's own
falsification threshold, not a tuned number — at the measured cost, validation consumes
about 1.5% of one core at 2,500 msg/s, so ADR 2's estimate survives and per-request HTTP
overhead remains the candidate for the first bottleneck. Coverage is reported because the
90% threshold this repository once proposed had no derivation and, over today's
`src/vendors/**`, would have measured nothing.

Adapter coverage was re-measured on 19 August 2026 and is unchanged at 94.25% of
statements — over `src/core` alone, since `src/vendors/**` still holds only fixtures.

## What remains unmeasured

Named rather than left as blank cells: ingest-to-fan-out latency (emit to paint, end to
end), the coalesced WebSocket message rate under real load, and server process memory
over time. Each needs a harness that observes both ends of the pipe at once, which none
of the existing gates provides; the tables above bound the pieces separately, not the
whole path.

## Contrast verification

**WCAG 2.2 AA** (Principle 6) — measured 21 August 2026 by `pnpm check:tokens`
(`scripts/checkTokens.mjs`), which cross-checks `styles/tokens.css` against the tenant
palette and computes every ratio. This is a merge-blocking gate, not a reading: 4.5:1
for text tokens, 3:1 for non-text status colours.

| Token on `--surface` | Dark  | Light |
| -------------------- | ----- | ----- |
| `--ink`              | 13.10 | 17.00 |
| `--ink-soft`         | 9.16  | 10.24 |
| `--ink-muted`        | 4.80  | 5.56  |
| `--status-neutral`   | 3.34  | 7.38  |
| `--status-active`    | 4.75  | 5.01  |
| `--status-charging`  | 3.80  | 5.96  |
| `--status-degraded`  | 6.55  | 3.80  |
| `--status-fault`     | 3.63  | 5.77  |
| `--status-unknown`   | 4.80  | 5.56  |

`--ink-muted` matters most: the "last known" treatment depends on legibility, and it
clears the text threshold in both themes.

## Virtualization

Ships unvirtualized, by decision
([ADR 24](00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md)). The
table renders one row per robot and is asserted correct at 500 rows — 500 rows, 500
activation links, fleet-wide counts, filter still narrowing to one — in
`packages/web/src/features/fleet/fleetScale.test.tsx`. The delta-apply measurement
ADR 24 was waiting on now exists — the scale run above drives 500 robots under a live
10 Hz stream and finds the frame budget intact — so the deferral stands on evidence, and
**the ceiling is wherever a larger fleet first breaks that budget, which has not been
reached**. Absolute positioning also conflicts with the semantic `<table>` layout
Principle 6 depends on. If a larger profile ever breaks the budget, `@mui/x-data-grid`
is evaluated first (ADR 5) and whatever is chosen must fit ADR 22's bundle budget.
