# 03 — Robot detail

- **Status:** implementation-ready
- **Revision 3:** Aligned explicitly with canonical principles. Removed "mission/activity" from Summary (no source in the canonical envelope). Health is now its own field rather than a status qualifier. Position is rendered in its native map frame, not converted to geodetic coordinates. Section 02 is now explicitly restricted to declared non-core capabilities, since core fields rendering there defeated the point of capability-driven rendering.
- **Route:** `/robots/:id`
- **Implementation:** `web/src/features/robot`
- **Revision 4:** document number aligned to filename. Capability model now cites ADR 1 rather than a planning document. `sequence` carved out of the capability panels explicitly. Panel rendering specified as a registry rather than a conditional chain. Asynchronous state set completed (Principle 5).
- **Revision 5:** freshness derivation resolved (TODO **D12**) in favour of ADR 3 as written — server-side only. § 6 no longer implies a page-local timer.
- **Revision 6:** the `sequence` carve-out moved from this document into `@fleet/contracts`' `CAPABILITY_KINDS` (ADR 19). § 6 still states the rule; it no longer _is_ the rule, because a capability that reaches neither surface is now a compile error.
- **Revision 7 (20 August 2026):** Battery history added as section 02, between Summary and Capabilities, per ADR 33 (register D24): a fetch-on-visit resource independent of the main detail fetch, rendered as an inline-SVG sparkline over the contract's fixed 60-second window with a visible textual summary, every empty/failure state named in prose, and no join to the delta stream. Later sections renumber 03/04/05.
- **Revision 8 (26 August 2026):** Summary battery and position are suppressed to an em dash whenever the stream is not connected, not only when `freshness` is not LIVE (plan `WEB_DATA_LIFECYCLE_AUDIT`, **F1**). During an outage `freshness` is frozen at the last delta received, so the retained value cannot support a currency claim the header has already withdrawn by suppressing its reporting-status label. "Last seen" is unaffected: it is unambiguously historical. §§ 6, 9 updated.
- **Revision 9 (26 August 2026):** the fetched detail and the retained fleet row render through one body component rather than two (plan `WEB_DATA_LIFECYCLE_AUDIT`, **F6**). Two components rendering the same section order were swapped by element type on failure and recovery, which reset the persona and remounted the battery-history section into a second request for a window it already held. Persona moves above the body; the section order, prose and states are unchanged. §§ 8, 9 updated.
- **Revision 10 (26 August 2026):** the rejected-frame field reads "Not measured" when no transport is publishing, rather than "0" (plan `WEB_DATA_LIFECYCLE_AUDIT`, **F7**/**F10**). A zero there was a measurement nobody took and read on screen exactly like a healthy stream. With a transport mounted the field is unchanged. § 9 updated.
- **Revision 8 (20 August 2026):** live by reconciliation. The page fetches diagnostics
  and history once per visit, then keeps core values and freshness current by overlaying
  this robot's fleet row — `useFleetRobot(id)` plus the pure `reconcileDetailWithRow` —
  onto the fetched detail. No delta re-triggers a fetch, and deltas naming other robots do
  not re-render the page. The site label resolves against the snapshot's directory
  (ADR 34). Technician Diagnostics gains the console's session-wide rejected-frame count
  with its scope stated. §§ 2, 6, 10, 11 updated.
- **Governing documents:** `PRINCIPLES.md` (esp. 2, 3, 4, 5, 6, 9, 11); ADR 1 (canonical core plus declared capabilities); ADR 3 (freshness, server-derived); ADR 33 (battery history); ADR 34 (site directory); component specs 01–08; wireframes Operator / Technician

## 1. Product intent

Robot detail answers: what is this machine's state, how fresh is it, and (for technicians) what did the adapter see? Panels are driven by declared capabilities so the console never offers UI for unsupported behaviour (Principle 3).

## 2. Locked decisions

| Concern            | Decision                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default persona    | Operator                                                                                                                                                              |
| Persona UI         | `PersonaToggle` in header; same layout, additional sections for technician                                                                                            |
| Back navigation    | Link/button to Fleet (`/`)                                                                                                                                            |
| Header identity    | Robot id (mono), `StatusChip`, `FreshnessLabel`, site (labelled from the snapshot directory — ADR 34), vendor/model                                                   |
| Operator body      | Summary block (core fields only) + Battery history (fixed 60-second window, fetched once per visit, ADR 33) + capability panels (declared non-core capabilities only) |
| Technician body    | Operator-visible content plus Diagnostics + Raw payload                                                                                                               |
| Missing capability | Panel omitted entirely (no disabled placeholder)                                                                                                                      |
| Commands           | None (not built; do not fake success)                                                                                                                                 |
| Raw payload        | Technician only; mono; retained for diagnosis; served on `GET /api/robots/:id` only, excluded from the fleet read model and delta stream                              |
| Footer             | `DataPlate` with adapter version, sequence, received time                                                                                                             |

## 3. Hierarchy

1. App shell
2. Back control + header identity + `PersonaToggle`
3. `SectionLabel` + Summary (core fields: battery, position, status, health, connectivity)
4. `SectionLabel` + Battery history (sparkline over the last 60 seconds, with textual summary — ADR 33)
5. `SectionLabel` + Capability panels (declared non-core capabilities only — the section that differs by vendor)
6. If technician: `SectionLabel` + Diagnostics
7. If technician: `SectionLabel` + Raw payload
8. `DataPlate`

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

| Block           | Fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header          | id, status, freshness, site (label from the snapshot's `sites` directory), vendor, model                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Battery history | `robotBatteryHistorySchema` from `GET /api/robots/:id/history`, fetched once per visit by its own resource hook (`useRobotHistory`), never joined to the delta stream. The x-axis spans exactly `[capturedAt − windowMs, capturedAt]` and the y-axis is fixed 0–100%; timestamps are server receipt times and feed no freshness reasoning (ADR 3, ADR 33). The visible summary carries minimum, maximum, latest, window, and retained sample count                                                                                                                                                                                                                                                                                                                            |
| Summary         | battery, position (map frame, frame named — e.g. `frame: site-map`), status, health (severity + description, as its own field, not appended to status text), connectivity / last seen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Capabilities    | Only keys present on the robot's declared capability set — `dock`, `lidarHealth`, `waterLevel` and any later addition. Each panel is a pure mapping from capability to fields. Core fields never appear here. **`sequence` is excluded**: ADR 1 declares it a capability, but it is transport metadata rather than an operator-facing machine capability, and it renders in Diagnostics. Since ADR 19 that exclusion is not this page's to remember: `@fleet/contracts` classifies every capability `operator` or `diagnostic` in `CAPABILITY_KINDS`, and the panel registry is keyed by the operator-facing set, so a future capability that is diagnostic rather than operational is carved out by classifying it — and one that is classified neither way does not compile |
| Diagnostics     | adapter id/version, sequence, sequence gaps (total since start, not a rolling window), vendor ts, received ts, clock delta, schema version, unknown-field count (labelled as per-adapter fleet-wide, unless a per-robot counter is added), rejected stream frames (labelled as console session, all robots — a fact about this console's stream, never about this robot)                                                                                                                                                                                                                                                                                                                                                                                                      |
| Raw             | retained payload object, fetched as a separate field on the single-robot endpoint (decoded at the boundary, per Principle 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Freshness and every core value continue to update while the page is open, as deltas
arrive on the stream (ADR 3). The mechanism is reconciliation, not refetching: the page
subscribes to this robot's fleet row and overlays it onto the one fetched detail
(`reconcileDetailWithRow`), so diagnostics and the retained raw payload stay as fetched
while battery, position, status, health, connectivity, freshness, and last-seen move with
the stream. The page holds no timer of its own, and neither do the data layers — a
header label changes because a delta changed it (Principle 4).

There is no "mission" or "activity" field in the canonical envelope. If a future capability adds one, it is declared and rendered in Capabilities, not assumed into Summary.

## 7. Component composition

| UI need               | Component / MUI                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status / freshness    | `StatusChip`, `FreshnessLabel`                                                                                                                                                            |
| Persona               | `PersonaToggle`                                                                                                                                                                           |
| Section indexes       | `SectionLabel`                                                                                                                                                                            |
| Surfaces              | MUI Paper / Stack / Divider                                                                                                                                                               |
| Battery sparkline     | Feature-local inline SVG polyline (no charting dependency — ADR 33), fixed axes, theme tokens, no animation, no live region; `DataPlate` figcaption states times are server receipt times |
| Footer                | `DataPlate`                                                                                                                                                                               |
| Empty / missing robot | `EmptyState`                                                                                                                                                                              |

Capability panel bodies may be feature-local presentational fragments, but they must not import other features or adapters (Principle 9).

**Panels come from a registry, not a conditional chain.** A `Record<CapabilityName, PanelComponent>` keyed by capability name, iterated over the robot's declared keys, means adding a capability is a registry entry plus a contracts change — never an edit to a chain of `if` statements that a vendor conditional could later hide inside (Principle 3). Panels are keyed by capability name so a robot whose declaration changes patches rather than remounts the grid.

A declared capability with no registered panel renders nothing and increments no error: the console shows what it can render and omits the rest. A registered panel with no declaration is never reached.

## 8. Interaction

- Persona is local view state owned by this feature. It is not written to the store, not derived from telemetry, and not shared with the shell (Principle 11)
- Persona is held **above** the body, by the component that renders every state, so it survives a detail failure and its successful retry. Held inside a body it would reset to operator each time the page swapped between the fetched detail and the retained fleet row
- Persona toggle only changes visible sections; it does not change the URL for MVP (optional `?view=` later)
- No command buttons
- Unknown robot id → EmptyState with link back to Fleet

## 9. Accessibility

- One `h1` (robot id, or "Robot {id}")
- **`SectionLabel` is not a heading.** Each section pairs it with a real `h2` immediately following, so Summary, Capabilities, Diagnostics and Raw payload appear in a screen reader's heading list. A section index alone would leave the page with one heading and no structure (component spec 03, Principle 6)
- Capability panel titles are `h3` under the Capabilities `h2`; the outline never skips a level
- Persona group is labelled, and switching persona keeps focus on the toggle. The technician sections are additive and appear after it, so no focus management is required (component spec 08)
- Raw payload is text in a readable element. Diagnostics severity is never carried by colour alone
- The battery sparkline is `role="img"` with an accessible name stating the robot, the range, and the window; the same facts appear as visible text beside it, so the chart is never the only carrier (Principle 6, ADR 33)

## 10. Failure behavior

| Condition                                      | Behaviour |
| ---------------------------------------------- | --------- |
| Complete asynchronous state set (Principle 5): |

| Condition                          | Behaviour                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial load                       | Header skeleton; do not render an empty Summary that later fills in with different values                                                                                                                                                                                                                                                       |
| Background refresh                 | Values update in place with tabular numerals and no layout shift                                                                                                                                                                                                                                                                                |
| Unknown id                         | `EmptyState` with a link back to Fleet. Not an error banner                                                                                                                                                                                                                                                                                     |
| Robot known, never seen            | Freshness `unknown`, `asOf` is `null`, and the label renders the state word with no date (component spec 02). Panels show registration data only                                                                                                                                                                                                |
| Capability empty set               | Summary only; no empty capability section chrome                                                                                                                                                                                                                                                                                                |
| Partial data                       | Present fields render; absent optional fields show an em dash, never a zero or a placeholder date                                                                                                                                                                                                                                               |
| Stale data                         | Header freshness degrades as the server sweep's output arrives; status chip takes the last-known treatment                                                                                                                                                                                                                                      |
| Offline / stream down              | Shell banner; per-robot freshness label suppressed in favour of the connection state (ADR 3), and Summary battery and position suppressed to an em dash with it — they rest on the same frozen `freshness`. "Last seen" and the battery-history section stay visible, both being unambiguously historical                                       |
| Recoverable error                  | Do not blank the page. The fetched detail is gone, so the live fleet row stands in — header, Summary, Battery history, Capabilities — and keeps reconciling against deltas. The alert's control names what it retries, because the battery-history section can offer its own at the same time. With no row in the store, the alert stands alone |
| Terminal error                     | `EmptyState` stating what failed and the route back to Fleet. Nothing decoded from contract-invalid bytes stays on screen                                                                                                                                                                                                                       |
| Detail unread, robot streaming     | Diagnostics and Raw payload state that this console did not read them — never the registered-robot prose, which would blame the machine for the console's failed request                                                                                                                                                                        |
| Retry in flight                    | The control stays operable and a polite `role="status"` states that an attempt is running; the failure message is not re-announced and not replaced                                                                                                                                                                                             |
| Raw payload unavailable            | Technician section states that the payload was not retained; it does not render an empty code block                                                                                                                                                                                                                                             |
| Battery history loading            | Skeleton inside the section; the rest of the page renders without waiting for it                                                                                                                                                                                                                                                                |
| Battery history request failure    | Inline retry within the section; valid robot detail is never blanked by the secondary resource (ADR 33)                                                                                                                                                                                                                                         |
| Battery history contract failure   | Terminal message inside the section; retrying the same bytes is not offered                                                                                                                                                                                                                                                                     |
| Battery history empty window       | Prose: no telemetry retained in the window — never a chart of zero (Principle 4)                                                                                                                                                                                                                                                                |
| Battery samples without battery    | Prose: battery was not reported in the window — distinguished from "nothing arrived"                                                                                                                                                                                                                                                            |
| Battery single reading             | Prose stating the one value; a trend line needs a second reading                                                                                                                                                                                                                                                                                |
| Battery history during stream loss | Historical values stay visible, because the section is unambiguously historical (window and receipt-time caption stated)                                                                                                                                                                                                                        |

## 11. Verification

| Concern                    | Check                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability omission        | Fixture robot without a capability → no panel (Principle 10)                                                                                                                                    |
| Capability/core separation | Fixture: core fields (battery, position, status, health) never appear under Section 02                                                                                                          |
| Persona                    | Technician shows raw + diagnostics; operator does not                                                                                                                                           |
| Freshness                  | Visible in header always (Principle 4)                                                                                                                                                          |
| No cross-feature import    | Lint (Principle 9)                                                                                                                                                                              |
| No vendor branches         | No vendor `if` branches anywhere in the feature; panels resolve through the registry (Principle 3)                                                                                              |
| Panel keys                 | Panels keyed by capability name; a declaration change patches rather than remounts                                                                                                              |
| Heading outline            | Each section has a real `h2`; capability panels are `h3`; no level skipped (Principle 6)                                                                                                        |
| Never-seen robot           | Fixture with `asOf: null` renders the state word and no fabricated date (Principle 4)                                                                                                           |
| Detail failure retention   | Fixture: robot request 503 with that robot's row in the store → Summary renders the row's values under the warning, and the "has not reported yet" prose is absent (`robotDetailPage.test.tsx`) |
| Retry feedback             | `BatteryHistoryContent` with `retrying: true` → a `status` region states it and the Retry control stays enabled (`batteryHistorySection.test.tsx`)                                              |
| Battery history placement  | Section 02 renders after Summary and before Capabilities (`batteryHistorySection` + page tests)                                                                                                 |
| Battery history isolation  | History fetch failure leaves detail, capabilities, and the technician toggle intact; inline retry recovers in place                                                                             |
| Battery history states     | Empty, null-only, and single-reading windows render their prose, never an empty chart (Principle 4)                                                                                             |
| Sparkline correctness      | Coordinate mapping and accessible name asserted in `batteryHistorySection.test.tsx`; retained-window survival after robot silence asserted in the Playwright smoke suite (ADR 32, ADR 33)       |
| Live reconciliation        | Unit: a stream delta updates core values without a refetch; unrelated deltas leave the page's row identity untouched. Browser: detail values change from deltas with no navigation (ADR 32)     |
| Rejected-frame count       | Technician-only row labelled "console session, all robots"; absent from the operator view                                                                                                       |

## 12. Change rules

New shared capability types are contracts-layer changes first, then panel mappings. Adding commands requires a new ADR and is explicitly out of scope for this submission.
