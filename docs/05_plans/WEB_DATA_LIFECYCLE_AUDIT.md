# Web Data-Lifecycle Audit and Remediation

**Authority:** Planning only.
**Status:** Active
**Updated:** 2026-08-26

## Outcome

`packages/web` handles data correctly at every lifecycle phase it owns: no surface presents
a stale value as current, no asynchronous surface can hang without reaching a defined state,
no client allocation is unbounded, and the three gaps that `packages/web` cannot close alone
are recorded as decisions rather than left implicit. Evidenced by a failing-test-first change
per finding, the existing unit and Playwright suites staying green, two new end-to-end
scenarios (outage currency, unresponsive server), and `pnpm check:diff-size` passing on each
pull request.

## Audit result (2026-08-26)

The audit covered ingestion, client storage, transformation, synchronization, presentation,
and disposal.

**Already conforming — do not touch.** Boundary decoding is complete: every network payload
and the `:id` route parameter are parsed before reaching state (`identifierSchema.safeParse`
at `features/robot/robotDetailPage.tsx`), request failure and contract failure stay distinct
outcomes, and `ContractIssue` carries `path` and `code` but never the rejected value.
Disposal is clean: the production tree holds exactly two `useEffect`s, both with cleanup, one
timer cleared on every exit path, a correct store unsubscribe, and no `window`, `document`,
or observer listeners. The ADR 3 freshness rule holds with no `setInterval` and no client
derivation, and suppression is one predicate in `context/connectionContext.ts` rather than a
rule copied per surface. There is no `localStorage`, `sessionStorage`, `indexedDB`, or cookie
use, and no `dangerouslySetInnerHTML`. Telemetry never passes through React state, so a frame
wakes only `useSyncExternalStore` subscribers.

### F1 — Stale battery and position read as current during an outage (highest priority)

`utils/robotSelectors.ts` gates `selectBatteryDisplay` and `selectPositionDisplay` on
`robot.freshness !== "live"` alone. While the stream is down that field is frozen at the last
delta's value, so for a robot last seen `live` one table row suppresses its freshness chip —
because the console has decided it may no longer assert currency — while still printing a
battery percentage and a position that depend on the suppressed claim.

`selectMapMarker` already takes `isStreamConnected` and hollows the marker on it, which
establishes the intended rule; the two value selectors were never given the same input. This
is the one place in the package where a stale number reads as a current one, against
Principle 4 and `docs/03_package-specs/05_WEB.md` § 9.

### F2 — No fetch can time out or be cancelled

`FetchLike` in `lib/transportDecoding.ts` is `(url: string) => Promise<FetchResponse>`: no
`init`, no signal. `hooks/useFetchedResource.ts` says so plainly — its `AbortController`
"marks staleness rather than cancelling I/O" and never reaches `fetch`. Against a server that
accepts a connection and never answers, three consequences follow: robot detail and battery
history stay in `loading` indefinitely, which § 9 names a defect rather than an edge case;
`useRobotDetail`'s `Promise.all` lets the advisory `/health` request block a robot response
that already arrived, even though health failure is designed to degrade to a null count; and
the `lib/coldStart.ts` buffer grows at frame rate with no cap while the snapshot is in
flight. That buffer is the only unbounded allocation in the package.

### F3 — A silently dead socket reads as connected (cross-package)

`openBrowserSocket` registers `open`, `message`, and `close` only, and neither side runs a
keepalive: the server's one interval is the fan-out flush, which returns early when nothing
is pending, so silence is a legitimate steady state and "no frames" is not by itself a
liveness signal. On a sleep or a NAT idle-timeout the browser may never fire `close`; the
console stays connected and per-robot freshness labels keep asserting a currency nothing
supports. Resolving it needs a server keepalive frame and a client no-progress rule, and it
brushes ADR 3's "the client holds no freshness timer" — surfaced here rather than worked
around, per the repository rule.

### F4 — A decommissioned robot never leaves the console (cross-package)

The store evicts only by whole-snapshot replace, and snapshots are issued only on connect or
reconnect. `@fleet/contracts` has no removal or tombstone member on the telemetry batch, so on
a long-lived healthy socket a robot removed server-side keeps its row, frozen at its last
freshness, until a reconnect or reload.

### F5 — Any new server field is a terminal console failure (cross-package)

Every contract schema is `z.strictObject`. One added field turns the snapshot into a contract
failure with no retry offered and rejects every subsequent frame. There is no version-skew
tolerance beyond `schemaVersion`, which makes deploy ordering a hard operational constraint
that no document states.

### F6 — Persona is lost across the detail-failure boundary, and history refetches

`RobotDetailBody` and `FleetRowBody` each own a separate persona `useState`, and the page
swaps between them. The reachable direction is recoverable error → successful retry → ready:
a technician reading the retained live row is silently returned to the operator view. The same
swap remounts `BatteryHistorySection`, which both bodies render, so a flapping detail endpoint
re-requests the history endpoint on every recovery.

### F7 — The rejected-frame counter sits at the root

`useFleetTransport` calls `setRejectedFrames` on every malformed frame, and that `useState`
lives in `AppRouter`, whose render recreates the route elements. Nothing in the package is
memoized, so each rejected frame re-renders the shell, the fleet page, and every row to update
one number in a technician-only section. The count belongs beside the telemetry in the
external store.

### F8 — Three timestamp formatters with three failure policies

`utils/time.ts` returns an em dash on invalid input; `components/connectionBanner.tsx`
reimplements the same output and returns null; `components/freshnessLabel.tsx` renders a
different format from a hardcoded `en-GB` locale, constructing its `Intl.DateTimeFormat` per
call, and throws in development. The duplication exists because the layer table forbids
`components → utils`, while component spec `02_FRESHNESS_LABEL.md` explicitly permits a pure
formatter from `utils` — that conflict must be resolved before the duplication can be.
Separately, `severity` and `connectivity` reach the screen as raw wire values while
`RobotStatus` and `Freshness` both have label tables.

### F9 — Fleet filters are not addressable

`useSearchParams` appears nowhere; router state carries route identity only. An operator who
narrows to one site and one reporting status to triage an incident cannot share or bookmark
that view, and a reload destroys it.

### F10 — Two documentation-versus-reality gaps

`docs/03_package-specs/05_WEB.md` § 8 publishes a "Requested — command acknowledgements, kept
separate from observed" state row, but commands are a deliberate cut and no such code exists;
a published table reads as an implemented guarantee. And the connection banner labels its
value "last event" while receiving the socket-open instant rather than the last frame's, so
during a stall it answers a different question than it asks. The store already carries the
correct `latestFrameAt`.

### Deliberately not raised as defects

The map page's unmemoized per-tick derivations, the linear site-label lookup per row, and the
unmemoized raw-payload serialization are real costs, but `packages/web/AGENTS.md` requires
measurement before optimization and D27 is open, so they are gated on a measurement rather
than optimized blind. The unauthenticated raw-payload panel is already a declared release
blocker under ADR 26 and needs no new finding.

## Concurrency and ordering (26 August 2026)

A second pass over the same package along the concurrency axis: the join protocol, the
transport state machine, the store, and every surface that reads them. It found nothing
wrong with the cross-attempt race model — each `Attempt` owns its generation, buffer and
join status, `supersedeAttempt()` is the sole increment site, all four asynchronous entry
points guard on their first line, StrictMode double-mount is safe, the store applies
synchronously and defers only notification, and `useSyncExternalStore` snapshots are
identity-stable. Nine findings sit outside that model.

### C1 — A frame the receiver refuses terminated the server (cross-package, resolved)

`packages/server/src/http/listener.ts` registered `close` on the upgraded socket and
nothing else. `ws` emits `error` there for any frame it cannot parse, and Node throws an
`error` event with no listener out of the EventEmitter: one six-byte frame with the RSV1
bit set, from any unauthenticated client, ended the process and blinded every console.
Reproduced as an uncaught `RangeError`. Handlers now on the socket and the
`WebSocketServer`, reported as `stream.socket_error`; fan-out removal stays owned by
`close`, which `ws` emits after the error.

### C2 — The reconciliation epoch never advanced (resolved)

`fleetTransport.ts` pinned the epoch at settle and compared every later delta to the
_snapshot's_ flush sequence rather than to the last one applied, so any frame above the
snapshot applied in arrival order. Offered 5 then 3, the transport applied both and left
the older reading on screen. Safe only because WebSocket delivers in order — a dependency
the module never stated and therefore could not rely on. The epoch now tracks what was
applied.

### C3 — `scheduleRetry` overwrote its handle without clearing it (resolved)

Unreachable today because every caller supersedes first; clearing makes that a property of
the function rather than of its callers.

### C4 — Back-navigation renders the previous visit's detail as current

`useFetchedResource` matches its held value on `forId` alone. On A → B → A with B still in
flight, `loaded` is still A's _earlier_ value, so the third leg re-renders a possibly
minutes-old detail — and `isReloading` is false, because `attempt` advances only on
`retry()`, never on an id change. No retry indicator appears, and a stale `not-found` or
error banner returns the same way. Whether it happens depends only on whether B beat the
operator, which is a race in the plain sense.

### C5 — F1 is incomplete: the status chip still asserts currency

F1 gates `selectBatteryDisplay` and `selectPositionDisplay` on `isStreamConnected`, but
`selectStatusPresentation` still decides `isCurrent` from `robot.freshness` alone. During an
outage one row shows a solid, unqualified status chip beside a suppressed reporting-status
cell and an em-dash battery — three cells making three different claims — and on the map the
list chip contradicts its own hollow marker under a legend that teaches "filled = Live".
This is F1's own rule applied to the third surface that rests on it.

### C6 — Robot detail keeps a decommissioned robot on screen

`reconcileRobotDetailState` returns the fetched detail unchanged when no live row exists, so
after a reseed drops a robot the fleet and map lose the row while detail renders it
indefinitely, with no banner and no refetch. The client half of F4.

### C7 — The battery-history window claims a currency it loses

`batteryHistorySection` renders "Battery over the last 60 seconds" from a `capturedAt`
frozen at the one fetch, and the caption says "window captured at request time" without
printing that time. Ten minutes into a visit the prose is false and nothing on screen
discloses it. The same applies to the detail footer's `received` instant and sequence, and
to the retained raw payload.

### C8 — Map extents survive an epoch change (blocked)

`mapPage` keys running extents by `siteId` and never clears them, so one outlier position
compresses every marker for the session and a reconnect does not reset it. ADR 35 makes the
box monotonic **per session**, which makes an epoch change the correct reset point — but
`serverSessionId` never reaches the web store or read model, and the only trigger available
today, `capturedAt`, changes on every ordinary reconnect and would rescale the canvas under
the operator exactly as ADR 35 refuses. Blocked on carrying the session identity into
`FleetData`, which `REFACTOR_FLEET_STORE_STATE.md` owns.

### C9 — Out-of-order ingest is guarded for two vendors of three (documentation)

The ordering guard is `capabilities.sequence`; vendors A and C declare it and vendor B does
not, so for vendor B arrival order alone decides and a delayed reading can overwrite a newer
one. Deliberate and argued in `currentStateStore.ts` — a synthesized counter would let the
store drop a real reading — but root `TODO.md` stated the intent as fleet-wide. Corrected
there; no code change.

## Scope

### In scope

- `utils/robotSelectors.ts` currency inputs and their call sites (F1).
- The `FetchLike` signature, request deadlines in typed tenant configuration, the robot-detail
  request split, and the cold-start buffer bound (F2).
- Transport attempt-status ordering and post-join reconnect throttling in `lib/fleetTransport.ts`.
- Persona ownership and battery-history mounting in `features/robot` (F6).
- Rejected-frame counter placement and the stream-diagnostics default (F7).
- Fleet filter state in the URL, decoded at the boundary (F9).
- One timestamp-formatting authority and enum label tables (F8).
- Three new decision records for F3, F4, and F5, each with its implementation.
- The two documentation corrections in F10.

### Out of scope

- Persona and map-site URL state: local view state stays local in this plan (F9 is filters only).
- Fleet-table virtualization and React Compiler adoption, which ADR 24 and D27 own.
- Any authentication or authorization work; the raw-payload exposure remains an ADR 26 blocker.
- Widening `onFrameRejected` to carry issues, and rejected-frame escalation, which
  `HANDLE_MALFORMED_STREAM_FRAMES.md` owns as trigger-deferred.

## Authorities and dependencies

- `PRINCIPLES.md` — P4 (provenance and freshness, F1 and F3), P5 (complete async states, F2),
  P2 (boundary decode, F9's URL codec), P11 (state by authority, F6 and F7), P13 (typed
  configuration, F2's deadline), P14 (one discoverable authority, F8 and F10).
- ADR 3 owns freshness derivation and freshness suppression; F1 applies its existing rule and
  F3 must state its relationship to the no-client-timer implication explicitly.
- ADR 23 owns the connection vocabulary and the context pattern; ADR 31 owns the retry policy,
  which F2's transport work must not change.
- ADR 20 owns the issue vocabulary; ADR 26 owns the raw-payload exposure; ADR 24 and D27 own
  the scale and memoization posture; ADR 27 sets the reviewable-diff gate below.
- Component spec `02_FRESHNESS_LABEL.md` and `packages/web/AGENTS.md` disagree about
  `components → utils` imports; F8 cannot proceed until that is resolved.
- Sequencing: F1, F2, F6, F7, F8, and F9 are independent of each other. The three decisions
  are independent of Track A and of each other, and each must be ratified before its code lands.

## Execution

Each pull request stays under the ADR 27 line budget and is green before the next starts.

1. **F1 — currency.** Add an `isStreamConnected` parameter to `selectBatteryDisplay` and
   `selectPositionDisplay`, threaded from the existing `isStreamConnected(useConnectionState())`
   reads on the fleet and map pages. Reuse the one predicate; do not add a second.
2. **F2, part one — deadlines.** Widen `FetchLike` to accept an abort signal, pass the
   existing `useFetchedResource` controller into `fetch`, add a request deadline validated in
   tenant configuration, and split `useRobotDetail`'s `Promise.all` so advisory health cannot
   block a robot response.
3. **F2, part two — transport.** Bound the cold-start buffer and count what it drops. Assign
   the attempt's socket slot before `openSocket` returns, so a synchronous `onOpen` cannot be
   overwritten back to `opening`. Give the post-join reconnect a floor rather than restarting
   immediately with the failure count reset.
4. **F6 — persona and history.** Lift persona to the component that straddles both bodies and
   hoist the battery-history section so the failure boundary does not remount it.
5. **F7 — counter altitude.** Move the rejected-frame count into a subscribable source, and
   make the stream-diagnostics context fail closed as the connection context already does.
6. **F9 — addressable filters.** Back the fleet filter state with `useSearchParams`, decoding
   the URL in `features/fleet/fleetFilterModel.ts` beside the existing filter helpers and
   replacing rather than pushing history entries.
7. **F8 — one formatter.** Resolve the spec-versus-guide import conflict first, then collapse
   the three timestamp paths onto one authority with one invalid-input policy, hoist the
   `Intl` formatter to module scope, and give the two raw enums label tables.
8. **Measurement.** Measure the map surface before optimizing anything named under
   "deliberately not raised".
9. **Decisions.** Draft and ratify the three records below, then implement each.

## Decisions this plan requests

- **Stream liveness (F3).** A server keepalive frame on the fan-out interval and a client rule
  treating sustained silence as a lost connection. Must state why this is connection integrity
  rather than the client freshness timer ADR 3 forbids. Extends the published connection
  vocabulary, so the banner and its specification move with it.
- **Robot removal (F4).** A removal or tombstone member on the telemetry batch, with the store
  evicting on it. Must decide whether a removed robot disappears or renders as decommissioned:
  an operator watching a machine vanish mid-incident is its own failure mode.
- **Schema forward compatibility (F5).** Either state the deploy-ordering constraint as a
  release requirement or admit additive tolerance where fields can safely carry it. The status
  quo undocumented is the only unacceptable outcome.

- **Post-join reconnect throttling (ADR 31 amendment).** `handleSocketClose` restarts an
  established stream's attempt immediately, with `consecutiveFailedAttemptCount` already
  reset by the join. A server that accepts, serves a snapshot, joins and then drops
  therefore reconnects at full speed for as long as it keeps doing so, bounded only by
  snapshot latency. **The code is correct as written**: ADR 31 § Retry policy states "a
  dropped established stream begins recovery with its own immediate first attempt", and its
  § Argument reasons about the half-working deployment whose snapshot endpoint fails — not
  about one whose snapshot succeeds and whose socket then drops. Closing that hole changes a
  ratified policy, so it is raised here rather than fixed in PR 3.

## Acceptance criteria

- [ ] A test proves a `live` robot renders an em dash for battery and position while the
      stream is down, and a browser scenario proves it on the fleet table.
- [ ] A test proves a request that never settles reaches a recoverable error state on both
      resource hooks rather than remaining in `loading`.
- [ ] A hung advisory health request cannot delay a robot detail response that has arrived.
- [ ] The cold-start buffer has a stated bound and reports what it discards.
- [ ] Persona survives a detail failure and its successful retry, and the history endpoint is
      requested once across that transition.
- [ ] A rejected frame updates technician diagnostics without re-rendering the fleet table.
- [ ] A filtered fleet view survives a reload and can be shared as a URL, and an unknown
      filter value in the URL degrades to the unfiltered view rather than an error.
- [ ] One module formats timestamps for the console, with one invalid-input policy.
- [ ] Each of the three decisions is registered in `docs/decisions.json` and mapped to an ADR
      before its implementation lands.
- [ ] Every pull request passes `pnpm check:diff-size`.

## Documentation synchronization

- `docs/01_page-specs/02_FLEET.md` — filter state in the URL (F9) and outage currency (F1).
- `docs/01_page-specs/03_ROBOT_DETAIL.md` — outage currency (F1) and persona ownership (F6).
- `docs/02_component-specs/02_FRESHNESS_LABEL.md` and `packages/web/AGENTS.md` — the
  `components → utils` conflict (F8), resolved in one direction in both files.
- `docs/02_component-specs/07_CONNECTION_BANNER.md` — the "last event" label (F10).
- `docs/03_package-specs/05_WEB.md` — § 8's "Requested" row (F10), § 9 if the frame-rejection
  or cold-start outcome shape changes, and the failure matrix for the new deadline state.
- `docs/decisions.json` and `docs/00_adr/` — the three records above; regenerate the pending
  index with `pnpm docs:decisions`.
- `packages/web/src/features/fleet/TODO.md` and `src/hooks/TODO.md` — reconcile on close.

## Verification

- `pnpm --filter web test` — narrowest, per pull request, failing test first.
- `pnpm --filter web lint` and `pnpm --filter web build` before each merge.
- `pnpm check:type-safety` after the `FetchLike` signature change.
- `pnpm check:diff-size` before each commit.
- `pnpm test:e2e` after F1, F6, and F9, and after any connection-vocabulary change: each is
  user-facing, and `packages/web/AGENTS.md` requires a running-browser check.
- `pnpm test:e2e:scale` after F7 and before any optimization under step 8.
- `pnpm check:architecture-docs` after specification, ADR, or mapping edits.
- `pnpm check:ci` before merging a track.

Two scenarios extend the existing `e2e/stack.ts` harness:

- Bring the fleet up, stop the server, and assert the battery cell for a robot last seen
  `live` reads an em dash while the retained row and its status stay on screen.
- Point the console at a server that accepts the connection and never responds, and assert
  robot detail reaches its recoverable error state with a working retry.

## Implementation notes

### F1 (26 August 2026)

`selectBatteryDisplay` and `selectPositionDisplay` take `isStreamConnected` as
`selectMapMarker` already did. `summarySection.tsx` reads the connection state itself
rather than receiving a prop, following `detailHeader.tsx` in the same feature: two parents
render it and neither had the value to pass.

The component suites asserted Summary and table _labels_ only, never rendered values, which
is why nothing failed when the rule was wrong. `fleetPage.test.tsx` gained a pair — `—`
while disconnected, `90%` while connected — so the suppression assertion cannot pass
vacuously, matching the guard the freshness-suppression tests already use.

### F2 (26 August 2026)

**`FetchLike` was not widened.** The plan proposed
`(url, init?: { signal }) => Promise<FetchResponse>`, which would have threaded a signal
parameter through `requestJson`, all four `fetch*` functions, their transport and hook
callers, and sixteen assertions in `transportDecoding.test.ts` — churn across roughly twenty
call sites to deliver a value the port itself can hold. The deadline instead lives in the
port implementation, built fresh per call, and `FetchLike` is unchanged.

An expired request rejects, `requestJson` already reads a rejection as `unreachable`, and
both resource hooks already offer a retry for it. So the deadline needed **no new failure
state, no new vocabulary, and no change to ADR 20** — the surface it fixes was never missing
a state, only a way to reach one.

`requestDeadlineSignal` keeps the deadline and the caller's cancellation as separate signals
on purpose. `useFetchedResource` discards a cancelled request's result and keeps an expired
one's; one shared controller would make every deadline a permanent, silent `loading` — the
exact defect being fixed.

The transport's snapshot fetch now runs under the same deadline, so a hung `/api/fleet`
fails its attempt and retries on the ADR 31 schedule. That removes the cause of the
unbounded cold-start buffer; **bounding the buffer itself remains PR 3's work**, since a
slow-but-answering snapshot can still fill it.

**Residual, deliberately not fixed here.** `useRobotDetail` still awaits robot detail and
the advisory `/health` in one `Promise.all`. The deadline bounds the damage — the page can
no longer hang — but a health response that is merely slow still delays a robot response
that has arrived, by up to the deadline. Fixing that properly means rendering `ready` before
`unknownFieldCount` is known, which is a state-shape change and a spec revision rather than
a line moved. Recorded rather than half-done.

### F2 remainder and transport hardening (26 August 2026)

**The synchronous-open defect was worse than the audit recorded.** The audit read
`fleetTransport.ts` as overwriting a live socket's status back to `opening`; a probe showed
it throws `ReferenceError: Cannot access 'handle' before initialization`. `handleSocketOpen`
closed over the `const handle` that `openSocket` had not yet returned, so a port completing
its handshake before returning hits the temporal dead zone. No production path reaches it —
the browser dispatches `open` on a later task — but a test double or an in-memory port does.

The fix moves the handshake status from the socket slot onto the `Attempt`, which exists
before the port is called and therefore has somewhere to record a synchronous open.
`connect()` reads `liveAttempt?.handshake`, and `startAttempt` adopts the returned handle
only if the attempt survived the call — a port that opened, joined and failed inside
`openSocket` would otherwise leave a socket nothing closes.

**Cold-start buffer.** `COLD_START_BUFFER_LIMIT` is 1000, an order of magnitude above the
~100 frames that PR 2's ten-second deadline and ADR 2's 10 Hz ceiling permit in the worst
case a deadline still allows; reaching it means the deadline failed, not that a snapshot was
slow. `receive` returns `"buffered" | "overflowed"` — reinstating a return value the `src/lib`
plan removed as unused (D5), now that a production consumer exists for it. On overflow the
transport abandons the attempt rather than settling: a replay with a hole in it freezes
exactly the rows the dropped frames named, which is the silent failure the open-before-fetch
ordering exists to prevent.

**The post-join reconnect floor was not implemented.** The plan listed it; ADR 31 ratifies
the behaviour verbatim. Raised as a decision request above instead.

### F6 (26 August 2026)

Lifting the persona alone would have left the battery-history remount, because the two
problems have one cause: `RobotDetailBody` and `FleetRowBody` rendered the same section
order under two element types, so React discarded the subtree whenever the page swapped
between them. The two merged into one `DetailBody` taking a
`{ kind: "detail" | "row" }` union — one union rather than a detail beside a nullable row,
so a row can never arrive carrying diagnostics.

Element type alone is not enough: the body also has to keep its **position**. The error
branch renders an alert above the body and the ready branch does not, so both now render
through one frame whose notice slot is `null` in the ready case. A `null` still occupies
its slot, so the body stays at the same index and React reconciles rather than remounts.

Both halves are pinned by one test, and both assertions were checked against a failure:
before the merge it could not find the raw-payload section (persona reset), and with the
body moved back to a different position the history endpoint is requested twice.

### F7 and F10's default (26 August 2026)

`StreamDiagnosticsContext` now carries a `StreamDiagnosticsSource` — a `subscribe` /
`getSnapshot` pair read with `useSyncExternalStore`, the same shape `FleetStoreContext`
already uses — instead of a number published from `AppRouter`'s own state. The recorder is
mount-stable, so the provider value never changes and a rejected frame wakes only the
technician field.

Two tests pin it, each checked against a real failure: the hook's consumer must not
re-render when a frame is rejected (reinstating a `setState` beside the recorder makes it
fail), and a reader must update without re-rendering a sibling.

`rejectedFrames` became `number | null`, null meaning no transport is publishing, and the
context default is null rather than zero. `connectionContext` had already made this
argument for itself: the two ways to be wrong about a missing provider are not symmetric,
and a zero here reads exactly like a stream rejecting nothing.

Lint caught what the design risked: `useSyncExternalStore(source.subscribe, ...)` passes
both members detached, so `@typescript-eslint/unbound-method` rejected them as methods.
They are readonly function properties now, which is why `FleetStore` declares its own that
way.

### F9 (26 August 2026)

The address bar owns the filters; the page derives them rather than holding a copy. Three
decisions worth recording, because each had a plausible alternative:

- **The URL is decoded, not read.** Site and vendor go through the contract's own
  `identifierSchema` — the same door `robotDetailPage` puts `:id` through — and each
  dimension degrades on its own, so one unreadable parameter never costs the others.
- **An unavailable site is narrowed away rather than rewritten out of the URL.** Filtering
  on a site this fleet lacks would show an empty table under a control with no matching
  option, and MUI would warn. Dropping it at derivation keeps the control and the table
  agreeing on one value, and leaves the address intact so a site arriving in a later
  snapshot re-engages its filter.
- **Replace, not push.** A filter is a view of this page, not a place.

**One test was written vacuous and caught before it landed.** The push-versus-replace test
first called `window.history.back()`, which does nothing under `MemoryRouter` — it passed
against `replace: false` just as happily. It now walks the router's own history through
`useNavigate(-1)`, and fails against a push. The lesson generalises to any router assertion
in this suite.

Lint also caught a real dependency churn: `sites` was a fresh array on every render where
the fleet had none, so the derivation memo missed every tick. It reads `data` instead.

Browser evidence extends the existing site-filter scenario: the narrowed view carries a
`site=` address and survives a reload with the same rows and the same control value.

### F8 (26 August 2026)

**The spec-versus-guide conflict needed no decision.** `packages/web/eslint.config.js`
enforces `components → components + external`, and the repository `AGENTS.md` places itself
above specifications in the precedence order. Component spec 02 § 2 offered "relative-time
formatting from `utils`", which lint has always rejected. The line was the error, and it is
corrected rather than escalated.

What that boundary means in practice: a component cannot share `utils/time`, so the choice
is a preformatted prop or a second implementation. Two surfaces, two answers:

- **`ConnectionBanner` takes `lastEventLabel`, already formatted.** Its `formatEventTime`
  reproduced `formatTimeUtc` byte for byte with nothing holding the two together. The shell
  may read `utils`, so it formats.
- **`FreshnessLabel` keeps formatting its own props.** Its spelling carries a date, which
  `utils/time`'s does not, and a robot last seen days ago needs one — a second format, not a
  duplicate. Its `Intl.DateTimeFormat` is now built once at module scope with the locale
  pinned, matching the collator in `fleetStore`, so two operators cannot read day and month
  in different orders.

**The prop change exposed a real gap rather than just moving code.** `formatTimeUtc` returns
an em dash for an absent time, but spec 07 § 10 requires the banner to _omit_ the fragment —
a dash where a time belongs reads as a value that failed rather than one never offered. So
`utils/time` now has one parse behind two named absence policies: `formatTimeUtcOrNull` for
surfaces that omit, `formatTimeUtc` for surfaces that hold a column's shape. That is the
"one invalid-input policy" this item was after; it just turned out to be one parse with two
honest presentations.

`severity` and `connectivity` reach the screen as words rather than wire values, through
`Record`-typed tables that fail the build if the contract gains a member. Connectivity keeps
`null` ("Not reported") apart from the reported value `unknown`: one is a fact the vendor
sent, the other is one it never did.

**Not done, deliberately.** `FreshnessLabel`'s props are unchanged. Unifying its format with
`utils/time` needs either a prop-contract change to a spec carrying four revisions of
reasoning about `asOf` nullability, or moving `utils/time` into `components/`. Both are
structural, and every production call site passes `isCompact`, which short-circuits the
formatting entirely — the path is gallery-only. Not worth a contract change at this gate.

### PR 8 — the measurement, and what it does not license (26 August 2026)

**Nothing was optimized, on evidence rather than for lack of trying.**

The scale run first failed. It was not a regression: the screenshot showed a connected
stream, 500 live rows, and the final frame's battery rendered, and the counter read exactly
120 when evaluated directly. The `expect.poll` around it was the problem — every attempt is
a `page.evaluate` round trip queueing behind the same saturated main thread the render loop
is using. Unmodified runs alternated pass and fail; adding any single evaluate before the
poll made them pass. That is the probe defect ADR 32 recorded on 23 August, one layer up,
and it has the same dangerous property: it is indistinguishable from a real regression.
Fixed with an in-page `waitForFunction` on a timer, and recorded in ADR 32.

**The timing numbers this host produces are not comparable to the baseline.** Animation-frame
interval is p50 166.7 ms here against ADR 32's 16.7 ms, on the same WSL2, Chromium 151 and
CPU count. Delta-to-next-paint is measured receipt-to-next-animation-frame, so it is bounded
below by that cadence; the 140–149 ms p50 across three runs describes the harness, not the
console. Treating it as a 3× regression would be reading the host.

So the gate PR 8 depends on is **not satisfied**, and under ADR 24 and the open D27 the
correct action is to leave `mapPage`'s per-tick derivations, the linear site-label lookup,
and the raw-payload serialization exactly as they are. Optimizing them now would be
optimizing against a number nobody can reproduce.

What the runs _do_ establish: after seven pull requests, 120 of 120 frames are received, 500
rows are retained, and the final frame's content renders — three times consecutively. That is
a real regression check on the streaming path, and it passed.

**Follow-up, with its trigger.** The map surface still has no measurement of its own; the
scale project covers the fleet table only. Build that scenario where the animation-frame
cadence is healthy — CI, or a quiet host — and decide the map's memoization against it. Until
then the map's cost is documented in this plan's findings and unaddressed by choice.

## Completion

Archive under `docs/04_archive/` once Track A has landed and the three decisions are either
ratified as ADRs or explicitly declined, naming the merge commits and the ADR numbers as
evidence.
