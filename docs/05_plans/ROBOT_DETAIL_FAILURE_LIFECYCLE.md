# Robot Detail Failure Lifecycle

**Authority:** Planning only.
**Status:** Active
**Updated:** 2026-08-25

## Outcome

The robot detail surface tells the truth in both of its failure lifecycles. A failed detail
request keeps the live fleet row on screen instead of blanking to a bare alert, and a retry
reports that it is running. Page spec 03 §10 and the code describe the same behavior, which
they did not before this plan.

## Why this exists

Page spec 03 §10 has always required a recoverable error to keep valid data on screen. The
code could not do it, and the reason was structural rather than an omission:

- `retry` is carried only by the recoverable-error state, and `attempt` is the only volatile
  dependency of the fetch effect in `useFetchedResource`. A successful load is therefore
  final — `ready` never transitions to `error` — so no earlier value can exist when a failure
  is mapped.
- `RobotDetailState`'s recoverable variant nevertheless declared `robot: RobotDetail | null`
  and `robotDetailPage.tsx` rendered the retained body, a branch nothing could reach.
- Threading a `previous` value through `useFetchedResource` was implemented and reverted: it
  adds a seam no path can exercise, which is machinery no test can reach.

The data the spec asks for exists — in the fleet store, streaming — but it is a `Robot`, not
a `RobotDetail`, and it reaches the page through `useFleetRobot` rather than through the
failing fetch. So the resolution splits: the hook's type stops promising retention, and the
page performs it from the row.

The second failure lifecycle had no record at all: `useFetchedResource` keeps the failed
value on screen while a retry runs, so both the detail alert and the battery-history section
looked identical from click to answer. A slow server read as a dead control.

## Constraint that shaped the design

`diagnostics: null` and `rawPayload: null` are already load-bearing: `types/robot.ts` defines
them as "the robot has never reported", and three surfaces say so in prose — `describeSource`
in `robotDetailPage.tsx`, `diagnosticsSection.tsx`, and `rawPayloadSection.tsx`. Synthesizing
a `RobotDetail` from a row with those nulls would make all three lie about a robot whose
telemetry is streaming. The degraded view therefore renders the `Robot` row as a row and
never fabricates a detail.

## Scope

### In scope

- Narrow both `RobotDetailState` error variants so neither carries a robot.
- Widen the presentational surface that only ever needed a fleet row: `DetailHeader`
  (which takes the fetched receipt time as its own prop), `SummarySection`,
  `CapabilitiesSection`, and the two selectors they call.
- `fleetRowBody.tsx`: the degraded body, including the technician note that states what this
  console did not read.
- `retrying: boolean` on both recoverable variants, derived in `useFetchedResource` from the
  attempt a held value answered.
- A polite `role="status"` beside each alert.
- Page spec 03 §10 and §11 rows for all of it.

### Out of scope

- Refetching the fetched half on stream reconnection. Fetch-once-per-visit with a live row
  overlay is the recorded design (ADR 33 for history; the page's own contract for detail);
  changing it is a separate decision with a scale cost.
- Any change to the fleet resource's retention, which already works through the store.
- Retention for battery history: its recoverable variant carries no data, and the spec asks
  only for an inline retry.

## Execution

1. **Type first.** `RobotDetailState`'s two error variants lose `robot`. The compiler names
   the one consumer that assumed otherwise (`robotDetailPage.tsx`'s reconciliation branch),
   which is the branch being replaced.
2. **Widen what only needed a row.** `SummarySection` and `CapabilitiesSection` never read a
   detail-only field. `DetailHeader` read `robot.diagnostics?.receivedAt`; it now takes
   `receivedAt: string | null`, passed as `robot.diagnostics?.receivedAt ?? null` on the ready
   path and `null` from the degraded body. `selectPositionDisplay` and
   `selectPanelCapabilities` are widened to `Robot` for the same reason: they only ever read
   row fields, and the narrower parameter was over-constraint.
3. **Compose the degraded body.** `FleetRowBody` renders header, Summary, Battery history and
   Capabilities from the row; for technicians it renders one note in place of Diagnostics and
   Raw payload. `renderState` takes `live` and mounts it under the warning; with no row, the
   alert stands alone as before.
4. **Derive the retry signal.** `useFetchedResource` records the attempt each held value
   answered and returns `{ value, isReloading }`. Each resource facade folds `isReloading`
   into its own union rather than exposing a loose boolean.
5. **Render it without an accessibility regression.** The status sits beside the alert, not
   inside it: `role="alert"` is assertive, so progress written into it re-announces the
   failure. The control is never disabled on activation, which would move focus to the body.

## Acceptance criteria

- [x] No `RobotDetailState` error variant carries a robot, and no consumer looks for one.
- [x] A failed detail request with that robot's row in the store renders the row's values
      under the warning, with a retry (`robotDetailPage.test.tsx`).
- [x] The technician view states that this console did not read diagnostics and the raw
      payload, and never renders the "has not reported yet" prose in that state.
- [x] A retry in flight is reported by a `status` region while the control stays enabled
      (`useFetchedResource.test.ts`, `batteryHistorySection.test.tsx`).
- [x] Page spec 03 §10 describes the implemented behavior, and §11 names the checks.
- [x] `pnpm --filter web test` (421), `lint`, `build`, `pnpm check:doc-comments`, and
      `pnpm check:architecture-docs` green on 2026-08-25.
- [x] e2e green on 2026-08-25: `smoke-chromium` 13/13, `smoke-firefox` 13/13,
      `component-gallery-chromium` 2/2. The webkit project cannot launch on the development
      WSL host, so smoke evidence covers chromium and firefox only. `test:e2e:scale` was not
      re-run: nothing here touches the fleet table path ADR 24 measures.

## Documentation synchronization

- `docs/01_page-specs/03_ROBOT_DETAIL.md` §10 and §11 (done in this change).
- `docs/05_plans/REFACTOR_WEB_REACT_QUALITY.md` F7 and F8, which recorded these as open and
  now point here.
- No ADR: one package, no contract or dependency change, and reversible — the decision
  lifecycle reserves an ADR for durable architecture, which this is not.

## Verification

- `pnpm --filter web test`
- `pnpm --filter web lint`
- `pnpm --filter web build`
- `pnpm check:architecture-docs` (spec and plan edits)
- `pnpm test:e2e` — user-facing surface

## Completion

Archive once the e2e evidence is recorded and the spec rows have survived one review cycle.
The replacement evidence is page spec 03 §10 itself: the spec, not this plan, is the durable
record of what the surface must do.
