# 03 — Robot detail

* **Status:** implementation-ready
* **Revision 3:** Aligned explicitly with canonical principles. Removed "mission/activity" from Summary (no source in the canonical envelope). Health is now its own field rather than a status qualifier. Position is rendered in its native map frame, not converted to geodetic coordinates. Section 02 is now explicitly restricted to declared non-core capabilities, since core fields rendering there defeated the point of capability-driven rendering.
* **Route:** `/robots/:id`
* **Implementation:** `web/src/features/robot`
* **Revision 4:** document number aligned to filename. Capability model now cites ADR 1 rather than a planning document. `sequence` carved out of the capability panels explicitly. Panel rendering specified as a registry rather than a conditional chain. Asynchronous state set completed (Principle 5).
* **Governing documents:** `PRINCIPLES.md` (esp. 2, 3, 4, 5, 6, 9, 11); ADR 1 (canonical core plus declared capabilities); ADR 3 (freshness); component specs 01–08; wireframes Operator / Technician

## 1. Product intent

Robot detail answers: what is this machine's state, how fresh is it, and (for technicians) what did the adapter see? Panels are driven by declared capabilities so the console never offers UI for unsupported behaviour (Principle 3).

## 2. Locked decisions

| Concern            | Decision                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Default persona    | Operator                                                                                                                                 |
| Persona UI         | `PersonaToggle` in header; same layout, additional sections for technician                                                               |
| Back navigation    | Link/button to Fleet (`/`)                                                                                                               |
| Header identity    | Robot id (mono), `StatusChip`, `FreshnessLabel`, site, vendor/model                                                                      |
| Operator body      | Summary block (core fields only) + capability panels (declared non-core capabilities only)                                               |
| Technician body    | Operator-visible content plus Diagnostics + Raw payload                                                                                  |
| Missing capability | Panel omitted entirely (no disabled placeholder)                                                                                         |
| Commands           | None (not built; do not fake success)                                                                                                    |
| Raw payload        | Technician only; mono; retained for diagnosis; served on `GET /api/robots/:id` only, excluded from the fleet read model and delta stream |
| Footer             | `DataPlate` with adapter version, sequence, received time                                                                                |

## 3. Hierarchy

1. App shell
2. Back control + header identity + `PersonaToggle`
3. `SectionLabel` + Summary (core fields: battery, position, status, health, connectivity)
4. `SectionLabel` + Capability panels (declared non-core capabilities only — the section that differs by vendor)
5. If technician: `SectionLabel` + Diagnostics
6. If technician: `SectionLabel` + Raw payload
7. `DataPlate`

## 4. Desktop layout

- Header row: identity left, persona toggle right
- Summary in a single surface (`Paper` / surface token)
- Capability panels in a responsive grid (auto-fill min ~240px)
- Diagnostics definition list or compact grid
- Raw payload in scrollable mono block, max height constrained

## 5. Narrow-screen layout

- Persona toggle wraps below identity if needed
- Panels single column
- Raw payload horizontal scroll only inside pre if unavoidable; prefer wrap

## 6. Data contract

Input: robot id from route. Load from store/API selectors.

| Block        | Fields                                                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header       | id, status, freshness, site, vendor, model                                                                                                                                                                                                |
| Summary      | battery, position (map frame, frame named — e.g. `frame: site-map`), status, health (severity + description, as its own field, not appended to status text), connectivity / last seen                                                     |
| Capabilities | Only keys present on the robot's declared capability set — `dock`, `lidarHealth`, `waterLevel` and any later addition. Each panel is a pure mapping from capability to fields. Core fields never appear here. **`sequence` is excluded**: ADR 1 declares it a capability, but it is transport metadata rather than an operator-facing machine capability, and it renders in Diagnostics. Any future capability that is diagnostic rather than operational is carved out here in the same way, explicitly, rather than by silent omission |
| Diagnostics  | adapter id/version, sequence, sequence gaps (total since start, not a rolling window), vendor ts, received ts, clock delta, schema version, unknown-field count (labelled as per-adapter fleet-wide, unless a per-robot counter is added) |
| Raw          | retained payload object, fetched as a separate field on the single-robot endpoint (decoded at the boundary, per Principle 2)                                                                                                              |

Freshness continues to update on the timer while the page is open (Principle 4).

There is no "mission" or "activity" field in the canonical envelope. If a future capability adds one, it is declared and rendered in Capabilities, not assumed into Summary.

## 7. Component composition

| UI need               | Component / MUI                |
| --------------------- | ------------------------------ |
| Status / freshness    | `StatusChip`, `FreshnessLabel` |
| Persona               | `PersonaToggle`                |
| Section indexes       | `SectionLabel`                 |
| Surfaces              | MUI Paper / Stack / Divider    |
| Footer                | `DataPlate`                    |
| Empty / missing robot | `EmptyState`                   |

Capability panel bodies may be feature-local presentational fragments, but they must not import other features or adapters (Principle 9).

**Panels come from a registry, not a conditional chain.** A `Record<CapabilityName, PanelComponent>` keyed by capability name, iterated over the robot's declared keys, means adding a capability is a registry entry plus a contracts change — never an edit to a chain of `if` statements that a vendor conditional could later hide inside (Principle 3). Panels are keyed by capability name so a robot whose declaration changes patches rather than remounts the grid.

A declared capability with no registered panel renders nothing and increments no error: the console shows what it can render and omits the rest. A registered panel with no declaration is never reached.

## 8. Interaction

- Persona is local view state owned by this feature. It is not written to the store, not derived from telemetry, and not shared with the shell (Principle 11)
- Persona toggle only changes visible sections; it does not change the URL for MVP (optional `?view=` later)
- No command buttons
- Unknown robot id → EmptyState with link back to Fleet

## 9. Accessibility

- One `h1` (robot id, or "Robot {id}")
- **`SectionLabel` is not a heading.** Each section pairs it with a real `h2` immediately following, so Summary, Capabilities, Diagnostics and Raw payload appear in a screen reader's heading list. A section index alone would leave the page with one heading and no structure (component spec 03, Principle 6)
- Capability panel titles are `h3` under the Capabilities `h2`; the outline never skips a level
- Persona group is labelled, and switching persona keeps focus on the toggle. The technician sections are additive and appear after it, so no focus management is required (component spec 08)
- Raw payload is text in a readable element. Diagnostics severity is never carried by colour alone

## 10. Failure behavior

| Condition               | Behaviour                                                                      |
| ----------------------- | ------------------------------------------------------------------------------ |
Complete asynchronous state set (Principle 5):

| Condition               | Behaviour                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| Initial load            | Header skeleton; do not render an empty Summary that later fills in with different values                     |
| Background refresh      | Values update in place with tabular numerals and no layout shift                                              |
| Unknown id              | `EmptyState` with a link back to Fleet. Not an error banner                                                    |
| Robot known, never seen | Freshness `unknown`, `asOf` is `null`, and the label renders the state word with no date (component spec 02). Panels show registration data only |
| Capability empty set    | Summary only; no empty capability section chrome                                                               |
| Partial data            | Present fields render; absent optional fields show an em dash, never a zero or a placeholder date              |
| Stale data              | Header freshness degrades on the timer; status chip takes the last-known treatment                             |
| Offline / stream down   | Shell banner; values freeze at last known; per-robot freshness label suppressed in favour of the connection state (ADR 3) |
| Recoverable error       | Keep whatever remains valid on screen and offer retry; do not blank the page                                   |
| Terminal error          | `EmptyState` stating what failed and the route back to Fleet                                                   |
| Raw payload unavailable | Technician section states that the payload was not retained; it does not render an empty code block            |

## 11. Verification

| Concern                    | Check                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Capability omission        | Fixture robot without a capability → no panel (Principle 10)                           |
| Capability/core separation | Fixture: core fields (battery, position, status, health) never appear under Section 02 |
| Persona                    | Technician shows raw + diagnostics; operator does not                                  |
| Freshness                  | Visible in header always (Principle 4)                                                 |
| No cross-feature import    | Lint (Principle 9)                                                                     |
| No vendor branches         | No vendor `if` branches anywhere in the feature; panels resolve through the registry (Principle 3) |
| Panel keys                 | Panels keyed by capability name; a declaration change patches rather than remounts     |
| Heading outline            | Each section has a real `h2`; capability panels are `h3`; no level skipped (Principle 6) |
| Never-seen robot           | Fixture with `asOf: null` renders the state word and no fabricated date (Principle 4)  |

## 12. Change rules

New shared capability types are contracts-layer changes first, then panel mappings. Adding commands requires a new ADR and is explicitly out of scope for this submission.
