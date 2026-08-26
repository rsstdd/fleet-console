# What changed between v1 and v2

**v1** — tag `v1`, 21 August 2026, the state reviewed on-site.
**v2** — tag `v2`, 26 August 2026.

73 commits · 245 files · +13,067 / −6,089 lines. The weight is where the review found it:
`packages/web` (162 files) and the documents that govern it (48 files). The four library
packages changed by 102 lines in total — the canonical model, the adapter boundary and the
server were not the problem, so they were left alone.

Each section below names the review point it answers.

---

## 1. Directory structure — "unnecessarily nested"

v1 used feature-sliced design: `entities/`, `shared/lib`, `shared/ui`, with domain logic one
or two levels below where a reader would look for it.

v2 uses the conventional React vocabulary, one level deep:

| v1                                  | v2                            |
| ----------------------------------- | ----------------------------- |
| `entities/robot/`, `entities/site/` | `stores/`, `types/`, `utils/` |
| `shared/ui/`                        | `components/`                 |
| `shared/lib/`                       | `lib/`, `context/`, `hooks/`  |
| `app/dev/`                          | `features/component-gallery/` |

The layer rules did not weaken — they are still lint-enforced, with the same import table
and the same `__boundary-violation__` fixtures proving each rule fires. What changed is that
the names are now the ones a React engineer expects, so the structure explains itself
without the guide. Decided as **ADR 36**; the migration plan is archived under
`docs/04_archive/WEB_FOLDER_VOCABULARY.md`.

## 2. God components — "two data stores for one view", "multiple connected components"

The three largest components in v1 were doing layout, data selection and presentation at
once. They were decomposed into components that each own one job and subscribe to what they
need:

| Component              | v1                  | v2                                                                         |
| ---------------------- | ------------------- | -------------------------------------------------------------------------- |
| `componentGallery.tsx` | 592 lines, one file | 13 files under `features/component-gallery/`                               |
| `fleetPage.tsx`        | 569                 | 274, plus `fleetFilters`, `fleetSummary`, `fleetTable`, `fleetFilterModel` |
| `robotDetailPage.tsx`  | 552                 | 196, plus 9 section components                                             |

`features/robot/` went from 6 source files to 15. The page is now a state machine that
chooses which body to render; each section subscribes for itself.

Two concrete consequences the review predicted:

- **Persona survived the failure boundary.** Two sibling components each owned a persona
  `useState`, so a technician reading diagnostics was silently returned to the operator view
  whenever the detail request failed and recovered. Persona now lives on the component that
  straddles both bodies.
- **The rejected-frame counter left the root.** It was `useState` in `AppRouter`, so every
  malformed frame re-rendered the shell, the fleet page and every row to update one number
  in a technician-only panel. It now travels through its own context from a subscribable
  source.

## 3. TypeScript — "unnecessary abstraction, using TypeScript wrong"

**ADR 38** sets a shared baseline and `pnpm check:type-safety` enforces it:
`exactOptionalPropertyTypes`, checked index access, `noUncheckedIndexedAccess`, members that
can be `readonly` must be, no explicit `any` — a precise type or `unknown` plus validation at
the boundary.

Abstractions that earned nothing were removed rather than documented:

- A local `ParseResult<T>` that shadowed the canonical `@fleet/contracts` export.
- Four endpoints repeating the same request-then-parse block collapsed onto one
  `fetchDecoded<T>`, keeping each endpoint's own outcome union.
- `ColdStart.isSettled` and other accessors with no production consumer.
- Runtime guards that could not fire were replaced by types that make the state
  unrepresentable — the transport's "buffering or joined" pair is now one value.

## 4. Comment drift

**ADR 37** and **ADR 39** replace "comment your exports" with a semantic test: a comment
earns its place only if it preserves an invariant, an external-system lifecycle, a
workaround, a non-obvious protocol constraint, or caller-visible behaviour that names,
types, tests and owning documentation cannot carry. A doc comment that restates its
signature is a lint error. Package-level guides carry the policy once instead of each file
re-deciding it. Compliance work is archived under
`docs/04_archive/WEB_TYPESCRIPT_COMMENT_COMPLIANCE.md`.

## 5. "How do you prevent stale data?"

This was treated as the organising question rather than one more item.

The rule was already that the server derives freshness on a 500 ms sweep and the client only
displays it (**ADR 3**). v2 audited whether the client actually honours that everywhere, in
`docs/05_plans/WEB_DATA_LIFECYCLE_AUDIT.md`. Ten findings, then a second pass along the
concurrency axis with nine more. What it found and fixed:

- **A stale number read as a current one.** While the stream is down, `freshness` is frozen
  at the last delta received, so a row last seen `live` kept printing a battery percentage
  and a position after the console had already withdrawn the currency claim beside them.
  Both are now suppressed on the same signal the label is.
- **No request could time out.** A server that accepted a connection and never answered left
  robot detail and battery history in `loading` for the life of the page. Every request now
  runs under a deadline that is typed tenant configuration, and the cold-start buffer is
  bounded and reports what it discards.
- **One malformed WebSocket frame terminated the server.** `ws` emits `error` on the
  server-side socket for a frame its receiver refuses, and an `error` event with no listener
  throws out of the EventEmitter. Six bytes from any client killed the process and blinded
  every connected console. Proven against the real stack before and after: the process now
  survives, the bystander console keeps streaming, and the event is logged.
- **Delta ordering rested on an unstated assumption.** The reconciliation epoch was pinned to
  the snapshot and never advanced, so any frame past it applied in arrival order — offered
  flush sequences 5 then 3, the transport applied both and left the older reading on screen.
  Correctness depended on WebSocket's in-order delivery, which nothing stated. The epoch now
  tracks what was applied.

Findings that need a decision rather than a patch were recorded, not quietly worked around:
a completed join that immediately drops still retries without backoff, which ADR 31's letter
permits and its argument forbids; and the map's running extents survive an epoch change,
which ADR 35 says should reset but the read model cannot currently express.

## 6. Verification

|               | v1  | v2                                                          |
| ------------- | --- | ----------------------------------------------------------- |
| Test files    | 103 | 113                                                         |
| Unit tests    | —   | 1,282 across five packages                                  |
| Browser tests | —   | 28 against the real stack (Chromium, Firefox, WebKit in CI) |
| ADRs          | 35  | 39                                                          |

`pnpm check:ci` is one command: docs consistency, type-safety, doc comments, design tokens,
dependency layering, lint, typecheck, tests, build, fixture drift, reviewable-diff size and
the bundle budget. It passes on `v2`.

Two gates were added: design tokens are generated and linted, so a raw hex or `px` outside
the token layer fails the build; and no pull request may exceed 300 changed lines without a
trailer stating why it has no smaller form. Every change above was landed under that cap.

## 7. What is deliberately still open

Recorded in `docs/05_plans/WEB_DATA_LIFECYCLE_AUDIT.md` with the reason each remains:
back-navigation can render a previous visit's detail while a request is in flight; the status
chip still asserts currency the battery beside it has withdrawn; robot detail keeps a robot a
reseed has dropped; the battery-history window's "last 60 seconds" ages without saying so.
None is blocked on difficulty — they are the next items in a queue that is written down.
