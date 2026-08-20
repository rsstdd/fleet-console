# TODO — `features/fleet`: the asynchronous state set is incomplete

**Authority:** Planning only. This checklist is non-normative; accepted ADRs and current package specifications govern conflicts.

**Created:** 19 August 2026
**Owner of the spec:** [`docs/01_page-specs/02_FLEET.md`](../../../../../docs/01_page-specs/02_FLEET.md) § 10
**Also binding:** [`PRINCIPLES.md`](../../../../../PRINCIPLES.md) 2, 5, 9, 11 · [ADR 3](../../../../../docs/00_adr/03_FRESHNESS.md) · [ADR 2](../../../../../docs/00_adr/02_TRANSPORT_HTTP_INGEST_WS_FANOUT.md)

`fleetPage.tsx` renders two of the eleven states fleet page spec § 10 requires. The
other nine are not deferred by choice — the page has no channel to learn them from.

## The gap

`useFleetRobots` returns a bare array:

```ts
// entities/robot/useFleetRobots.ts
export function useFleetRobots(): readonly Robot[];
```

A `readonly Robot[]` can express "these are the robots" and nothing else. It cannot say
_loading_, _refreshing_, _failed but retryable_, _failed terminally_, or _the stream is
down and these rows are last-known_. So the page cannot render those states however it
is written, and no amount of editing `fleetPage.tsx` closes the gap. **The fix is a
contract change in `entities/robot` plus a transport client in `shared/lib`, and it must
land there first.**

This is the largest outstanding gap against page spec 02.

## Current behaviour against § 10

| § 10 condition        | Required                                                             | Today                                                       | Blocked on     |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- | -------------- |
| Initial load          | Table skeleton or brief empty frame; never an indefinite spinner     | **Missing** — fixtures are synchronous, so there is no load | **A1**         |
| Background refresh    | Rows stay visible and in place; no full-table flash                  | **Missing** — nothing refreshes                             | **A1**, **A3** |
| No robots registered  | `EmptyState` "No robots registered"; not an error                    | ✅ implemented                                              | —              |
| Filters exclude all   | `EmptyState` + clear action                                          | ✅ implemented                                              | —              |
| Partial data          | Missing optional field shows an em dash, never a zero                | ✅ battery and last-seen already do this                    | —              |
| Stale data            | Row freshness treatment; battery em dash when not LIVE               | ✅ via `selectBatteryDisplay` / `selectStatusPresentation`  | —              |
| Offline / stream down | Shell banner; table keeps last data; **per-robot labels suppressed** | ✅ suppressed (ADR 23); no transport supplies a real state  | **A3**         |
| Recoverable error     | `EmptyState` with retry, or a banner if rows are still valid         | **Missing**                                                 | **A1**         |
| Terminal error        | `EmptyState` without retry, stating what failed                      | **Missing**                                                 | **A1**         |
| Malformed row         | Skip the row, count the rejection; never coerce, never crash         | **Missing** — nothing decodes, so nothing can reject        | **A4**         |

**Offline was an ADR 3 correctness bug and is now closed.** `fleetPage.tsx` reads
`isStreamConnected(useConnectionState())` and renders the per-robot `FreshnessLabel`
only while the stream is connected — suppressed, with nothing substituted (**A2**,
ADR 23). What is left is not a correctness gap but an unfinished input: the context
default is `disconnected` and no transport supplies a real state, so the Freshness
column is empty today. That is the honest reading, and restoring an optimistic default
to fill the column would reintroduce exactly the bug this closed.

**Malformed rows have no boundary to be rejected at.** Principle 2 puts decoding at the
boundary, and there is no boundary yet — the fixtures are already typed `Robot`. When the
transport client lands, the skip-and-count happens _there_, and the fleet page's only
obligation is that a malformed row never reaches it. Do not add defensive per-row
validation in the table; that would be a second decode authority (Principle 1).

## Work

- [ ] **A1 — Give `useFleetRobots` a state-carrying return type.** Replace
      `readonly Robot[]` with the discriminated union sketched under
      [Proposed contract](#proposed-contract), so invalid states stop being
      representable — Principle 5 names Types as its mechanism and Principle 11 names
      discriminated unions.

- [x] **A2 — Route stream connection state to this feature without breaking the
      dependency rule.** Done, as
      [ADR 23](../../../../../docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md)
      (register stub **D15**, option 1 as recommended). `ConnectionContext` lives in
      `shared/lib` — the only layer both `app` and `features` may import — `AppShell` is
      the single provider, and this page reads it once via `useConnectionState()`.
      Labels are suppressed whenever `isStreamConnected` is false, which includes
      `reconnecting`. Nothing is substituted in their place, per ADR 3. Four tests cover
      it and fail if the condition is removed.
      **Consequence to expect:** the context default is `disconnected` and no transport
      supplies a state yet, so the Freshness column is empty today. That is correct; do
      not restore an optimistic default.

- [ ] **A3 — Wire the delta stream. Cold-start ordering landed 20 August 2026; the
      transport itself has not.** `shared/lib/coldStart.ts` is the joining sequence —
      buffer while the snapshot is in flight, then discard what the snapshot already
      covers with `isDeltaCoveredBySnapshot` from `@fleet/contracts` rather than a
      comparison written again here, then replay the rest oldest first. It exists as its
      own module because the failure it prevents is invisible: fetching before opening
      loses every delta emitted in the gap, and the symptom is a row that quietly stops
      updating rather than an error (server TODO **H3b**). Six tests, including the cold
      server at sequence zero discarding nothing.
      What is still missing is the transport around it: no socket, no snapshot fetch, no
      store. Deltas apply keyed by `robotId` on a scheduled frame, never synchronously per
      message (spec § 6, ADR 2, Principle 12).
      _Where to connect is already decided and configured_
      ([ADR 21](../../../../../docs/00_adr/21_ENDPOINTS_FROM_THE_ENVIRONMENT_WITH_A_DEV_PROXY.md)):
      read `TENANT.endpoints.streamUrl` and `TENANT.endpoints.apiBaseUrl` from
      `config/tenant.ts`. Both ship as same-origin paths — `/ws` and `/api` — which Vite's
      dev proxy forwards to the server, so the client needs no host, no port and no
      environment variable of its own. **Never hardcode a URL here and never read
      `import.meta.env` for one**: the console must not learn the server's real address,
      because that is what keeps every request same-origin and CORS out of the picture.
      Until this lands, `TENANT.endpoints` is validated configuration with **no reader** —
      recorded in [`packages/FIXME.md`](../../../../FIXME.md) **F13**, and the one thing
      about ADR 21 that is configured rather than working.

- [ ] **A4 — Decode at the boundary.** Validate envelopes with the `@fleet/contracts`
      schemas in the transport client, skip malformed rows, and count the rejections.
      The count belongs on a diagnostics surface, not on the fleet table.

- [ ] **A5 — Render the states in `fleetPage.tsx`.** Only after A1–A4. Skeleton for
      `loading`; `isRefreshing` leaves rows untouched; `error` renders `EmptyState` with
      a retry for `recoverable` and without one for `terminal`, saying what failed and
      what remains valid.

- [ ] **A8 — Decide whether the freshness summary is suppressed too.** Raised by
      [ADR 23](../../../../../docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md)
      § Open questions and deliberately not settled there. While the stream is down the
      table shows no per-robot labels, but the summary still reads "Live 1 · Stale 1 · …"
      — arguably the same currency claim at fleet scope, and the one an operator reads
      first. Fleet spec § 8 suppresses per-robot labels only, so changing this is a spec
      change rather than an implementation choice, and doing it unilaterally would put a
      second authority beside the spec. Whichever way it goes, the spec and the code must
      say the same thing. Note the counts come from `selectFreshnessSummary` over robot
      data, not from the rendered labels, so suppressing them is a separate edit.

- [ ] **A6 — Extend `fleetPage.test.tsx`.** It already mocks `useFleetRobots`, so each
      new state is one more mocked return. Cover: skeleton on `loading`; rows unchanged
      and no remount across a refresh; retry present for recoverable and absent for
      terminal; freshness labels absent while disconnected but the banner present; rows
      keyed by `robotId` so a reordering delta patches rather than remounts (spec § 11).

## Proposed contract

```ts
export type FleetResource =
  | { readonly state: "loading" }
  | {
      readonly state: "ready";
      readonly robots: readonly Robot[];
      /** True during a refresh that must not blank the table (§ 10). */
      readonly isRefreshing: boolean;
    }
  | {
      readonly state: "error";
      readonly kind: "recoverable" | "terminal";
      readonly message: string;
      /** Present only when `kind` is "recoverable". */
      readonly retry?: () => void;
    };
```

Note what is deliberately _not_ a variant: background refresh. § 10 requires rows to stay
visible during it, so it is a flag on `ready` rather than a state that replaces the
table. A separate `refreshing` variant is how a full-table flash gets written by
accident.

## A7 — Scale: the table is not windowed, and that is now a decision — CLOSED 19 August 2026

`fleetPage.tsx` renders `filteredRobots.map(...)`. It stays that way
([ADR 24](../../../../../docs/00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md),
register D14), and the repository's claim was narrowed to match rather than the code being
changed to match the claim.

`fleetScale.test.tsx` in this directory renders 500 robots and asserts one row per robot,
one activation path per row, fleet-wide summary counts, and that the search filter still
narrows to a single row. It publishes **no duration**: this runs in jsdom, which has no
layout and no paint, so a millisecond figure from it would be a fabricated ceiling.

**What is still open, and it is not a page fix.** The number that decides windowing is
delta-apply cost at 500 robots under a live stream, and it needs the fan-out (server
**I2**). The reason it is that number and not a static render: this page re-runs the
fleet-wide summary, the latest-reading scan and the filter pass on every delta, and
windowing the table body removes none of them. If those dominate, the fix is **A3**'s
scheduled-frame delta application and per-robot subscriptions, not a table component.

**Do not add virtualization here before that measurement**, and if you do add it later,
expect `fleetScale.test.tsx` to fail — that is deliberate, and the failing test is the
prompt to revisit ADR 24, root `CLAUDE.md`, page spec 02, package spec 05 and README § 10
in the same commit. When the time comes, evaluate `@mui/x-data-grid` before any other
component (ADR 5 forbids a second styling system) and measure it against ADR 22's bundle
budget.

## Sequencing

`packages/server` transport → transport client in `shared/lib` → **A1** → **A5/A6**.
`packages/contracts` is built and **A2** is closed, so the sequence is shorter than it
was: A4's schemas exist and are already used by `entities/robot`, and what A4 waits on is
the transport client that would call them. A1 is a shape change that _can_ be made ahead
of the server against the fixture hook, and doing so would let A5 and A6 land before the
transport exists.

## Do not

- **Do not add a freshness timer** in this feature or in `entities/robot` to paper over
  the offline case. Derivation is server-side only (ADR 3). A client timer degrades every
  row when the console's own socket dies, which is a different failure being reported as
  the same one.
- **Do not fabricate a loading state** from a `setTimeout` over the fixtures to make the
  skeleton demonstrable. A state that cannot fail is not the state § 10 describes.
- **Do not collapse the channels.** Remote resource state, observed live state, stream
  connection state, and filter view state have four different authorities and lifetimes.
  One object holding all four is the collapse Principle 11 forbids.

## Done when

1. `useFleetRobots` returns a discriminated union and no call site can read `robots` without first narrowing the state.
2. Every row of spec § 10 renders, and each has a test.
3. While the stream is down, no per-robot freshness label is on screen and `ConnectionBanner` states the condition.
4. A malformed envelope is skipped and counted at the decode boundary, and the table never sees it.
5. `pnpm lint && pnpm test` pass, and the offline-suppression test fails if the suppression is removed.

Scale (**A7**) is deliberately not on this list: it is closed as a decision, and what remains
of it is a measurement owned by `packages/server`.
