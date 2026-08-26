# What changed between v1 and v2

**v1** — tag `v1`, 21 August 2026, the state reviewed on-site.
**v2** — tag `v2`, 26 August 2026.

75 commits · 242 files · +12,132 / −6,093 lines.

| Area                                   | Files | Lines changed |
| -------------------------------------- | ----- | ------------- |
| `packages/web`                         | 162   | 14,415        |
| `scripts`                              | 11    | 412           |
| contracts, adapters, server, simulator | 15    | 115           |

The four library packages moved 115 lines between them. I focused on cleaning up the React app.

Each section names the review point it answers.

---

## 1. Directory structure | Idiomatic and Scalable

| v1                                  | v2                            |
| ----------------------------------- | ----------------------------- |
| `entities/robot/`, `entities/site/` | `stores/`, `types/`, `utils/` |
| `shared/ui/`                        | `components/`                 |
| `shared/lib/`                       | `lib/`, `context/`, `hooks/`  |
| `app/dev/`                          | `features/component-gallery/` |

Feature-sliced design replaced by more conventional React vocabulary, one level deep. The
layer rules did not weaken: the same import table, still lint-enforced, still proved by 30
`__boundary-violation__` / `__enforcement__` fixtures — the same count as v1. Decided as
**ADR 36**; migration plan archived at `docs/04_archive/WEB_FOLDER_VOCABULARY.md`.

## 2. Component decomposition | Avoiding God Components

| Component              | v1                  | v2                                                                         |
| ---------------------- | ------------------- | -------------------------------------------------------------------------- |
| `componentGallery.tsx` | 592 lines, one file | 13 files under `features/component-gallery/`                               |
| `fleetPage.tsx`        | 569                 | 274, plus `fleetFilters`, `fleetSummary`, `fleetTable`, `fleetFilterModel` |
| `robotDetailPage.tsx`  | 552                 | 196, plus 9 section components                                             |

`features/robot/` went from 6 source files to 15. Robot detail is now a state machine that
selects which body to render; each body composes sections.

Two defects the split removed:

- **Persona survived the failure boundary.** Two sibling components each owned a persona
  `useState`, so a technician reading diagnostics was silently returned to the operator view
  whenever the detail request failed and recovered. There is now one declaration, on the
  page that straddles both bodies.
- **The rejected-frame counter left the root.** It was `useState` in `AppRouter`, so every
  malformed frame re-rendered the shell, the fleet page and every row to update one number
  in a technician-only panel. It now travels through its own context from a subscribable
  source.

**What this is not.** The sections are presentational. `fleetPage` still calls
`useFleetRobots()` and `useConnectionState()` and passes the results down; `FleetTable`,
`FleetSummary` and `FleetFilters` take props only. Of the robot-detail sections, only
`BatteryHistorySection` owns its own fetch. Splitting one connected component per view into
several — the point raised in review — is identified and **not done**; see § 7.

## 3. TypeScript Fixes

Abstractions that earned nothing were deleted rather than documented:

- A local `ParseResult<T>` shadowing the canonical `@fleet/contracts` export.
- Four endpoints repeating one request-then-parse block, collapsed onto `requestJson` and
  `fetchDecoded<T>`, each endpoint keeping its own outcome union.
- `ColdStart.isSettled` and other accessors with no production consumer.
- Runtime guards that could not fire, replaced by types that make the state
  unrepresentable — the transport's "buffering or joined" pair is now one value.

## 4. Comment drift

Replaced "document every export" with a semantic test: a comment
earns its place only if it preserves an invariant, an external-system lifecycle, a
workaround, a non-obvious protocol constraint, or caller-visible behaviour that names,
types, tests and owning documentation cannot carry. A doc comment restating its signature is
a lint error (**ADR 28**). Package guides carry the policy once. Compliance work archived at
`docs/04_archive/WEB_TYPESCRIPT_COMMENT_COMPLIANCE.md`.

## 5. Stale Data or Race Conditions

Treated as the organising question.

The rule already established that the server derives freshness on a 500 ms sweep and the client only
displays it (**ADR 3**). v2 audited whether the client honours that everywhere —
`docs/05_plans/WEB_DATA_LIFECYCLE_AUDIT.md`, ten findings, then a concurrency pass with nine
more. Four that mattered:

- **A stale number read as a current one.** While the stream is down, `freshness` is frozen
  at the last delta received, so a row last seen `live` kept printing a battery percentage
  and a position after the console had withdrawn the currency claim beside them. Both are
  now suppressed on the same signal as the label.
- **No request could time out.** A server that accepted a connection and never answered left
  robot detail and battery history in `loading` for the life of the page. Every request now
  runs under a deadline held in typed tenant configuration, and the cold-start buffer is
  bounded at `COLD_START_BUFFER_LIMIT` and reports overflow rather than replaying a buffer
  with a hole in it.
- **One malformed WebSocket frame terminated the server.** `ws` emits `error` on the
  server-side socket for a frame its receiver refuses, and an `error` event with no listener
  throws out of the EventEmitter. Six bytes from any client killed the process and blinded
  every connected console. Measured against the real stack before and after: before, the
  process exited and a connected console received 0 further frames; after, the process
  survives, the console keeps streaming, and the event is logged.
- **Delta ordering rested on an unstated assumption.** The reconciliation epoch was pinned
  to the snapshot and never advanced, so any frame past it applied in arrival order —
  offered flush sequences 5 then 3, the transport applied both and left the older reading on
  screen. Correctness depended on WebSocket's in-order delivery, which nothing stated. The
  epoch now tracks what was applied.

Findings needing a decision rather than a patch were recorded, not worked around: a
completed join that immediately drops still retries without backoff, which ADR 31's letter
permits and its argument forbids; and the map's running extents survive an epoch change,
which ADR 35 says should reset but the read model cannot currently express.

## 6. Verification

|               | v1  | v2                                                          |
| ------------- | --- | ----------------------------------------------------------- |
| ADRs          | 35  | 39                                                          |
| Test files    | 103 | 113                                                         |
| Unit tests    | —   | 1,282 across five packages                                  |
| Browser tests | —   | 28 against the real stack (Chromium, Firefox, WebKit in CI) |

`pnpm check:ci` is one command: docs consistency, type-safety, doc comments, design tokens,
dependency layering, lint, typecheck, tests, build, fixture drift, reviewable-diff size and
the bundle budget. It passes on `v2`.

One gate is new since v1: design tokens are generated and linted, so a raw hex or `px`
outside the token layer fails the build. The 300-line reviewable-diff cap (**ADR 27**)
predates v1; 12 of the 75 commits above exceeded it and carried its documented
`Oversized-diff:` trailer stating why.

## 7. Deliberately still open

Recorded in `docs/05_plans/WEB_DATA_LIFECYCLE_AUDIT.md` with the reason each remains:

- One connected component per view, rather than several (§ 2).
- Back-navigation can render a previous visit's detail while a request is in flight.
- The status chip still asserts currency the battery beside it has withdrawn.
- Robot detail keeps a robot a reseed has dropped.
- The battery-history window's "last 60 seconds" ages without saying so.

None is blocked on difficulty. They are the next items in a queue that is written down.
