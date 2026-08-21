# ADR 35 — Map Spatial Context Derived Client-Side

**Decision:** The map view facets strictly one site at a time and derives that site's spatial extents client-side from the positions it has observed — padded, and only ever widening within a session — while the wire keeps carrying no bounds and `fleetSiteSchema` stays `{ siteId, label }`.
**Status:** Decided · 2026-08-20 · Implemented
**Group:** Presentation / spatial data (where a map's coordinate space comes from when the wire names a frame but never states its bounds).

## Issue

The map view is scheduled (page spec 04) and must plot robots on a canvas. The canonical position is `{ frame, x, y }` in metres, and the frame is the site id — each dialect's pose is metres in that site's own map (ADR 30). Nothing on the wire, in the manifest, or in any configuration states what a frame's extents are: `fleetSiteSchema` carries exactly a `siteId` and a `label` (ADR 34), and the README records floor plans and map calibration as deliberately not built.

A canvas needs a coordinate space. The question is where that space comes from when no authority supplies one — and the question cannot be dodged, because two sites' coordinates are not comparable: every site's robots occupy overlapping numeric ranges in independent frames, so a shared canvas would superimpose unrelated maps at a common origin and present false adjacency as fact.

This is also the event ADR 34's open question named: "the first console surface that needs a second site attribute." That question must be answered here, not silently worked around.

## Assumptions

- Frames are local and indoor. No modelled vendor reports geodetic coordinates, and none is expected to (wireframes § 3 annotation).
- The set of sites stays small (single digits) and enumerable, per ADR 34.
- Observed positions are bounded in practice — the simulator reflects robots inside ±40 m — but no contract promises any bound short of the ±1,000,000 m sanity guard on `positionSchema`, and a real vendor's frame carries no such promise either.
- The map is a complement to the fleet table, never a replacement; identity, filtering, and activation remain table-shaped concerns (wireframes § 7).

## Constraints

- ADR 22's bundle gate names "a map SDK pulled in whole" as exactly the step change it exists to stop; ADR 29 gates any new dependency behind the allow list. The spatial-context decision must not smuggle a library in.
- ADR 34 made `fleetSiteSchema` a strict object precisely so widening it is deliberate; any position that adds site fields is a schema-version change across contracts, server manifest validation, the simulator's `SITE_DIRECTORY`, and the committed manifest together.
- ADR 3: freshness is server-derived; nothing in the map's projection may involve a client clock or a client freshness judgment.
- Principle 4: the console presents only what it can honestly assert. Bounds the console invents must be visibly derived, not presented as a floor plan that exists.

## Decision

The map renders one site at a time, selected by the operator from the snapshot's site directory (ADR 34 labels), defaulting to the first directory entry.

For the selected site, the canvas's coordinate space is the bounding box of every position observed for that site's robots, padded by ten percent on each axis, with a minimum span floor so a single robot or a stationary cluster does not produce a degenerate box. Within a session the box only widens: each new frame's positions are merged into the running extents by union, never by recomputation from scratch, so the canvas does not rescale under the operator's eyes as robots wander. The extents computation and the position-to-viewBox projection are pure functions in `entities/robot`; the per-session running extents are feature-owned state, because they are view state, not domain state (Principle 11).

`fleetSiteSchema` stays `{ siteId, label }`. ADR 34's open question is answered No: the surface that needed a second site attribute arrived, and the right response was to need less, not to invent configuration no deployment can truthfully supply.

## Positions

1. **Fixed abstract bounds, mirroring the simulator's ±40 m.** Rejected: the console would bake a simulator constant into a production surface. A real vendor's frame makes no such promise, and the first robot reported outside the fixed box would render clipped or off-canvas — the map lying about where a robot is, which is the one failure a map must not have.
2. **Widen `fleetSiteSchema` with per-site bounds or an origin.** Rejected: a schema-version-4 change across four artifacts (contracts, server manifest validation, simulator directory, committed manifest) to carry numbers nobody possesses — no deployment knows a site's "true" extents without the floor-plan calibration the README records as not built. It would resolve ADR 34's open question by inventing the attribute rather than needing it.
3. **All sites on one canvas, tiled or offset per site.** Rejected: offsets between independent frames are fiction. Tiling implies adjacency and relative scale that the data does not state; three unrelated 80 m boxes rendered side by side look like one facility and are not one.
4. **One site at a time; extents derived from observed positions, padded, monotonic per session.** Chosen.

## Argument

Derived extents are the only bounds the console can assert honestly, because they are computed from data it actually received: every plotted robot is inside them by construction, an empty site degrades to an explicit empty-canvas state rather than an arbitrary frame, and no configuration file has to claim knowledge nobody has. The cost is that the box is not the room — the caption says so ("derived site frame · metres · no floor plan"), which keeps Principle 4 intact: the map claims relative geometry, not architecture.

The known failure mode of derived bounds is rescale jitter: robots random-walk outward, and a box recomputed per frame would make every marker drift as the scale changes. Monotonic widening converts that continuous jitter into at most a handful of discrete widenings per session, after which the box is stable. The residual cost — a robot that once wandered far leaves the session's box permanently generous — is cosmetic and resets on reload.

Faceting is not a preference but a consequence: incomparable frames admit no shared canvas. Given faceting, the site toggle is the smallest sufficient selector, and the snapshot directory (ADR 34) already supplies its options and labels with referential integrity guaranteed by the schema.

## Implications

- **Site faceting is mandatory and owned by this decision.** The map never renders two frames on one canvas; page spec 04 locks the selector mechanics.
- **The projection pipeline is pure and lives in `entities/robot`:** plottable filtering (site match, non-null position), extents computation with pad and floor, monotonic merge, and position-to-viewBox projection with the y-axis inversion SVG requires. The feature holds only the running extents value.
- **Robots without a position cannot plot and must still be accounted for.** A manifest-seeded robot that never reported has no position; the surface states "N of M robots positioned" and lists the unpositioned rest, so absence is presented rather than hidden (page spec 04 § 10).
- **Early-session extents are tight.** The first frame's box is the first frame's spread; markers may sit near the edges until the pad and later widenings settle. Accepted — the alternative is invented bounds.
- **No new dependency and no wire change.** The canvas is hand-rolled inline SVG in the ADR 33 idiom; ADR 22's budget is untouched by design.
- **ADR 34 is amended by observation, not superseded:** its open question is closed with the answer it leaned toward, recorded in its Observed consequences.

## Open questions

- **Should the selected site ride the URL (`?site=`) so map views are linkable?**
  _Current lean:_ Not at first; local view state is the smallest correct mechanism and nothing demands deep links yet.
  _Resolves on:_ the first demo script or operator workflow that needs to share a specific site's map.
- **Should the map route be tenant-flag-gated?**
  _Current lean:_ No. `tenantFlagsSchema` is strict, so a flag obliges every profile to take a position for a distinction no tenant has asked for.
  _Resolves on:_ the first tenant whose deployment must not expose the map.
- **Should markers show orientation?**
  _Current lean:_ No. Every vendor reports heading and every adapter deliberately drops it (ADR 30); reinstating it is a contracts-first change with a unit decision.
  _Resolves on:_ ADR 30's heading question reopening with a consumer that needs bearing, of which this map would be the first candidate.
- **Should extents ever become deployment configuration?**
  _Current lean:_ Only alongside real floor-plan calibration, which is the "Not built" item, not an attribute to approximate.
  _Resolves on:_ floor-plan calibration being scheduled.

## Observed consequences

- **20 August 2026 — implemented as decided, with one refinement the framework forced.**
  React's lint forbids reading refs during render, so the running extents persist
  through the documented render-phase state adjustment instead of a ref; to keep that
  write rare, `mergeExtents` returns its previous argument by reference when nothing
  widened, so a settled box costs no state write at all. The projection selectors,
  the derived-extents canvas, and the one-site facet otherwise landed exactly as the
  Positions section chose; the browser smoke scenario shows the manifest label and the
  positioned accounting in the canvas's accessible name against the real stack.

## Related

- **ADR 3** (freshness, server-derived) — the map displays freshness through marker fill and derives nothing; a dead stream hollows every marker under a "last known" heading.
- **ADR 22** (bundle gate) — names a map SDK as the step change to stop; this decision's zero-dependency stance is its direct application.
- **ADR 29** (dependency allow list) — why "just add a map library" was never a position.
- **ADR 30** (fields with no counterpart) — establishes `position.frame` is the site id and that heading is deliberately dropped; both facts shape this decision.
- **ADR 33** (battery history sparkline) — the hand-rolled inline SVG idiom the canvas follows.
- **ADR 34** (site directory) — amended by this decision: its open question resolves to No, recorded in its Observed consequences.
- **Principle 4** (honest presentation) — the derived-bounds caption and the "N of M positioned" accounting exist because of it.
- **Principle 11** (state separation) — why running extents are feature view state and the projection is a pure selector.
- **Artifact `docs/01_page-specs/04_MAP.md`** — the surface this decision authorizes; owns marker semantics and the failure matrix.
- **Artifact `docs/04_archive/MAP_VIEW_PLAN.md`** — the implementation plan this decision was consumed by, archived on completion.

## Notes

- 20 August 2026: recorded as **D26** while scheduling the map view, which page spec index 00 and the wireframes had carried as "optional, first to cut" since the initial planning round.
