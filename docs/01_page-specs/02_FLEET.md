# 02 — Fleet

* **Status:** implementation-ready
* **Revision 2:** summary strip now counts freshness states only (not a mixed status/freshness list); vendor column added to the table, since multi-vendor normalization is the second sentence of the thesis and the primary surface previously never mentioned a vendor.
* **Route:** `/`
* **Implementation:** `web/src/features/fleet`
* **Revision 3:** document number aligned to filename. Principle citations corrected against the canonical fifteen. Row activation resolved to link-only, since the previous "Enter on focused row" was not implementable without a focusable row. Asynchronous state set completed (Principle 5). Summary scope stated explicitly.
* **Governing documents:** `PRINCIPLES.md` (esp. 4, 5, 9, 11, 12); ADR 2 (delta transport, measurement commitment); ADR 3 (freshness timer); ADR 4 (structure); component specs 01–07; wireframes Fleet view

## 1. Product intent

The fleet page is the operator's primary surface: scan health, filter by site, open a robot. It must show freshness honestly and remain usable at fifty robots without custom virtualization if measurement allows. Virtualization is deferred behind ADR 2's measurement commitment at 50 and 500 robots; the deferral itself is not yet recorded as an ADR (Principle 12).

## 2. Locked decisions

| Concern        | Decision                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page title     | "Fleet overview" (or equivalent); single `h1`                                                                                                                                                                         |
| Summary        | Four `Stat` metrics counting freshness only: LIVE, STALE, UNREACHABLE, UNKNOWN. Mutually exclusive, totalling the fleet exactly. **Counts are fleet-wide and do not respond to filters** — an operator narrowing the table to find one robot should not watch the fleet totals move underneath them. Status distribution is not duplicated here; it belongs to the table and its filters |
| Filters        | Site select (All + sites); vendor select (All + vendors); optional text search on robot id; optional freshness filter                                                                                                 |
| Table columns  | Robot id (mono), Vendor, Status (`StatusChip`), Freshness (`FreshnessLabel`), Site, Battery %, Last seen (mono)                                                                                                       |
| Row activation | The robot id cell contains the only link, and it fills its cell. The row itself carries no click handler and is not focusable — a row-level `onClick` plus a nested link means one pointer activation fires twice and no keyboard path exists at all (Principle 6) |
| Empty          | `EmptyState` when filter matches nothing                                                                                                                                                                              |
| Footer         | `DataPlate` with snapshot time / source                                                                                                                                                                               |
| Map            | Not on this route for MVP                                                                                                                                                                                             |
| Polling        | Prefer WebSocket deltas; no full-table flash on each delta                                                                                                                                                            |

## 3. Hierarchy

1. App shell
2. `h1` Fleet overview
3. Summary `Stat` row (freshness counts)
4. Filter controls (site, vendor, freshness, search)
5. Table (virtualized when needed)
6. `DataPlate`
7. `EmptyState` replaces table body when no rows

## 4. Desktop layout

- Summary stats in a horizontal wrap; tabular values
- Filters in one row where width allows
- Table full content width; sticky header
- Dense rows; compact chips
- Vertical rhythm from token scale (16–32px between major blocks)

## 5. Narrow-screen layout

- Stats wrap to 2×2
- Filters stack
- Table horizontal scroll allowed only if necessary; prefer column priority (id, status, freshness first — vendor may collapse behind a toggle at the narrowest widths)
- No separate mobile information architecture

## 6. Data contract

Page reads from entity selectors / hooks only (no adapter imports).

Required fields per row (canonical read model):

| Field                 | Notes                                                                  |
| --------------------- | ---------------------------------------------------------------------- |
| `robotId`             | Stable key                                                             |
| `vendor`              | e.g. "A", "B", "C" — displayed, and filterable                         |
| `siteId` / site label | Grouping and filter                                                    |
| `status`              | Mapped to `StatusChip` variant + label, via `entities/robot` selector  |
| `freshness`           | From freshness machine (timer-derived)                                 |
| `batteryPercent`      | Normalized 0–100 display; omitted (em dash) when freshness is not LIVE |
| `lastSeenAt`          | For display + freshness machine input                                  |

Summary counts are selector-derived from freshness state, not hardcoded and not derived from status.

Updates apply as deltas keyed by `robotId` on a scheduled frame, never synchronously per message (ADR 2, Principle 12).

**Rows are keyed by `robotId`**, never by array index. A delta that reorders or filters the list must patch existing rows rather than remount them; index keys would discard row state and defeat the point of a normalized store keyed by the same identifier.

Filter selections are local view state owned by this feature. They are never written back to the store and never merged with observed telemetry (Principle 11).

## 7. Component composition

| UI need         | Component / MUI          |
| --------------- | ------------------------ |
| Metrics         | `Stat`                   |
| Status cell     | `StatusChip`             |
| Freshness cell  | `FreshnessLabel`         |
| Table structure | MUI Table* or equivalent |
| Empty           | `EmptyState`             |
| Footer          | `DataPlate`              |
| Filters         | MUI Select / TextField   |

No feature-to-feature imports.

## 8. Interaction

- Filter changes are local view state; they do not mutate server or observed state (Principle 11)
- Activation is the robot id link: pointer click, Enter when focused. There is no separate row handler
- Connection loss: table remains with last data; per-robot freshness labels are suppressed in favour of the shell banner (ADR 3); the banner states the condition

## 9. Accessibility

- Table has real column headers; the robot id cell is the row header (`scope="row"`) and carries the link
- Status and freshness are readable without colour (Principle 6)
- Every filter control has a visible label, not a placeholder standing in for one
- Live updates must not create an `aria-live` region on rows. At 500 robots at 5 Hz that would announce continuously and render the page unusable with a screen reader. Freshness transitions are visible, not announced; a critical-transition announcement policy would be a separate, deliberate addition
- Sorting, if added, exposes `aria-sort` on the active column header

## 10. Failure behavior

Complete asynchronous state set (Principle 5):

| Condition                | Behaviour                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| Initial load             | Table skeleton or a brief empty frame; never an indefinite spinner over the whole page         |
| Background refresh       | Existing rows stay visible and in place; no full-table flash                                    |
| No robots registered     | `EmptyState`: "No robots registered". Not an error                                              |
| Filters exclude all      | `EmptyState`: "No robots match these filters" plus a clear action                               |
| Partial data             | Rows render with the fields present; a missing optional field shows an em dash, never a zero    |
| Stale data               | Row-level freshness treatment; battery becomes an em dash when freshness is not LIVE            |
| Offline / stream down    | Shell banner; table retains last-known data; per-robot freshness labels suppressed (ADR 3)      |
| Recoverable error        | `EmptyState` with a retry action, or a banner if rows are still valid; say what remains valid   |
| Terminal error           | `EmptyState` without retry, stating what failed and what the operator can do next               |
| Malformed row            | Skip the row and count the rejection; never coerce and never crash the list (Principle 2)       |

## 11. Verification

| Concern                        | Check                                                        |
| ------------------------------ | ------------------------------------------------------------ |
| Freshness visible per row      | UI test / checklist                                          |
| Summary counts total the fleet | Fixture at N robots → four freshness counts sum to N         |
| Vendor filter                  | Fixture with ≥2 vendors                                      |
| Site filter                    | Fixture with ≥2 sites                                        |
| Boundary lint                  | Fleet does not import robot feature modules                  |
| Token lint                     | No raw hex in feature files                                  |
| Row keys                       | Rows keyed by `robotId`; a delta reorder patches rather than remounts        |
| Keyboard path                  | Every robot reachable and openable by keyboard alone (Principle 6)          |
| Summary scope                  | Applying a filter does not change the four counts                           |
| Performance                    | Measurement harness at 50 and 500 robots (ADR 2, Principle 12)              |

## 12. Change rules

Adding columns requires this spec update. Capability-specific columns do not belong on the fleet table; they belong on robot detail panels.

---
