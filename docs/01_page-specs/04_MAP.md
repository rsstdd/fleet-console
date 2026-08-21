# 04 — Map

- **Status:** implementation-ready
- **Route:** `/map`
- **Implementation:** `web/src/features/map`
- **Governing documents:** `PRINCIPLES.md` (esp. 3, 4, 5, 6, 8, 9, 11); ADR 3 (freshness, server-derived); ADR 22 (bundle gate — no map SDK); ADR 33 (inline-SVG idiom); ADR 34 (site directory); ADR 35 (spatial context derived client-side); component specs 01, 02, 03, 04, 06; wireframes Map view

## 1. Product intent

The map answers the one question the fleet table cannot: where the robots of a site are relative to each other, right now. It is a spatial complement to the table, never a replacement — identity, filtering across sites, and dense scanning stay table-shaped concerns, and the fleet page remains the primary surface. The map claims relative geometry inside one site's own frame and nothing more: no floor plan, no cross-site layout, no architecture (ADR 35).

## 2. Locked decisions

| Concern             | Decision                                                                                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page title          | "Map"; single `h1`                                                                                                                                                                                                                                                           |
| Faceting            | One site at a time. Position frames are per-site and mutually incomparable, so a shared canvas is a false statement (ADR 35). Site selection is an exclusive toggle whose options and labels come from the snapshot directory (ADR 34); default is the first directory entry |
| Spatial extents     | Derived client-side from observed positions of the selected site: bounding box, padded ten percent per axis, minimum-span floor, widening monotonically within the session (ADR 35). Never configured, never taken from the simulator's constants                            |
| Canvas              | One inline SVG per the ADR 33 idiom: `viewBox` from the derived extents, `role="img"` with a computed accessible name, colours and dimensions from tokens only, zero dependencies (ADR 22, ADR 29). The canvas is **not** interactive — no focusable or clickable markers    |
| Activation          | The side list is the sole activation path: one `Link` per robot to `/robots/:id`, so N robots cost N tab stops, never 2N and never per-marker targets (same rule as the fleet table, Principle 6)                                                                            |
| Marker encoding     | Colour = canonical status via the status tokens; fill = freshness: filled when LIVE while the stream is connected, hollow in every other case. A visible legend and the side list carry the same facts as text (Principle 6)                                                 |
| Marker labels       | None at v1. Robot id text beside markers collides at density; identity lives in the side list. The wireframe's id annotations are sketch shorthand                                                                                                                           |
| Orientation         | Not shown. Every adapter deliberately drops heading (ADR 30); oriented markers are a contracts-first change recorded as an ADR 35 open question                                                                                                                              |
| Unpositioned robots | A robot with `position === null` (never reported) cannot plot. It is counted in the "N of M robots positioned" line and listed in the side list under "No position" with an em dash — accounted for, never silently absent (Principle 4)                                     |
| Heading suppression | While the stream is anything but connected the summary heading gains "· last known", every marker renders hollow, and per-robot freshness text in the list is suppressed. The shell banner remains the single announcing authority (ADR 3, ADR 23)                           |
| Dependencies        | Zero new packages. The bundle gate names "a map SDK pulled in whole" as exactly what it stops (ADR 22)                                                                                                                                                                       |

## 3. Hierarchy

1. App shell
2. `h1` Map
3. Site toggle (exclusive; directory-labelled)
4. Summary section: `h2` "Positions · {site label}" (qualified "· last known" when not connected) over the "N of M robots positioned" line
5. Canvas section (SVG over derived extents, its `DataPlate` figcaption "derived site frame · metres · no floor plan", legend line beneath)
6. Side-list section: `h2` "Robots" over one row per robot of the selected site, positioned first, then the "No position" group
7. `EmptyState` replaces canvas and list when the fleet or the selection is empty

## 4. Desktop layout

- Canvas roughly two thirds of the content width, side list the remaining third
- Canvas height from the `--map-height` token; SVG scales to its container with the aspect ratio of the derived extents preserved
- Legend line directly under the canvas; tabular values in the side list
- Vertical rhythm from the token scale, as on the fleet page

## 5. Narrow-screen layout

- Everything stacks in reading order: site toggle, summary, canvas, legend, side list
- The canvas keeps its token height; the list scrolls normally with the page
- No separate mobile information architecture

## 6. Data contract

Page reads from entity selectors / hooks only (no adapter imports). The pipeline is the
same store the fleet table reads — the map adds projection, not transport:

```
HTTP snapshot + WS deltas → fromEnvelope → fleetStore → useFleetRobots()
  → entities/robot selectors: plottable(site) → extents(pad, floor) → project(viewBox)
    → MapCanvas (SVG markers)                      → side list (Link per robot)
```

| Field               | Notes                                                                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `robotId`           | Stable key for markers and list rows; the list link's target                                                                                  |
| `siteId`            | Facet membership for every robot, including unpositioned ones — `position.frame` cannot group a robot that never reported                     |
| `robot.position`    | `{ frame, x, y }` metres, or `null` for a robot that never reported. `frame` is the site id (ADR 30); only the selected site's robots project |
| `robot.status`      | Mapped to marker colour and list `StatusChip` via `selectStatusPresentation` — one selector for both surfaces, so they cannot disagree        |
| `robot.freshness`   | Server-derived, arrives on the envelope (ADR 3). Drives marker fill and the list `FreshnessLabel`. Never computed in this feature             |
| `sites[]`           | `{ siteId, label }` from the snapshot directory (ADR 34). The schema's referential refinement guarantees every robot's site is labelled       |
| `lastSeenAt`        | Feeds `FreshnessLabel`'s as-of fragment in the side list, exactly as on the fleet table. Display only; never an input to any derivation       |
| `isStreamConnected` | From `shared/lib/connectionContext` — the one boolean behind the heading qualifier and the hollow-all treatment                               |

**Freshness is never derived here.** No timer, no `Date.now()`, no client judgment; a
marker's fill changes when a delta says the freshness changed (ADR 3).

**Extents are view state, not domain state** (Principle 11). The pure computation —
plottable filtering, bounding box with pad and floor, monotonic merge, position-to-viewBox
projection with SVG's y-axis inversion — lives in `entities/robot` selectors; the feature
holds only the running per-session extents value and the selected site.

Updates apply as deltas keyed by `robotId` on a scheduled frame (ADR 2). The simulator
reflects robots at site bounds rather than wrapping, so consecutive positions never
teleport; markers move by re-render, with no animation at v1.

## 7. Component composition

| UI need            | Component / MUI                                             |
| ------------------ | ----------------------------------------------------------- |
| Site selection     | MUI `ToggleButtonGroup` (exclusive), directory labels       |
| Summary count      | Plain text line under the `h2` (no `Stat` row — one number) |
| Canvas             | `features/map/mapCanvas` — inline SVG, see contract below   |
| List row status    | `StatusChip` (component spec 01)                            |
| List row freshness | `FreshnessLabel` (component spec 02)                        |
| Section index      | `SectionLabel` (component spec 03)                          |
| Canvas caption     | `DataPlate` as figcaption (component spec 04)               |
| Empty              | `EmptyState` (component spec 06)                            |
| List row link      | Router `Link`, mono robot id                                |

`MapCanvas` is deliberately **not** a `shared/ui` primitive and gets no
`docs/02_component-specs/` file: markers are domain-flavoured (status, freshness,
position), and `shared/ui` is domain-free by rule. Its component contract lives here
instead:

```ts
/** One projected marker; every field is already derived — the canvas computes nothing. */
interface MapMarker {
  readonly robotId: string;
  /** ViewBox coordinates, already projected and y-inverted. */
  readonly x: number;
  readonly y: number;
  /** Status-token variant for the marker colour. */
  readonly variant: StatusPresentationVariant;
  /** Hollow when freshness is not LIVE or the stream is not connected. */
  readonly hollow: boolean;
}

interface MapCanvasProps {
  readonly markers: readonly MapMarker[];
  /** Derived extents driving the viewBox; null renders the empty-canvas message. */
  readonly viewBox: { readonly width: number; readonly height: number } | null;
  /** Feeds the computed accessible name, e.g. "Map of North site: 5 of 6 robots positioned". */
  readonly siteLabel: string;
  readonly positionedCount: number;
  readonly totalCount: number;
}
```

The SVG follows the ADR 33 idiom exactly: `viewBox` + `preserveAspectRatio`, stroke and
fill from `var(--status-*)` / `var(--line)` tokens only, `vectorEffect="non-scaling-stroke"`,
height `var(--map-height)`, `role="img"` with the computed label. No feature-to-feature
imports.

## 8. Interaction

- Site toggle changes only the facet: it swaps the plotted and listed robots and resets nothing else. Selection is local view state, never written to the store (Principle 11)
- Activation is the side-list robot id link: pointer click, Enter when focused. Markers are not activation targets
- Connection loss: canvas and list retain last-known data; every marker renders hollow; per-robot freshness labels in the list are suppressed; the summary heading gains "· last known"; the shell banner states the condition (ADR 3, ADR 23)
- Markers move on delta re-render. If a transition is ever added it must respect `prefers-reduced-motion`; at v1 there is none

## 9. Accessibility

- The canvas is one `role="img"` with a computed accessible name naming the site and the positioned count. Screen-reader users get the same answer the canvas gives sighted users, through the name and the side list — the list is the accessible equivalent, visible to everyone, not an `sr-only` twin (ADR 33 precedent)
- The side list is the keyboard path: one link per robot, N robots = N tab stops. No focusable markers, no duplicate activation paths (Principle 6)
- Colour never stands alone: the legend states the fill rule as text, and every list row carries status and freshness as text
- No new `aria-live` region. Marker changes are visible, not announced; the connection banner is the single announcing authority (component spec 07)
- Sections are `aria-labelledby` visible headings: one `h1`, then the summary and list `h2`s
- The site toggle has a visible label and announces selection via the toggle-group's pressed state

## 10. Failure behavior

Complete asynchronous state set (Principle 5):

| Condition                     | Behaviour                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial load                  | `loading` resource state: "Loading map…" with a skeleton canvas region, `aria-busy`; never an indefinite spinner over the whole page                                                     |
| Background refresh            | `refreshing` resource state: markers and list stay in place under a quiet status line; no canvas flash, no live region                                                                   |
| No robots registered          | `EmptyState`: "No robots registered". Not an error                                                                                                                                       |
| Site has no positioned robots | Canvas region shows "No positioned robots in {site label}"; the list still renders the site's robots under "No position". Not an error                                                   |
| Partial data                  | A robot without a position is listed with an em dash and counted in "N of M"; a plotted marker always has every field (projection guarantees it)                                         |
| Stale data                    | Marker hollow at last-known position; list row takes the fleet table's last-known treatment                                                                                              |
| Offline / stream down         | Canvas and list retain last-known data; all markers hollow; per-robot freshness labels suppressed; heading "Positions · {site} · last known"; shell banner carries the condition (ADR 3) |
| Recoverable error             | `recoverable-error` state: warning banner with the one Retry control; retained markers and rows stay below when any exist                                                                |
| Terminal error                | `terminal-error` state: error banner naming the contract issue paths and codes (ADR 20), **no retry**, retained content kept below                                                       |

## 11. Verification

| Concern               | Check                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projection purity     | Selector unit tests: plottable filtering excludes null-position and other-site robots; extents pad and floor; monotonic merge never shrinks; y-inversion maps corners correctly |
| No client derivation  | Grep the feature for interval timers and `Date.now()`; must find none (ADR 3)                                                                                                   |
| Positioned accounting | Fixture with unpositioned robots → "N of M" matches and the "No position" group lists exactly the rest                                                                          |
| Site facet            | Toggle default is the first directory entry; switching swaps the marker and list sets; options and labels derive from the directory (ADR 34)                                    |
| Marker encoding       | Each non-LIVE freshness renders hollow; LIVE renders filled; colour comes from the status variant selector shared with the list                                                 |
| Resource-state matrix | Unit tests drive every § 10 row (`mapPage.test.tsx`)                                                                                                                            |
| Suppression           | Disconnected context → heading gains "· last known", all markers hollow, list freshness suppressed                                                                              |
| Keyboard path         | Every robot reachable and openable through its list link alone; tab-stop count equals list rows, not markers (`mapScale.test.tsx` at 500 robots)                                |
| Accessible name       | Canvas `role="img"` name includes the site label and positioned count                                                                                                           |
| Scale                 | 500 robots across three sites → only the selected site's markers in the DOM (`mapScale.test.tsx`)                                                                               |
| Route and nav         | `appRouter.test.tsx` renders `/map` inside the shell; `appShell.test.tsx` asserts the Fleet and Map nav links                                                                   |
| Browser evidence      | Smoke scenario: navigate to Map, assert markers, follow a list link to robot detail (ADR 32)                                                                                    |
| Token lint            | No raw hex or px in feature files; canvas dimensions and colours from tokens                                                                                                    |
| Boundary lint         | Map imports no other feature and no adapter                                                                                                                                     |
| Bundle                | `pnpm check:bundle` unchanged within noise — zero new dependencies (ADR 22)                                                                                                     |

## 12. Change rules

Marker semantics (colour, fill, labels) change only with this spec and the wireframe
together — the wireframe's strings are the rendered strings. Extents strategy changes
route through ADR 35. Making markers interactive, adding orientation, or plotting more
than one site would each reverse a locked decision and require a revision here plus, for
orientation, the contracts-first change ADR 30 describes.

---
