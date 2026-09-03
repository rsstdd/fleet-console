# Deliver the battery-history vertical slice

**Authority:** Historical only. Executed and archived; ADR 33 (register D24) is the living
record of everything this plan proposed.
**Status:** Done
**Archived:** 2026-08-20
**Superseded by:** [ADR 33](../00_adr/33_BATTERY_HISTORY_RETAINED_COMPACT_AND_SERVED_DECIMATED.md)
(register D24, amending ADR 6's retention arithmetic in place), the
[robot-detail page spec revision 7](../01_page-specs/03_ROBOT_DETAIL.md), the
implementation across `packages/contracts/src/history/`, `packages/server/src/history/`
and `packages/web/src/features/robot/batteryHistorySection.tsx`, and the battery-history
scenario in `packages/web/e2e/smoke.spec.ts`.

> Executed as planned; implementation departed from it nowhere (ADR 33 § Notes). The one
> finding the plan could not predict: the detail page's header freshness is fetch-time
> state, so the browser scenario asserts freshness degradation on the streaming fleet rows
> while a re-visit still serves the retained window (ADR 33 § Observed consequences).

## Summary

Add a 60-second battery-percentage sparkline to robot detail, backed by a separate contracts-owned history endpoint.

Retain compact battery samples for the simulator’s supported 50 Hz ceiling, return at most 60 extrema-preserving points, and keep all history in memory and
process-local.

## Decision and public contracts

- Register G4/M4 using the next available D-id and ADR after D22 and D23. Amend ADR 6 where its old 60-envelope capacity and canonical-envelope retention are
  superseded.

- Export these contract constants:
  - BATTERY_HISTORY_WINDOW_MS = 60_000
  - BATTERY_HISTORY_MAX_POINTS = 60

- Add robotBatteryHistorySchema, its inferred types, and parser with this response:

{
schemaVersion: "1";
robotId: string;
capturedAt: number;
windowMs: 60000;
maxPoints: 60;
sourceSampleCount: number;
missingBatterySampleCount: number;
points: Array<{
receivedAt: number;
batteryPercent: number;
}>;
}

- Enforce strict objects, at most 60 chronologically ordered points, timestamps within the response window, and consistent source/missing/returned counts.
- Add GET /api/robots/:id/history with no caller-controlled window or point-count parameters:
  - registered robot with no usable history → 200 with an empty response;
  - unknown robot → canonical 404;
  - successful responses → Cache-Control: no-store;
  - raw payload, capabilities, status, health, position, and vendor-specific fields never enter this contract.

## Server retention and decimation

- Replace retained canonical envelopes with compact samples:

interface BatteryHistorySample {
readonly receivedAt: number;
readonly batteryPercent: number | null;
}

- Record one sample only for an accepted telemetry upsert. Duplicates, regressive readings, and freshness-only sweep changes do not enter history.
- Derive capacity in code:
  - maximum supported source rate: 50 Hz;
  - fixed window: 60 seconds;
  - inclusive boundary sample: 50 × 60 + 1;
  - HISTORY_CAPACITY = 3_001 samples per robot.

- Document the coupling to the simulator’s 50 Hz validated ceiling on both sides. Faster external input may shorten available coverage but must not grow
  memory.

- At request time, capture the injected server clock, filter samples to the preceding 60 seconds, count null battery samples, and decimate only numeric
  samples.

- Decimation behavior:
  - return all numeric samples when there are at most 60;
  - otherwise preserve the first and last numeric samples;
  - divide the interior time window into 29 equal buckets;
  - emit each bucket’s minimum and maximum battery samples in chronological order;
  - emit one point when minimum and maximum are the same sample;
  - break ties by earliest retained occurrence;
  - return fewer than 60 points when buckets are empty.

- Keep the route thin by injecting a readHistory(robotId) function; history selection and decimation remain framework-independent and independently tested.

## Robot-detail experience

- Add a separate useRobotHistory resource and decoder. History fetches once per robot visit and does not join the delta store or refetch with every live
  update.

- History failure never blanks otherwise-valid robot detail:
  - loading → labelled inline skeleton;
  - network/server failure → retained page plus inline retry;
  - contract failure → terminal history-section message without retry;
  - zero source samples → “No telemetry retained in the last 60 seconds”;
  - samples but no battery values → “Battery was not reported in the last 60 seconds”;
  - one numeric sample → show the value and state that a trend needs another reading.

- Add an operator-visible Battery history section after Summary. Renumber later section indexes consistently.
- Render a feature-local inline SVG—no chart dependency:
  - fixed x-axis from capturedAt − 60s to capturedAt;
    - fixed y-axis from 0% to 100%;
    - points positioned from server receipt timestamps;
    - existing theme tokens only;
    - no animation or live-region announcements.

- Give the chart an accessible name and textual summary containing minimum, maximum, latest value, time window, and source-sample count. Use a DataPlate
  figcaption stating that times are server receipt times.

- Historical values remain visible during stream loss because they are explicitly historical; they are never presented as current freshness.

## Tests and acceptance

- Contracts: valid, empty, malformed, extra-field, count-invariant, timestamp-order, window-boundary, and 60-point-limit cases; pin all exports.
- Store: compact sample retention, capacity wraparound at 3,001, null battery handling, and exclusion of duplicate, regressive, and freshness-only changes.
- Decimator: no-op below the limit, exact cap, first/last preservation, bucket minima/maxima, global extrema, tie stability, empty buckets, null-only input,
  and 60-second filtering with an injected clock.

- HTTP: known/unknown/unobserved robots, canonical error shape, no-store, strict parser round trip, and structural proof that raw payloads cannot leak.
- Web: decoder and resource-state matrix; isolated retry; empty/null/single/normal states; SVG coordinates and accessible summary; technician toggle and
  existing detail data remain unaffected.

- Playwright: visit a live robot, wait for multiple simulator readings, verify the accessible battery-history summary and SVG, then stop the simulator and
  confirm the historical section remains while freshness changes independently.

- Measure and record retained-history memory at the 500-robot design workload; report it without inventing a CI threshold.
- Run affected contracts/server/web suites, type-safety, lint, typecheck, build, Playwright, architecture-doc checks, formatting, and git diff --check.
- Update the new history ADR, ADR 6, `docs/decisions.json`, and the generated decision index.
- Update the robot-detail page and affected component specifications, affected
  contracts/server/web package specifications, root and affected scoped TODOs, and root
  and affected package READMEs.
- Leave the dated decision audit unchanged.
- Before closing the phase, verify that ADRs, the decision mapping, generated index,
  specifications, TODOs, and READMEs agree on the endpoint, retention, and UI behavior.

## Assumptions

- Battery percentage is the only sparkline metric in this contract; adding another metric requires a contract and ADR amendment.
- receivedAt, not vendor reportedAt, defines retention and the x-axis.
- Missing battery values are counted but not converted to zero or plotted.
- The endpoint is fetch-on-visit, not streamed.
- Restarting the server clears history, as ADR 6 requires.
- No charting, storage, or database dependency is added.
- No commit is created.
