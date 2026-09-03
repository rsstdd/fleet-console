# Implement the Map View

**Authority:** Historical. This plan records the map view implemented on 20 August 2026; page spec 04, ADR 35, and the shipped tests supersede its status claims.

**Archived 20 August 2026** from `docs/05_plans/MAP_VIEW.md`, on completion. Every stage is consumed by code and durable documentation: the projection selectors and their unit tests in `packages/web/src/entities/robot/`, the `features/map` feature with route, nav, state-matrix, and scale tests, and a smoke browser scenario. Evidence: 375 web unit tests passing; `pnpm check:bundle` at 605.45 kB raw / 182.40 kB gzip against the 720/300 budget with zero new dependencies; the smoke suite green in Chromium and Firefox (24/24) with WebKit left to CI per the README's engine split; `pnpm check:tokens`, `check:dependencies`, and `check:architecture-docs` all green.

## Outcome

The console serves `/map`: a site-faceted spatial view plotting every positioned robot of
one selected site as a status-coloured, freshness-filled SVG marker, with an interactive
side list as the activation path — exactly as page spec 04 contracts and ADR 35 decides —
verified by unit, scale, and browser evidence, with the bundle unchanged within noise.

## Scope

### In scope

- Pure projection selectors in `entities/robot` and the tokens the canvas needs.
- The `features/map` feature (page + presentational canvas), the `/map` route, and the
  shell's second nav item.
- Unit tests for the full resource-state matrix, a 500-robot scale test, and a smoke
  browser scenario.

### Out of scope

- Any wire or contracts change — ADR 35 chose derived extents precisely to avoid one.
- Oriented markers (heading), URL-driven site selection, tenant flag gating, marker
  animation — all recorded as ADR 35 open questions.
- Floor plans and map calibration (README "Not built"; unchanged by this plan).
- Virtualizing or otherwise altering the fleet table.

## Authorities and dependencies

- ADR 35 (spatial context, D26) is the owning decision; ADR 34 records its open question
  closed. ADR 3 (freshness), ADR 22 (bundle gate), ADR 29 (dependencies), ADR 33 (SVG
  idiom), ADR 27 (diff cap) all bind.
- Page spec `docs/01_page-specs/04_MAP.md` is the route contract; the wireframes Map view
  (revision 7) carries the exact rendered strings; app-shell spec revision 5 authorizes
  the nav item.
- The documentation suite (ADR, page spec, wireframe, index, routing tables) lands before
  code; each implementation stage below is its own PR under the ADR 27 cap, using an
  `Oversized-diff:` trailer only where a stage cannot be split without landing a
  half-tested surface.

## Data flow

The map adds projection to the pipeline the fleet table already reads; it adds no
transport and no store:

```
        server                          packages/web
┌──────────────────────┐   ┌────────────────────────────────────────────────────┐
│ GET /api/fleet       │   │ fromEnvelope: toRobot / toRegisteredRobot          │
│  snapshot (v3):      ├──▶│   Robot.position: {frame, x, y} | null             │
│  sites[], robots[]   │   │   (frame === siteId, metres — ADR 30)              │
│                      │   └──────────────┬─────────────────────────────────────┘
│ WS delta frames      │                  │ keyed replace by robotId (ADR 18)
│  (whole envelopes)   │   ┌──────────────▼─────────────────────────────────────┐
└──────────────────────┘   │ fleetStore ── useFleetRobots(): FleetResourceState │
                           └──────────────┬─────────────────────────────────────┘
                                          │ robots[], sites[]
                    ┌─────────────────────▼──────────────────────────┐
                    │ entities/robot selectors (pure)                │
                    │  selectPlottableRobots(robots, siteId)         │
                    │    └ site match ∧ position !== null            │
                    │  computeSiteExtents(positions)                 │
                    │    └ bbox + 10% pad + min-span floor           │
                    │  mergeExtents(prev, next)   ◀── session state  │
                    │    └ union; never shrinks   (feature-owned)    │
                    │  projectToViewBox(position, extents, viewBox)  │
                    │    └ y-axis inversion for SVG                  │
                    │  selectMapMarker(robot, streamConnected)       │
                    │    → {robotId, x, y, variant, hollow} via      │
                    │      selectStatusPresentation; hollow when not │
                    │      LIVE or the stream is not connected       │
                    │  selectPositionedSummary → {positioned, total} │
                    └───────────┬──────────────────────┬─────────────┘
                                │ markers[]            │ rows
                    ┌───────────▼───────────┐  ┌───────▼───────────────┐
                    │ MapCanvas (SVG)       │  │ side list             │
                    │  role="img", viewBox, │  │  Link → /robots/:id   │
                    │  var(--status-*) fill │  │  StatusChip +         │
                    │  hollow = not LIVE or │  │  FreshnessLabel       │
                    │  stream not connected │  │  "No position" group  │
                    └───────────────────────┘  └───────────────────────┘
```

`isStreamConnected` (from `shared/lib/connectionContext`) feeds the heading qualifier
("Positions · {site} · last known") and forces `hollow` on every marker while the stream
is anything but connected.

## Execution

1. **Entities + tokens** (~250 lines). Add the six pure selectors above to
   `packages/web/src/entities/robot/selectors.ts` with unit tests in
   `selectors.test.ts` (plottable filtering, pad and degenerate floor, monotonic merge,
   corner-exact y-inversion, hollow per freshness state, summary counts). Add
   `--map-height` to `packages/web/src/styles/tokens.css` with a rationale comment.
   Marker radius and stroke width are viewBox-unit constants in the component, exactly
   as the sparkline's stroke width is — a CSS length cannot describe a coordinate-space
   radius, so the two extra tokens this plan first named were dropped as misstated.
   Run `pnpm check:tokens`.
2. **Feature + route + nav** (~300 lines; `Oversized-diff:` trailer expected — the page
   and its state-matrix tests land atomically). `features/map/mapPage.tsx` exhausts
   `FleetResourceState` per page spec § 10; `features/map/mapCanvas.tsx` is the
   fetch-free presentational SVG per the § 7 contract, mirroring
   `batteryHistorySection.tsx`; route in `appRouter.tsx`; nav link in `appShell.tsx`;
   `mapPage.test.tsx` covers every § 10 row plus facet default and switching;
   `appRouter.test.tsx` and `appShell.test.tsx` extended.
3. **Scale + browser evidence + reconcile** (~150 lines). `mapScale.test.tsx`: 500 robots
   across three sites → only the selected site's markers in the DOM, tab stops equal list
   rows. A smoke scenario in `packages/web/e2e/smoke.spec.ts`: navigate to Map, assert
   markers, follow a list link to robot detail. Flip README/TODO wording from
   "specified" to built; fill this plan's Completion; run the full verification list.

## Acceptance criteria

- [x] `/map` renders inside the shell with the Fleet and Map nav items, at parity with
      page spec 04 §§ 2–10.
- [x] Every page-spec § 11 verification row has its named check passing.
- [x] `pnpm check:bundle` shows no dependency-shaped step (zero new packages).
- [x] Wireframe § 7 strings match the rendered strings.
- [x] Code and durable documentation describe the same state (README, TODO, package spec
      05 § 11 status).
- [x] Any unverified item is recorded here honestly rather than checked.

## Documentation synchronization

- `docs/01_page-specs/04_MAP.md` — revision note if implementation forces any § 2 change.
- `docs/03_package-specs/05_WEB.md` — § 4 `src/features/map` row status, § 10 verification-matrix row for the map surface, § 11 status.
- `README.md` deliverables table and `TODO.md` — "specified" → built, at stage 3.
- `docs/decisions.json` — `mechanicalRules` entries once code cites ADR 35 (the selectors
  and the canvas), then `pnpm docs:decisions`.
- `docs/DESIGN_SYSTEM.md` — deliberately unchanged: it records no feature layout token
  (`--sparkline-height` and `--panel-min-width` are likewise absent), and `--map-height`
  follows that convention. `pnpm check:tokens` covers the token file itself.
- ADR 35 Observed consequences and Status (`Not started` → `Implemented`) at stage 3.

## Verification

- `pnpm check:architecture-docs` (after every doc-affecting stage)
- `pnpm check:tokens` (stage 1)
- `pnpm --filter web lint && pnpm --filter web test` (every stage)
- `pnpm --filter web build && pnpm check:bundle` (stages 2–3)
- `pnpm test:e2e` (stage 3)
- `pnpm check:diff-size` per PR

## Completion

Archived 20 August 2026. Replacement evidence: page spec 04 (implementation-ready,
implementation `web/src/features/map`), ADR 35's Observed consequences and Implemented
status, and the test files named in the archive note above.
