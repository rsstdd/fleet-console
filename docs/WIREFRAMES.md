# Wireframes — `canonical-fleet` console

**Revision 7.** § 7 promoted from "optional, only if time remains" to the scheduled Map view (page spec 04, ADR 35). The sketch gained what the decision requires: a site toggle (one site at a time — frames are mutually incomparable), the "N of M robots positioned" accounting line, the derived-bounds caption, a legend, and a side list as the sole interactive path. Marker fill encodes freshness (filled = LIVE, hollow otherwise); stream loss hollows every marker under a "· last known" heading. § 8's Map row flipped to required.

**Revision 6.** § 6 gained the three states ADR 31 added to the banner: `connecting` (a first attempt, with no last-event fragment because nothing was ever received), and the two named terminal disconnects — initial probe exhausted, and stream integrity error. Copy is the exact string the component renders (component spec 07 revision 3).

**Revision 5.** § 0 and the § 3 annotation reconciled with ADR 19, which they had lagged: capabilities now split `operator` / `diagnostic` in `@fleet/contracts`, so the rule for § 3's panels is the operator set rather than "non-core", and `sequence` is listed as the declared capability it is instead of appearing only as envelope metadata. Page spec 03 revision 6 had already made this change; these screens had not.

**Revision 4.** § 1 and § 6 banner sketches reconciled with component spec 07 revision 2, which these wireframes had outdated in three ways. The disconnected line now carries the fixed § 5 copy including `(may be stale)`; both retry controls read `Retry now`; and the `⚠` / `✕` glyphs are gone, because the § 4 required output has no icon element and the condition is carried by the words and the tint. Copy on these screens is the exact string the component renders, so a change to either updates both (component spec 07 § 12).

**Revision 3.** § 6 and § 9 step 5 corrected against ADR 3: freshness is derived by the server sweep, so a killed stream suppresses per-robot labels rather than degrading every row on a client timer. The `--drop` sequence in step 4 is unchanged.

**Revision 2.** Reconciled with the canonical envelope. Every value shown below has a source in `@fleet/contracts`; anything without one was cut or moved. Summary strip counts freshness only. Capability panels render non-core capabilities only. Status is qualified whenever freshness is not LIVE.

Dense, operational, no decorative chrome. Two personas on one layout.

---

## 0. Contract reference

Values on these screens come from exactly these places.

| Group                                  | Fields                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Core, every robot, every vendor        | robot id, site id, vendor, model, connectivity, battery, position (map frame), status, health                         |
| Canonical status                       | `idle`, `busy`, `charging`, `fault`, `unknown`                                                                        |
| Health severity                        | `nominal`, `degraded`, `critical`                                                                                     |
| Freshness, derived by the server sweep | `LIVE`, `STALE`, `UNREACHABLE`, `UNKNOWN` — arrives as a field on the envelope; the console never computes it (ADR 3) |
| Envelope metadata                      | adapter version, sequence, vendor timestamp, received timestamp, schema version                                       |
| Declared capabilities, operator        | `dock`, `lidarHealth`, `waterLevel`, and others by vendor — the set that earns a panel in § 3                         |
| Declared capabilities, diagnostic      | `sequence` — declared like a capability, rendered under Diagnostics on the technician surface only (ADR 19)           |
| Raw payload                            | Served only on `GET /api/robots/:id` as a separate field. Never in `GET /api/fleet` and never in the delta stream.    |

Vendor A and Vendor B declare `dock` and `lidarHealth`. Vendor C declares `dock` and `waterLevel` and omits `lidarHealth`. That difference is the demonstration.

---

## 1. App shell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [wordmark from config]      Fleet    [tenant]              [● Connected]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Reconnecting to stream · attempt 2 · last event 09:41:02Z     [Retry now]    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                         [ page content ]                                     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Wordmark, accent and feature flags all come from `config`. Switching tenant changes the name, the theme and the available panels together.
- The banner's message appears only on integrity loss. The banner element itself is mounted in every state, empty and zero-height when connected, because a live region has to exist in the accessibility tree before its content changes for the change to be announced (component spec 07 § 4).
- `Retry now` forces an immediate attempt and increments the visible attempt counter. A control that does nothing is the same lie this project argues against.

---

## 2. Fleet view

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Fleet overview                                                               │
│                                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────────┐  ┌─────────┐                      │
│  │   44    │  │    4    │  │      2      │  │    0    │                      │
│  │  Live   │  │  Stale  │  │ Unreachable │  │ Unknown │                      │
│  │ of 50   │  │         │  │             │  │         │                      │
│  └─────────┘  └─────────┘  └─────────────┘  └─────────┘                      │
│                                                                              │
│  Site [ All ▾ ] Vendor [ All ▾ ] Reporting status [ All ▾ ] Search [_____]   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────┐│
│  │ ROBOT   VENDOR  STATUS            REPORTING STAT. SITE    BATT  LAST SEEN││
│  ├──────────────────────────────────────────────────────────────────────────┤│
│  │ R-118   A       ● Busy            ● Live         Zone A   91%  09:41:18Z ││
│  │ R-055   B       ● Charging        ● Live         Dock A3  34%  09:40:55Z ││
│  │ R-301   C       ● Fault           ● Live         Zone C   12%  09:39:01Z ││
│  │ R-204   A       ○ Busy (last known) ● Stale      Zone B   67%  09:41:22Z ││
│  │ R-087   B       ○ Idle (last known) ● Unreach.   Zone B    —   09:12:04Z ││
│  │ … rows …                                                                 ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│  Fleet snapshot · live · 2026-08-18T09:41:30Z · source: fleet-api            │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations**

- The summary strip counts freshness only. The four states are mutually exclusive and total the fleet exactly, which the previous status-and-freshness mixture did not.
- Status distribution is reachable through the table filters and is not duplicated as counts.
- The vendor column exists because normalization is the second sentence of the thesis and the primary surface would otherwise never mention a vendor. Filtering to Vendor C is the first move in the demo script.
- Filled dot means the value is current. Hollow dot plus `(last known)` means freshness is not LIVE. A reader scanning the status column alone is not misled.
- An unreachable robot shows no battery value, because the last reading is not a current reading and an em dash is honest where a number is not.
- Row click opens robot detail.

**Filtered empty**

```
│  Site [ Zone C ▾ ]  Vendor [ All ▾ ]  Search [xyz]                           │
│                                                                              │
│         No robots match these filters                                        │
│         Clear filters or change site                                         │
│                        [ Clear filters ]                                     │
```

---

## 3. Robot detail — Operator (default), Vendor A

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Fleet     R-204                                                            │
│             ○ Busy (last known)   ● Stale · as of 09:41:22Z (18s ago)        │
│             Zone B · Vendor A · Model X                                      │
│                                                    [ Operator | Technician ] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  01 — Summary                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Battery        67%                                                    │  │
│  │  Position       x 120.4 m · y 88.1 m · frame: site-map                 │  │
│  │  Status         Busy (last known)                                      │  │
│  │  Health         Degraded · localization drift                          │  │
│  │  Connectivity   Last reported 09:41:22Z                                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  02 — Capabilities                                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐                          │
│  │ Dock                 │  │ Lidar health         │                          │
│  │ Undocked             │  │ Drift detected       │                          │
│  │ Last dock 08:55:10Z  │  │ 2 warnings           │                          │
│  └──────────────────────┘  └──────────────────────┘                          │
│                                                                              │
│  Robot R-204 · adapter A@1.2 · seq 18441 · received 09:41:22Z                │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations**

- Section 01 carries core fields only, and renders identically for every robot from every vendor.
- Section 02 renders the robot's declared **operator** capabilities only — the set `@fleet/contracts` classifies that way in `CAPABILITY_KINDS` (ADR 19), not every non-core key. `sequence` is declared but diagnostic, so it appears in § 5's Diagnostics and never here. This is the section that differs by vendor, which is the whole demonstration.
- Health is its own field rather than a qualifier appended to status, because health severity and vendor status are separate facts in the envelope.
- Position is map-frame with the frame named, matching the raw payload the technician view shows. Indoor service robots do not report geodetic coordinates.
- No command controls. A button reporting success it cannot verify is the exact failure this project argues against.

---

## 4. Robot detail — Operator, Vendor C, for contrast

```
│  Zone C · Vendor C · Model Z                                                 │
│                                                                              │
│  02 — Capabilities                                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐                          │
│  │ Dock                 │  │ Water level          │                          │
│  │ Docked               │  │ 41%                  │                          │
│  └──────────────────────┘  └──────────────────────┘                          │
│                                                                              │
│  (No lidar health panel — not in this robot's capability set)                │
```

Vendor C declares `waterLevel`, which A and B do not, and omits `lidarHealth`, which they do. Absence is the interface; there is no disabled placeholder. Open these two robots side by side in the demo.

---

## 5. Robot detail — Technician

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Fleet     R-204                                                            │
│             ○ Busy (last known)   ● Stale · as of 09:41:22Z                  │
│             Zone B · Vendor A · Model X                                      │
│                                                    [ Operator | Technician ] │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  01 — Summary                     (same block as operator, unchanged)        │
│                                                                              │
│  02 — Capabilities                (same panels as operator, unchanged)       │
│                                                                              │
│  03 — Diagnostics                                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Adapter                A@1.2                                          │  │
│  │  Sequence               18441                                          │  │
│  │  Sequence gaps          2 since start                                  │  │
│  │  Vendor timestamp       2026-08-18T09:41:20.112Z                       │  │
│  │  Received               2026-08-18T09:41:22.041Z                       │  │
│  │  Clock delta            −1.929s                                        │  │
│  │  Schema version         1                                              │  │
│  │  Unknown fields         adapter A: 0 (fleet-wide)                      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  04 — Raw payload                                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  {                                                                     │  │
│  │    "battery": 0.67,                                                    │  │
│  │    "pose": { "x": 120.4, "y": 88.1, "frame": "site-map" },             │  │
│  │    "status": "busy",                                                   │  │
│  │    ...                                                                 │  │
│  │  }                                                                     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Robot R-204 · adapter A@1.2 · seq 18441 · received 09:41:22Z                │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations**

- Technician content is additive. Same shell, same header, same first two sections, no second layout and no second route.
- Sequence gaps are a per-robot total since start, which the idempotent upsert path already knows. A rolling window would require server state that does not exist.
- Unknown fields are counted per adapter on the health endpoint and are labelled fleet-wide here, because no per-robot counter exists. Change the label or add the counter, not neither.
- Clock delta is the difference between the two timestamps, which is what justifies carrying both and what the `--clock-skew` fault flag exercises.
- The raw payload arrives only on `GET /api/robots/:id`, in a field the fleet read model and the delta stream both exclude.

---

## 6. Connection states

**Connecting** (first connection; nothing has ever been received, so no last-event fragment)

```
│ Connecting to stream · attempt 2                              [Retry now]    │
```

**Reconnecting**

```
│ Reconnecting to stream · attempt 2 · last event 09:41:02Z     [Retry now]    │
```

**Disconnected**

```
│ Stream disconnected · showing last known state (may be stale) [Retry now]    │
```

**Disconnected — initial probe exhausted** (three attempts, socket never opened; ADR 31)

```
│ Unable to connect to stream after 3 attempts                  [Retry now]    │
```

**Disconnected — stream integrity error** (snapshot and stream from different server runtimes; ADR 31)

```
│ Stream integrity error · showing last known state (may be stale) [Retry now] │
```

The table stays visible with last-known data, and per-robot freshness labels are **suppressed** — the banner carries the connection-level truth instead. Freshness is derived by a server sweep and delivered over the stream (ADR 3), so a dead socket means the console has no current per-robot answer and must not display one. A row still reading LIVE from a socket that died two minutes ago is the exact failure this project argues against, and a row reading UNREACHABLE is no better: it blames the machine for the console's own blindness.

Status chips take the last-known treatment, battery values go to em dash, and the banner states what the operator can and cannot trust. The banner is not adjacent chrome here; it is the only surface still making a true statement about currency.

---

## 7. Map

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Map                                                                          │
│                                                                              │
│  Site  [ North site ]   South site    East site                              │
│                                                                              │
│  Positions · North site                                                      │
│  5 of 6 robots positioned                                                    │
│                                                                              │
│  ┌────────────────────────────────────────────────┐  ┌─────────────────────┐ │
│  │        ● R-118                                 │  │ Robots              │ │
│  │                      ○ R-204                   │  │ R-118  Busy    Live │ │
│  │   ● R-301                        ● R-055       │  │ R-204  Busy   Stale │ │
│  │                                                │  │ R-301  Fault   Live │ │
│  │              ○ R-087                           │  │ R-055  Charging Live│ │
│  │                                                │  │ R-087  Idle Unreach.│ │
│  │  derived site frame · metres · no floor plan   │  │ No position         │ │
│  └────────────────────────────────────────────────┘  │ R-142  Unknown    — │ │
│  ● filled = Live   ○ hollow = not Live               └─────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations**

- One site at a time. Position frames are per-site and mutually incomparable, so a shared canvas would superimpose unrelated maps (ADR 35). The site toggle's options and labels come from the snapshot directory (ADR 34); the first entry is the default.
- Marker colour encodes canonical status through the status tokens; marker fill encodes freshness: filled when LIVE, hollow in every other state. The legend and the side list carry the same facts as text, so colour never stands alone (Principle 6).
- The canvas is a single labelled image, not an interactive surface. The side list is the activation path — each robot id links to its detail page, one path per robot, the same rule the fleet table enforces. Marker id labels are sketch shorthand; identity lives in the list.
- The bounds are derived from observed positions, padded, and only widen within a session (ADR 35). The caption says the frame is derived — this surface claims relative geometry, never architecture.
- "5 of 6 robots positioned": a robot that has never reported has no position. It is counted, and listed under "No position" with an em dash, never silently absent.
- Stream disconnected: the heading becomes "Positions · North site · last known", every marker goes hollow, and per-robot freshness text is suppressed in the list. The connection banner remains the single announcing authority (ADR 3, component spec 07).
- Narrow screens stack in reading order: site toggle, summary, canvas, list.

---

## 8. View inventory

| View                                           | Required | Notes                                                |
| ---------------------------------------------- | -------- | ---------------------------------------------------- |
| Shell, wordmark from config, connection banner | Yes      | Thursday                                             |
| Fleet summary, filters including vendor, table | Yes      | Core deliverable                                     |
| Filtered empty state                           | Yes      | `EmptyState`                                         |
| Robot detail, operator, two vendors            | Yes      | The capability contrast is the point                 |
| Robot detail, technician                       | Yes      | Toggle, same layout                                  |
| Disconnected and reconnecting                  | Yes      | Banner carries currency; per-robot labels suppressed |
| Map                                            | Yes      | Scheduled — page spec 04, ADR 35                     |

---

## 9. Demo script

1. Open the fleet at fifty robots. Everything LIVE.
2. Filter to Vendor C, open a robot, note the water-level panel and the absent lidar panel. Filter to Vendor A, open a robot, note the reverse.
3. Run the simulator with `--drop` against three robots.
4. Watch those rows pass through STALE to UNREACHABLE on the server sweep, status chips going hollow and battery values going to em dash, while nothing else changes. The stream is healthy throughout — this is the console reporting silence, not the console losing its connection.
5. Kill the stream. The banner appears, the table stays with last-known data, and per-robot freshness labels are suppressed: with no live connection the console has no current answer per robot and says so at the connection level instead of guessing at the row level (ADR 3).
6. Restore. Labels return and rows resume degrading on the sweep, without a page reload.

Steps two and four are the submission. Everything else is context. Steps four and five are deliberately different failures: four is a robot going silent, five is the console going blind, and the console distinguishes them because freshness is derived where the robots are seen rather than where the page is rendered.
