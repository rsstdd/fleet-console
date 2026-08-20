# 02 — Fleet

- **Status:** implementation-ready
- **Revision 2:** summary strip now counts freshness states only (not a mixed status/freshness list); vendor column added to the table, since multi-vendor normalization is the second sentence of the thesis and the primary surface previously never mentioned a vendor.
- **Route:** `/`
- **Implementation:** `web/src/features/fleet`
- **Revision 3:** document number aligned to filename. Principle citations corrected against the canonical fifteen. Row activation resolved to link-only, since the previous "Enter on focused row" was not implementable without a focusable row. Asynchronous state set completed (Principle 5). Summary scope stated explicitly.
- **Revision 4:** freshness derivation resolved (TODO **D12**) in favour of ADR 3 as written — server-side only. § 6 now states that neither this feature nor `entities/robot` derives freshness, and § 11 adds a check for it.
- **Revision 5 (20 Aug 2026):** ADR 23's fleet-summary open question resolved (fleet TODO **A7**). The summary is a labelled section under a visible `h2` that reads "Fleet freshness" while the stream is connected and "Fleet freshness · last known" in any other state. Counts stay visible during an outage; the qualification is one shared heading, not a per-metric tag, and adds no `aria-live` region and no client timestamp. §§ 2, 3, 8, 9, 10, 11 updated.
- **Governing documents:** `PRINCIPLES.md` (esp. 4, 5, 9, 11, 12); ADR 2 (delta transport, measurement commitment); ADR 3 (freshness, server-derived); ADR 4 (structure); component specs 01–07; wireframes Fleet view

## 1. Product intent

The fleet page is the operator's primary surface: scan health, filter by site, open a robot. It must show freshness honestly and remain usable at several hundred robots. **It is not virtualized, and that is now a recorded decision** ([ADR 24](../00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md), register D14): the table renders one row per robot and is asserted correct at 500 rows in `fleetScale.test.tsx`. ADR 32 then measured the reopening workload in Chromium at 500 robots and ten frames per second (120/120 frames applied; delta-to-next-paint p95 53.7 ms); it did not trigger virtualization. No ceiling beyond that documented workload is claimed (Principle 12).

## 2. Locked decisions

| Concern        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page title     | "Fleet overview" (or equivalent); single `h1`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Summary        | Four `Stat` metrics counting freshness only: LIVE, STALE, UNREACHABLE, UNKNOWN. Mutually exclusive, totalling the fleet exactly. **Counts are fleet-wide and do not respond to filters** — an operator narrowing the table to find one robot should not watch the fleet totals move underneath them. Status distribution is not duplicated here; it belongs to the table and its filters. The four metrics sit in a section labelled by a visible `h2`: "Fleet freshness" while the stream is connected, "Fleet freshness · last known" in any other state (ADR 23). The heading derives solely from `isStreamConnected`; no per-metric tag, no client timestamp |
| Filters        | Site select (All + sites); vendor select (All + vendors); optional text search on robot id; optional freshness filter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Table columns  | Robot id (mono), Vendor, Status (`StatusChip`), Freshness (`FreshnessLabel`), Site, Battery %, Last seen (mono)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Row activation | The robot id cell contains the only link, and it fills its cell. The row itself carries no click handler and is not focusable — a row-level `onClick` plus a nested link means one pointer activation fires twice and no keyboard path exists at all (Principle 6)                                                                                                                                                                                                                                                                                                                                                                                               |
| Empty          | `EmptyState` when filter matches nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Footer         | `DataPlate` with snapshot time / source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Map            | Not on this route for MVP                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Polling        | Prefer WebSocket deltas; no full-table flash on each delta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 3. Hierarchy

1. App shell
2. `h1` Fleet overview
3. Summary section: `h2` "Fleet freshness" (qualified "· last known" when not connected) over the `Stat` row (freshness counts)
4. Filter controls (site, vendor, freshness, search)
5. Table (one row per robot; not virtualized — ADR 24)
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

| Field                 | Notes                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `robotId`             | Stable key                                                                                                                 |
| `vendor`              | e.g. "A", "B", "C" — displayed, and filterable                                                                             |
| `siteId` / site label | Grouping and filter                                                                                                        |
| `status`              | Mapped to `StatusChip` variant + label, via `entities/robot` selector                                                      |
| `freshness`           | Server-derived, arrives as a field on the envelope (ADR 3). Never computed in this feature                                 |
| `batteryPercent`      | Normalized 0–100 display; omitted (em dash) when freshness is not LIVE                                                     |
| `lastSeenAt`          | Display only (`reportedAt`). The sweep reads `receivedAt` server-side; this value is not an input to any client derivation |

Summary counts are selector-derived from freshness state, not hardcoded and not derived from status. The selector counts the freshness field it is given; it does not evaluate ages.

**Freshness is never derived here.** It is computed by the server sweep and delivered on the stream (ADR 3). This feature has no timer, and neither does `entities/robot`. A row's freshness changes when a delta says it changed.

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
- Connection loss: table remains with last data; per-robot freshness labels are suppressed in favour of the shell banner (ADR 3); the banner states the condition. The summary keeps its four counts but its heading changes to "Fleet freshness · last known" — the group-level qualification that lets last-known counts remain without asserting currency (ADR 23, Principle 4)

## 9. Accessibility

- Table has real column headers; the robot id cell is the row header (`scope="row"`) and carries the link
- Status and freshness are readable without colour (Principle 6)
- Every filter control has a visible label, not a placeholder standing in for one
- Live updates must not create an `aria-live` region on rows. At 500 robots at 5 Hz that would announce continuously and render the page unusable with a screen reader. Freshness transitions are visible, not announced; a critical-transition announcement policy would be a separate, deliberate addition
- The summary heading's connected → "· last known" change is likewise **not** announced via `aria-live`. The connection banner is the single announcing authority for the outage (component spec 07); a second announcement for the same event would double it. The section is `aria-labelledby` the visible `h2`, so assistive technology reaching the counts reads the qualification as the region's name
- Sorting, if added, exposes `aria-sort` on the active column header

## 10. Failure behavior

Complete asynchronous state set (Principle 5):

| Condition             | Behaviour                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial load          | Table skeleton or a brief empty frame; never an indefinite spinner over the whole page                                                                                            |
| Background refresh    | Existing rows stay visible and in place; no full-table flash                                                                                                                      |
| No robots registered  | `EmptyState`: "No robots registered". Not an error                                                                                                                                |
| Filters exclude all   | `EmptyState`: "No robots match these filters" plus a clear action                                                                                                                 |
| Partial data          | Rows render with the fields present; a missing optional field shows an em dash, never a zero                                                                                      |
| Stale data            | Row-level freshness treatment; battery becomes an em dash when freshness is not LIVE                                                                                              |
| Offline / stream down | Shell banner; table retains last-known data; per-robot freshness labels suppressed (ADR 3); summary counts stay visible under the "Fleet freshness · last known" heading (ADR 23) |
| Recoverable error     | `EmptyState` with a retry action, or a banner if rows are still valid; say what remains valid                                                                                     |
| Terminal error        | `EmptyState` without retry, stating what failed and what the operator can do next                                                                                                 |
| Malformed row         | Skip the row and count the rejection; never coerce and never crash the list (Principle 2)                                                                                         |

## 11. Verification

| Concern                        | Check                                                                                                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Freshness visible per row      | UI test / checklist                                                                                                                                                               |
| No client derivation           | Grep the feature and `entities/robot` for interval timers and `Date.now()` in freshness paths; must find none (ADR 3)                                                             |
| Summary counts total the fleet | Fixture at N robots → four freshness counts sum to N                                                                                                                              |
| Vendor filter                  | Fixture with ≥2 vendors                                                                                                                                                           |
| Site filter                    | Fixture with ≥2 sites                                                                                                                                                             |
| Boundary lint                  | Fleet does not import robot feature modules                                                                                                                                       |
| Token lint                     | No raw hex in feature files                                                                                                                                                       |
| Row keys                       | Rows keyed by `robotId`; a delta reorder patches rather than remounts                                                                                                             |
| Keyboard path                  | Every robot reachable and openable by keyboard alone (Principle 6)                                                                                                                |
| Summary scope                  | Applying a filter does not change the four counts                                                                                                                                 |
| Summary qualification          | Connected: `h2` reads exactly "Fleet freshness". Reconnecting or disconnected: "Fleet freshness · last known", counts unchanged (unit tests + Playwright outage scenario, ADR 32) |
| Heading hierarchy              | One `h1`, then the summary `h2`; no `aria-live` on the heading change                                                                                                             |
| Performance                    | Measurement harness at 50 and 500 robots (ADR 2, Principle 12)                                                                                                                    |

## 12. Change rules

Adding columns requires this spec update. Capability-specific columns do not belong on the fleet table; they belong on robot detail panels.

---
