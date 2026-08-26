# Web `lib` Transport Quality Audit and Refactor

**Authority:** Planning only.
**Status:** Active
**Updated:** 2026-08-25

## Outcome

`packages/web/src/lib` — the four transport modules — holds no state-machine defect
reachable from its own public API, expresses the buffered/joined and generation
invariants in types rather than in defensive guards, and carries comment prose only
where ADR 39 §1–5 warrants it. Evidenced by the existing 59 unit tests plus new tests
for each corrected behaviour staying green under
`pnpm --filter web test && pnpm --filter web lint && pnpm --filter web build`, and by
`pnpm check:diff-size` passing on each of the four pull requests.

## Audit result (2026-08-25)

`src/lib` is 940 source lines across `coldStart.ts`, `streamLifecycle.ts`,
`transportDecoding.ts`, and `fleetTransport.ts`, with 367 comment lines (39%).

**Not in scope by construction.** These modules import no React and no MUI — the `lib`
layer may import only `lib` and `context`. The React review therefore applies to them
only through their one consumer, `src/app/useFleetTransport.ts`; C2 below is the single
finding with a React consequence. No MUI finding exists here.

**Already conforming — do not touch.** Injected ports (`FetchLike`, `OpenSocket`,
`RetryTimer`, `random`) keep every policy testable without a socket or a clock, and the
tests use them. Failure vocabularies are discriminated unions with
`switch-exhaustiveness-check` enforced. The recoverable/terminal split is honoured at
every fetch. The cold-start ordering (open, buffer, fetch, reconcile, replay) is correct
and pinned by tests. `reconcileDeltaWithSnapshot` is used rather than re-implemented.
No `any`, no non-null assertion, no `eslint-disable` in the directory.

### C1 — `disconnect()` leaves a stale phase that refuses the next `connect()` (highest priority)

`fleetTransport.ts:339–342` cancels the retry and closes the socket but never advances
the state machine, so `transport.state.phase` keeps reporting `connected` with no socket
under it. `connect()` at `:331` guards on that phase, so the following `connect()` is a
no-op and the transport never opens another socket.

Not reachable from today's only consumer — `useFleetTransport` disconnects on unmount
and the transport is mount-scoped, and a StrictMode remount disconnects while still
`connecting` — but it is a defect in the module's own published contract (`state` is
documented as "the transport's full state") and nothing tests it.

Verified 2026-08-25 with a throwaway probe: after open + settle, `disconnect()` leaves
`state.phase === "connected"` and a subsequent `connect()` opens no socket.

Fix: add a `disconnect` member to `StreamEvent` returning `idle` with the terminal cause
cleared, so the exhaustive switch forces every consumer to consider it, and have
`connect()` guard on holding a live socket rather than on the published phase. Reset
`failedAttempts` and `probeFailures` with it: a disconnected transport that reconnects
must not inherit the previous session's backoff.

### C2 — `nextStreamState` breaks the reference-identity contract `advance` depends on

`streamLifecycle.ts:127–132`'s `close` arm returns a fresh object even when nothing
changes: from `connecting` with no prior connection, the result has the same `phase`,
`attempt`, `lastConnectedAt`, and `terminalCause` as its input. `fleetTransport.ts:164–170`
compares by identity to decide whether a transition happened — the doc comment at
`streamLifecycle.ts:96–101` states that contract explicitly — so every failed initial
probe fires `onConnectionState` with content identical to the previous report.

The React consequence: `useFleetTransport.ts:112` calls `setStreamState(next)` with an
equal-but-new object, re-rendering every consumer of `FleetTransportState` (app shell,
connection banner) for a transition that did not happen. `fleetStore.snapshotStart()`
already guards itself, so no fleet re-render follows; the shell re-render does.

Verified 2026-08-25: `nextStreamState(connecting, {kind:"close"})` is `toStrictEqual` to
its input and `not.toBe` it.

Fix: return `state` from the `close` and `joined` arms when the computed next state
matches, restoring the documented contract, with a test asserting reference identity
alongside the existing `connect`-while-connected test at `streamLifecycle.test.ts:96`.

### C3 — An unreachable guard silently drops live frames

`fleetTransport.ts:293`'s `if (epoch === null) return;` cannot fire: `coldStart.settle()`
and the `epoch` assignment at `:241–245` are adjacent synchronous statements, so a
settled cold start always has an epoch. As written it is a guard that would discard live
telemetry without counting it if the invariant ever broke — the opacity the clean-code
standard refuses.

Fix: make the pair unrepresentable rather than guarded. Replace the `coldStart` + `epoch`
variables with one `join` value that is either buffering or joined-carrying-its-epoch, so
"settled" and "has an epoch" are one fact. This also retires `ColdStart.isSettled`
(see D5).

### C4 — Three owners bump the `generation` counter

`generation` invalidates every asynchronous callback and is the module's central race
defence, but it is incremented in `closeSocketSilently()` (`:181`), in
`handleAttemptFailure()` (`:199`), and in `onClose`'s established-stream branch (`:315`)
— which then calls `startAttempt()`, bumping it a fourth time. The double bumps are
harmless only by accident, and a reader cannot tell which increments are load-bearing.

Fix: one owner. Name the operation for what it means — `supersedeAttempt()` — have it
own the increment and the socket close, and remove the redundant bumps. No behaviour
change; the existing stale-callback tests (`fleetTransport.test.ts:263, 465`) are the
evidence.

### D1 — `transportDecoding.ts` repeats one fetch shape four times

`fetchFleetSnapshot` (`:78`), `fetchRobotDetail` (`:176`), `fetchHealth` (`:221`), and
`fetchBatteryHistory` (`:259`) each write the same try / `!response.ok` / `await json()` /
catch block. Extract one private `requestJson(fetchLike, url)` returning
`{ ok: true; body: unknown } | { ok: false; status: number | null }`. Every public
function keeps its own outcome union and its own policy — the 404 branch, health's
shapeless failure — so the differences that matter stay visible instead of being buried
in four copies of the part that does not.

### D2 — Two identifiers named `attempt` mean different things

In `fleetTransport.ts`, `attempt` is the generation token captured at `:268` and compared
at `:224, :275, :286, :310`, while `state.attempt` is the operator-visible retry count the
banner displays. Rename the token `attemptGeneration`. Related: `advance` at `:164` types
its parameter as `Parameters<typeof nextStreamState>[1]` when `StreamEvent` is exported
from the module it already imports; and `REAL_TIMER` (`:69`) reads better as
`BROWSER_TIMER` beside the fakes tests inject.

### D3 — Parse results named for the field they will populate

`transportDecoding.ts:192–196` binds `const observed = parseRobotDiagnosticEnvelope(body)`
and `const registered = parseRegisteredRobotState(body)`, then writes
`{ observed: true, envelope: observed.value }` — `observed` is simultaneously a parse
result and the discriminant of `RobotDetailResponse`. Rename to `diagnostic` and
`registration`. Also restore alphabetical order to the `@fleet/contracts` import at
`:1–17`, where `parseRobotBatteryHistory` precedes `parseRegisteredRobotState`.

### D4 — A known failure reported as an empty issue list

`decodeFrameText` (`:125–135`) reports a message that is not JSON at all as
`{ ok: false, issues: [] }`, and a comment explains the empty array. ADR 20 gives the
repository one failure vocabulary whose whole point is that a surface names the path and
the code; `ContractIssue` is three plain fields and is constructible here. Emit
`{ path: "(root)", code: "invalid_json", message }` instead, and delete the comment that
was standing in for the value.

**Bounded deliberately.** Nothing downstream reads these issues today —
`FleetTransportHandlers.onFrameRejected` (`fleetTransport.ts:94`) takes no arguments, and
the fleet TODO's A4 leaves escalation-after-repeated-failures trigger-deferred. Widening
the handler to carry issues is out of scope for this plan; making the value honest is not.

### D5 — `ColdStart.isSettled` has no production consumer

`coldStart.ts:58` publishes an accessor that only `coldStart.test.ts:91` reads, and that
assertion sits beside one that already checks `receive()` returns `"live"` — the
behaviour a caller actually depends on. C3 removes the transport's last reason to ask.
Drop the member and the accessor assertion; keep the behavioural one.

### E1 — Module prose that ADR 39 assigns to the owning ADR

The four module-level blocks run 96 lines and much of it is architectural rationale:
`coldStart.ts:19–29` argues why HTTP carries the snapshot, `streamLifecycle.ts:29–33`
justifies choosing a reducer over a class, `transportDecoding.ts:23–26` restates
Principle 2, `fleetTransport.ts:19–24` lists the modules the imports already name. ADR 39
puts architectural rationale in the owning ADR and permits exactly this review when a file
is touched — while forbidding a repository-wide sweep, so each trim rides in the pull
request that already edits its file.

Keep, because each preserves an ADR 39 §1–5 invariant that code cannot carry: the
open-before-fetch ordering and its silent symptom; the generation/stale-callback race
resolution; the recoverable-versus-terminal split and why a frame failure is neither; the
reference-identity contract at `streamLifecycle.ts:96–101`, which C2 makes load-bearing;
and the `INITIAL_PROBE_ATTEMPT_LIMIT` coupling note naming `connectionBanner.tsx`.

Target: roughly half the prose, judged sentence by sentence against ADR 39, not by count.

## Scope

### In scope

- The four modules in `packages/web/src/lib` and their colocated tests.
- New focused tests for C1, C2, and D4; adjusted assertions for D5.
- Comment trimming in those four files only.

### Out of scope

- Widening `onFrameRejected` to carry issues, and any rejected-frame escalation threshold
  (fleet TODO A4, trigger-deferred).
- `src/app/useFleetTransport.ts` beyond whatever C1's event addition requires.
- Any change to the ADR 31 retry policy, the published connection vocabulary, or the
  cold-start ordering.
- `connectionBanner.tsx`'s mirrored `StreamTerminalCause`, which the `components ↛ lib`
  boundary requires.
- Comment review outside `src/lib` (ADR 39 forbids the sweep).

## Authorities and dependencies

- `PRINCIPLES.md` — P2 (boundary decode), P5 (complete async states), P11 (state
  separated by authority), P14 (one discoverable authority).
- ADR 18 and ADR 31 own the joining order, the session reconciliation, and the retry
  policy. **This plan changes none of them**; C1 and C2 are defects against them.
- ADR 20 owns the one issue vocabulary (D4). ADR 39 and ADR 28 own the comment standard
  (E1). ADR 27's 300-line reviewable-diff gate sets the pull-request split below.
- `packages/web/AGENTS.md` — layers, comment policy, React rules.
- Sequencing: C3 depends on C1 and C2 landing first (it restructures the same function
  bodies). D1–D5 are independent of each other.

## Execution

Four pull requests, each under the ADR 27 line budget, each green before the next starts.

1. **PR A — state-machine correctness.** C1 and C2 in `streamLifecycle.ts`,
   `fleetTransport.ts`, and `useFleetTransport.ts`, with a failing test written first for
   each: a disconnect-then-reconnect that opens a second socket, and a reference-identity
   assertion on the no-op `close`.
2. **PR B — transport internals.** C3 (one `join` value), C4 (`supersedeAttempt`), D2
   (naming and the `StreamEvent` type), plus E1's trim of `fleetTransport.ts`. Behaviour
   preserved; the existing stale-callback and restart-recovery tests are the evidence.
3. **PR C — decoding boundary.** D1 (`requestJson`), D3 (naming, import order), D4
   (`invalid_json` issue), plus E1's trim of `transportDecoding.ts`.
4. **PR D — cold start and lifecycle.** D5 (`isSettled`), plus E1's trim of
   `coldStart.ts` and `streamLifecycle.ts`.

## Acceptance criteria

- [x] A test proves a disconnected transport reconnects and that `state` reports no
      connection after `disconnect()`.
- [x] A test proves a no-op `close` returns the same `StreamState` reference.
- [x] `epoch` cannot be absent while the cold start is settled — expressed in the type,
      not in a runtime guard.
- [x] `generation` is incremented in exactly one function.
- [x] `decodeFrameText` names a non-JSON message with a path and a code.
- [x] The 59 existing `src/lib` tests pass unmodified, except two assertions this plan's
      own items rewrite: the `isSettled` one D5 removes, and the `decodeFrameText`
      empty-issue-list one D4 replaces. 63 tests now pass in `src/lib`.
- [x] Each pull request passes `pnpm check:diff-size`.
- [x] Every surviving comment in `src/lib` states an ADR 39 §1–5 invariant, and every
      deleted one is recoverable from an ADR or a test.

## Documentation synchronization

- `docs/03_package-specs/05_WEB.md` § 9 if the frame-rejection outcome shape changes (D4).
- `packages/web/src/features/fleet/TODO.md` A4 — unchanged, but re-read to confirm this
  plan does not close it.
- This plan is archived under `docs/04_archive/` once PR D lands.

## Verification

- `pnpm --filter web test` — narrowest, per pull request.
- `pnpm --filter web lint` and `pnpm --filter web build` before each merge.
- `pnpm check:diff-size` before each commit.
- `pnpm test:e2e` after PR A only: C1 and C2 touch the connection banner's inputs, and
  `packages/web/AGENTS.md` requires a running-browser check for a user-facing change.
- `pnpm check:doc-comments` after E1's trims.

## Completion

Archive under `docs/04_archive/` after PR D, naming the four merge commits as evidence.

### Implementation notes (2026-08-25)

- **C1, second half.** `connect()` guards on `activeSocket?.status === "open"`. The socket
  slot carries its own handshake status rather than a loose flag beside it, so there is one
  place that knows whether a stream is worth preserving. The guard and the former
  `phase === "connected"` test agree in every reachable state — each exit from `connected`
  already supersedes the attempt — so this is a decoupling, not a bug fix: the transport's
  control flow no longer depends on the reducer's projection staying in step with socket
  reality. ADR 31's "a no-op while connected" contract, until now untested at the transport
  level, has a test.
- **`ColdStart.receive` returns `void`.** C3 made the attempt's `join` status the authority
  for buffered-versus-live, leaving `"buffered" | "live"` with no production consumer — the
  argument D5 made for `isSettled`. A frame offered to a settled buffer now throws, as a
  second `settle` already does, rather than being swallowed by a buffer nothing will drain
  again.
- **WebKit e2e** could not run on the development host (Playwright reports missing system
  libraries: `libgtk-4`, `libgraphene`, the GStreamer set). The Chromium and Firefox smoke
  projects passed, 28 tests.

### Implementation notes (2026-08-26)

- **C3's structure moved onto the attempt.** `fleetTransport` no longer keeps a
  module-level `attemptJoin`; each `Attempt` owns its cold start and its `join`, and
  `AttemptJoin` carries only the epoch. C3's criterion still holds — `settleIntoJoinedStream`
  reaches `attempt.coldStart` without narrowing, so no runtime guard returns — and the frame
  that a live callback routes is now the one its own attempt buffered, structurally rather
  than because `isSuperseded` ran first. It also retires the `ColdStart` the factory
  allocated at construction for a join no attempt owned.
- **`StreamState` is a union discriminated on `phase`**, so `terminalCause` is present
  exactly while the phase is `failed`. ADR 31 § Published vocabulary is unaffected: five
  phases, the same three causes, still metadata beside the phase rather than more states.
  This reached `app/useFleetTransport.ts`, which the plan lists as out of scope — the
  narrowing made its `terminalCause !== null` check provably true and
  `@typescript-eslint/no-unnecessary-condition` an error, so the condition was simplified
  rather than suppressed.
