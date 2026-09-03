# Fleet Console: Presenter’s Project and UI Guide

This is the architectural companion to [DEMO.md](./DEMO.md). The demonstration guide
tells you what to do; this guide explains what the system is doing, why the UI behaves as
it does, and which choices an audience may reasonably challenge.

The document is deliberately written in two passes:

1. **Pass 1 — the high-level mental model:** enough context to present the application
   confidently without knowing the repository.
2. **Pass 2 — the detailed model:** the package boundaries, data flow, UI layers, state
   machines, routes, components, failure behavior, evidence, and architectural trade-offs.

This is an explanatory document, not a new source of architectural authority. If it
conflicts with `PRINCIPLES.md`, an ADR, or a page or package specification, the governing
document wins.

---

# Pass 1 — High-level mental model

## 1. What this application is

Fleet Console is a real-time operations console for robots supplied by several vendors.
The vendors send different payload shapes, units, timestamps, status vocabularies, and
capabilities. The application translates those differences into one trustworthy fleet
view without pretending every robot is identical.

The product makes two central claims:

1. **The UI never presents stale observations as current.** The server determines whether
   each robot is Live, Stale, Unreachable, or Unknown. The browser displays that answer;
   it does not run a competing freshness timer.
2. **Shared meaning is normalized, while real vendor differences remain visible as
   capabilities.** All robots fit the same fleet table, but robot detail shows only the
   capability panels that a robot actually declares.

The UI is the primary deliverable. The other packages exist to make its claims reliable:
contracts define meaning, adapters normalize vendor data, the simulator creates realistic
input and failures, and the server owns current state and stream integrity.

## 2. What an operator sees

The application has three production routes and one development-only route.

| Route         | Surface                             | Main question it answers                                     |
| ------------- | ----------------------------------- | ------------------------------------------------------------ |
| `/`           | Fleet overview                      | Which robots need attention, and how current is that answer? |
| `/map`        | Site map                            | Where are one site’s robots relative to one another?         |
| `/robots/:id` | Robot detail                        | What is known about this robot, and what can it report?      |
| `/dev/ui`     | Component gallery, development only | How do the shared UI states look in isolation?               |

Every production route sits inside the same app shell:

- tenant wordmark and theme;
- Fleet and Map navigation;
- a visible stream connection indicator;
- an always-mounted connection banner;
- a skip link and one main landmark;
- the active page.

The shell reports the console’s connection to the server. Individual pages report robot
state. Those facts are related, but they are intentionally not the same fact.

## 3. The system in one diagram

```text
Raw Vendor A/B/C telemetry
            │
            │  HTTP POST /api/telemetry/:vendor
            ▼
┌────────────────────────── Server process ──────────────────────────┐
│  size guard → vendor adapter → canonical envelope → state store    │
│                                  │                  │              │
│                                  │                  ├─ history     │
│                         freshness sweep             ├─ diagnostics │
│                                  │                  └─ health data │
│                                  ▼                                 │
│                         coalesced delta fan-out                    │
└───────────────────┬───────────────────────┬────────────────────────┘
                    │                       │
          GET /api/fleet                    │ WebSocket /ws
          initial snapshot                  │ changed robots
                    └───────────┬───────────┘
                                ▼
┌────────────────────────── Browser console ─────────────────────────┐
│ decode boundary → normalized store keyed by robot id               │
│                         │                                          │
│                 entity selectors                                   │
│            ┌────────────┼────────────┐                             │
│            ▼            ▼            ▼                             │
│       Fleet page    Map page    Robot detail                       │
└────────────────────────────────────────────────────────────────────┘
```

The important direction is left to right. Vendor payloads stop at the adapter boundary.
React components never see or decode a Vendor A, B, or C payload.

## 4. The five packages

| Package            | Plain-language role                                                                                               | Why the UI depends on it                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `@fleet/contracts` | Defines canonical schemas, capabilities, freshness states, errors, snapshots, stream batches, health, and history | Gives every browser boundary one runtime-decodable vocabulary          |
| `@fleet/adapters`  | Converts each vendor’s raw wire format into the canonical model                                                   | Keeps vendor conditionals out of the UI                                |
| `@fleet/simulator` | Generates deterministic robots, vendor payloads, faults, fixtures, manifests, and load                            | Makes normal operation and failure paths reproducible                  |
| `@fleet/server`    | Owns ingest, current state, freshness, history, diagnostics, HTTP reads, and WebSocket fan-out                    | Supplies the browser with qualified state rather than raw observations |
| `web`              | React, MUI, routing, transport, read models, selectors, and pages                                                 | Presents the operational product                                       |

The production dependency direction is intentionally narrow:

```text
@fleet/contracts
    ▲    ▲    ▲
    │    │    └───── web
    │    └── @fleet/adapters
    │              ▲
    │              │
    └─── @fleet/server

@fleet/simulator ── HTTP only ──► @fleet/server
```

The simulator does not share production code with the server. That independence keeps the
test producer from accidentally proving itself against the same implementation it is
supposed to test.

## 5. Three different state vocabularies

The easiest way to misunderstand the UI is to collapse its state models. Keep these three
vocabularies separate while presenting.

### Robot freshness — a server-owned fact

| State         | Meaning                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `Unknown`     | The manifest registers the robot, but this server process has never received telemetry from it |
| `Live`        | The last server receipt is no more than 2 seconds old                                          |
| `Stale`       | The last receipt is more than 2 seconds and no more than 10 seconds old                        |
| `Unreachable` | The last receipt is more than 10 seconds old                                                   |

The server checks these thresholds every 500 ms. It uses its own `receivedAt` timestamp,
not the vendor’s clock.

### Stream connection — a browser-owned fact

| State          | Meaning                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------- |
| `Connecting`   | The initial join is in progress                                                              |
| `Connected`    | A socket and snapshot have joined successfully                                               |
| `Reconnecting` | A previously usable stream is being recovered                                                |
| `Disconnected` | Automatic recovery stopped for a named terminal cause; manual retry is available when useful |

When the stream is not connected, the UI suppresses per-robot freshness labels. The
browser cannot make a current claim about a robot from a dead stream, so the connection
banner becomes the single authority and retained data is labelled last known.

### Resource state — an entity-owned UI fact

Fleet data separately moves through `loading`, `ready`, `refreshing`, recoverable error,
and terminal contract error. A network failure can retain rows and offer Retry; malformed
bytes are terminal because retrying the same bytes will not repair their contract.

This separation is why the UI can say all of the following without contradiction:

- “The stream is connected, but R-007 is Unreachable.”
- “The stream is reconnecting; these rows are last known.”
- “The server restarted, so R-007 is Unknown to this new process.”

## 6. The three vendor dialects

“Wire format” means the structure and conventions of the data a vendor sends over the
network before the application normalizes it.

| Difference               | Vendor A           | Vendor B           | Vendor C                     |
| ------------------------ | ------------------ | ------------------ | ---------------------------- |
| Payload shape            | Nested             | Flat               | Nested                       |
| Battery                  | Fraction from 0–1  | Integer percentage | Fraction from 0–1            |
| Position                 | Metres             | Centimetres        | Metres                       |
| Timestamp                | ISO 8601           | Epoch milliseconds | ISO 8601                     |
| Status                   | Text values        | Numeric codes      | Text values                  |
| Sequence counter         | Present            | Absent             | Present                      |
| Operator capabilities    | Dock, lidar health | Dock               | Dock, water level            |
| Deliberate unknown field | None               | None               | `telemetry.firmware_channel` |

Adapters turn the shared concepts into one core: connectivity, battery, position, status,
and health. They preserve non-shared concepts as declared capabilities. The frontend
therefore asks “does this robot declare lidar health?” rather than “is this Vendor A?”

## 7. The seven-act demo as an architecture story

| Act                          | Visible behavior                                                         | Architectural point                                                    |
| ---------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| 1. Cold start                | 50 registered rows are Unknown while the stream is connected             | Registration is not observation; Unknown is honest state               |
| 2. Live fleet                | Three vendors appear in one table and filters remain usable              | Adapters normalize shared meaning before it reaches React              |
| 3. Robot detail              | Capability panels differ; Technician reveals diagnostics and history     | Capability declarations, persona separation, and fetch-on-visit detail |
| 4. Three robots go silent    | Three rows move Live → Stale → Unreachable; stream stays connected       | Silence is detected by the recurring server sweep                      |
| 5. Server stops              | Banner reconnects, row freshness disappears, last-known rows remain      | Console blindness is not misreported as robot failure                  |
| 6. Server returns            | UI rejoins without reload; unseen robots begin Unknown, then become Live | Session-aware automatic recovery and snapshot replacement              |
| 7. Optional scale and tenant | 500-robot workload; two differently branded builds                       | Measured scale, typed deployment configuration, no tenant branches     |

Acts 4 and 5 are the core of the presentation. Act 4 is knowledge about silent robots.
Act 5 is loss of the ability to know. The UI must render them differently.

## 8. The high-level decisions worth defending

An audience is most likely to challenge these choices:

- freshness is computed only on the server;
- a canonical core is paired with declared capabilities rather than a universal nullable
  schema;
- initial state is an HTTP snapshot while updates are WebSocket deltas;
- the fleet table is semantic and deliberately not virtualized at the measured workload;
- robot history is fetched only on visiting detail and is served as a fixed, decimated
  minute;
- map bounds are derived from observed positions and show one site at a time;
- tenant configuration is selected and validated at build time;
- raw vendor payload is diagnostic-only, bounded, exact, unredacted, and currently
  unauthenticated;
- there is no database, broker, command system, or floor-plan model in this demonstration.

Pass 2 gives the rationale, cost, evidence, and revisit trigger for each decision.

### Agentic coding in one minute

This repository is designed to be changed by coding agents without making architectural
judgment implicit or disposable. An agent does not begin by scanning the entire tree and
inventing a locally convenient solution. It follows a governed path:

1. find the single document that owns the question;
2. check the binding principles and existing ADR before choosing an implementation;
3. stop and surface a conflict instead of working around it;
4. decide whether the change is local implementation or a durable architectural choice;
5. use a plan to sequence work and an ADR to ratify architecture—never the reverse;
6. implement the smallest focused change, preferably test-first;
7. synchronize code, specifications, operational docs, TODOs, and decision records;
8. claim completion only from evidence produced by the change.

The result is not “the agent is trusted to remember the architecture.” The architecture is
searchable, routed, mechanically checked, and reviewable by a person after the agent has
finished.

---

# Pass 2 — Detailed model

## 9. Runtime topology and startup

`pnpm dev` starts the server, simulator, and web console together. The guided demo script
starts them separately so it can control cold start, dropped robots, server loss, restart,
scale, and a second tenant build.

The default runtime is:

| Concern           | Default                            |
| ----------------- | ---------------------------------- |
| Server            | `127.0.0.1:8080`                   |
| Console           | `http://localhost:5173`            |
| API base path     | `/api`                             |
| WebSocket path    | `/ws`                              |
| Fleet             | 50 robots, `R-001` through `R-050` |
| Sites             | North, South, East                 |
| Simulator cadence | 1 reading per robot per second     |
| Freshness sweep   | Every 500 ms                       |
| Live threshold    | 2 seconds, inclusive               |
| Stale threshold   | 10 seconds, inclusive              |
| Fan-out cadence   | Up to 10 frames per second         |

Vite proxies `/api` and `/ws` to the server in development. The browser uses same-origin
paths, so components never contain a server host. A split-origin deployment is possible,
but it must configure the server’s exact origin allow-list and add coverage for accepted
and rejected cross-origin traffic.

## 10. End-to-end telemetry flow

### 10.1 The simulator creates raw vendor input

The simulator owns deterministic fleet creation and vendor-specific payload construction.
Each simulated robot has stable identity, site, vendor, model, and evolving telemetry. Its
CLI controls robot count, per-robot frequency, endpoint, random seed, dropped IDs, and
manifest generation.

The normal demo emits 50 robots at 1 Hz. The documented load profile emits 500 robots at
5 Hz, which is approximately 2,500 HTTP requests per second. That is a verified workload,
not a claimed architectural ceiling.

`--drop R-007,R-023,R-041` does not send a special “offline” message. It sends nothing for
those robots. That makes the freshness behavior real: the server must notice absence.

### 10.2 HTTP ingest protects the boundary

Each reading is sent to:

```text
POST /api/telemetry/:vendor
```

The server processes it in a deliberate order:

1. Validate the vendor path before reading the request body.
2. Reject a declared or actual body larger than 64 KiB before JSON parsing and adapter
   work.
3. Parse JSON into `unknown`.
4. Stamp `receivedAt` from the server’s injected clock.
5. Dispatch to exactly one vendor adapter.
6. Decode and normalize; reject malformed input with canonical issue paths and codes.
7. Add initial server-owned freshness.
8. Apply ordering and identity rules in the current-state store.
9. Retain a deep copy of the latest accepted raw payload for diagnostics.
10. Mark an accepted robot as pending for delta fan-out.

Unsupported vendors, invalid JSON, malformed vendor payloads, oversized bodies, unknown
robots, manifest mismatches, duplicates, and regressive sequences are not silently
coerced into current state.

### 10.3 Adapters produce a pre-freshness envelope

An adapter is allowed to assert identity, provenance, normalized core values, and declared
capabilities. It is not allowed to assert freshness. The type it returns deliberately
lacks that field.

This split makes ownership structural:

```text
raw vendor payload
    │
    ▼
AdapterEnvelope              adapter-owned interpretation
    + freshness
    ▼
CanonicalEnvelope            server-qualified observation
```

The canonical envelope contains:

- schema version;
- robot, site, vendor, model, adapter identity, and adapter version;
- `reportedAt`, normalized from the vendor clock;
- `receivedAt`, stamped by the server clock;
- canonical core: connectivity, battery, position, status, and health;
- server-derived freshness;
- the declared capability record.

Raw payload is intentionally absent from this envelope, the fleet snapshot, and stream
batches.

### 10.4 The server store owns current observation

The server seeds one slot for every robot in `config/fleet-manifest.json`. Before a robot
reports, its slot is registered state rather than a fabricated envelope full of nulls.
That is how the fleet can contain 50 Unknown robots at cold start.

For observed robots, the store retains:

- the latest accepted canonical envelope;
- latest raw diagnostic payload, bounded by the ingest cap;
- sequence continuity evidence where the vendor supplies a counter;
- compact battery samples in a bounded ring buffer.

The store is in memory and process-local. Restarting the server clears observations,
diagnostics counters tied to process lifetime, and history. The manifest is re-seeded, so
identity survives while telemetry knowledge does not.

### 10.5 Freshness changes without new telemetry

Every 500 ms, the server iterates over observed robots and calls the pure freshness
function from `@fleet/contracts` with:

- the last `receivedAt`;
- the server clock’s current value;
- the validated 2-second and 10-second thresholds.

If freshness changes, the store replaces that field and marks the robot for fan-out. No
other observed field changes during a sweep.

This is the mechanism behind “silence is an event.” An arrival-only system cannot change
state after arrivals stop. A recurring sweep can.

The server also counts late sweep ticks. A delayed sweep is operationally important: if
the freshness mechanism stops running under load, the UI can freeze a robot in Live.

### 10.6 Fan-out sends bounded, whole-robot deltas

Each WebSocket client has a pending set keyed by robot ID. Repeated changes to one robot
before a flush overwrite that entry rather than growing a queue. At up to 10 Hz, the
server sends a batch containing the latest whole canonical envelope for each changed
robot.

Whole envelopes are deliberate. The browser can replace one keyed robot atomically; it
does not become a field-patch merge engine with partial-application states.

Each snapshot and batch carries:

- a `serverSessionId`, identifying the server process;
- a server-wide `flushSequence`, ordering snapshots and frames within that process;
- server timestamps describing when the snapshot or frame was produced.

## 11. Browser join, decoding, and recovery

### 11.1 The browser opens the socket before fetching the snapshot

Cold start and reconnect use the same sequence:

1. Open the WebSocket.
2. Buffer incoming decoded deltas.
3. Fetch `GET /api/fleet`.
4. Decode the snapshot through `@fleet/contracts`.
5. Compare server session and flush sequence.
6. Discard buffered same-session frames already covered by the snapshot.
7. Apply newer buffered frames.
8. Continue applying live frames.

Fetching the snapshot first would create a gap in which a delta can be emitted before the
socket is listening. The socket-first sequence closes that gap.

### 11.2 Restart recovery uses a server epoch

A restarted in-memory server begins its flush sequence at zero. Sequence numbers alone
cannot distinguish “new process, new zero” from old history. `serverSessionId` supplies
that epoch.

When the browser sees a new session, it discards the previous process’s reconciliation
history and replaces the store from the new snapshot. This is why recovery works without
a reload and why the newly restarted server can honestly show robots as Unknown.

### 11.3 Reconnection is automatic but controlled

The retry policy uses full-jitter exponential backoff with a 30-second ceiling. The
initial probe stops after three attempts if no successful join has ever occurred. After a
session has been usable, the client keeps trying to recover because a known server is
worth waiting for. Terminal contract or stream-integrity failures do not spin forever on
the same invalid input.

The retry timer and randomness are injectable, so unit tests can prove the schedule
without sleeping against wall-clock time.

### 11.4 Every inbound browser response is decoded

The browser decodes the fleet snapshot, delta frames, robot detail, adapter diagnostics,
error envelopes, and battery history at the transport boundary. Components receive
trusted read models, never `unknown` network objects.

Malformed snapshots produce a terminal resource state with issue paths and codes.
Malformed stream frames are dropped and counted for the console session; the count is
visible only in Technician diagnostics because it is an integration fact, not a robot
health fact.

## 12. UI architecture

### 12.1 Bootstrap and provider ownership

`src/main.tsx` performs only application bootstrap:

- applies the selected tenant theme before first paint;
- creates the MUI theme from the same tenant palette;
- installs the CSS token layers and fonts;
- mounts React Strict Mode and the browser router.

`AppRouter` owns the console’s one transport instance and one fleet store. It provides:

- `FleetStoreContext` for entity hooks;
- `StreamDiagnosticsContext` for the technician view;
- routes inside `AppShell`.

`AppShell` provides two stable, narrow contexts:

- tenant configuration, which does not change during a build’s lifetime;
- connection state, which changes during transport recovery.

They are separate because combining a low-churn deployment value with a reconnecting
value would cause unrelated consumers to re-render together.

### 12.2 Enforced layers

The web package uses feature-sliced layers:

```text
app         providers, router, shell, theme composition
  │
  ├──────────────► features   page composition and local view state
  │                    │
  ├──────────────► entities   read models, mapping, selectors, stores, hooks
  │                    │
  ├──────────────► shared/ui  domain-free presentational primitives
  │
  ├──────────────► shared/lib transport, contexts, time utilities
  │
  └──────────────► config     tenant data and validation
```

Key restrictions:

- one feature may not import another feature;
- entities contain no JSX or MUI;
- entities may not read tenant configuration;
- shared UI knows nothing about robots, vendors, sites, or capabilities;
- production web code may import `@fleet/contracts`, never server internals or adapters;
- the default boundary policy is deny, so an unclassified new layer is not silently
  permitted.

The lint configuration includes intentional legal and illegal fixtures. Tests run the
rules against those fixtures to prove the enforcement still fires.

### 12.3 Entity read models and selectors

`entities/robot/fromEnvelope.ts` is the one place a decoded canonical envelope becomes a
browser `Robot` or `RobotDetail`. It converts epoch timestamps to ISO strings, copies
server freshness, and keeps registration-only robots distinct from observed robots.

The entity layer owns pure presentation rules shared by pages:

| Selector responsibility | Rule                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Status presentation     | Combines status and health severity into chip appearance while keeping the status label intact    |
| Battery display         | Shows a number only while the robot is Live; otherwise an em dash                                 |
| Freshness summary       | Counts four mutually exclusive states over the whole fleet                                        |
| Site label              | Resolves IDs only from the snapshot’s site directory                                              |
| Capability visibility   | Selects declared operator capabilities after deployment flags are applied                         |
| Sequence evidence       | Distinguishes zero gaps from “Not evaluated”                                                      |
| Map projection          | Filters plottable robots, derives extents, projects coordinates, and determines marker appearance |

This keeps domain interpretation out of React render functions and gives it a cheap,
framework-independent test boundary.

### 12.4 The normalized fleet store

The browser store is a map keyed by robot ID. A snapshot replaces the full set; a batch
replaces only the robots it names. The store applies data immediately but coalesces
subscriber notifications onto a scheduled turn.

That distinction matters:

- delaying application would mean the console knowingly holds older state;
- scheduling notifications limits React wake-ups without inventing a second data queue;
- keyed replacement preserves object identity for unrelated robots;
- per-robot subscribers can skip updates that concern another robot.

`useSyncExternalStore` reads cached snapshots from this framework-independent store. A
fresh snapshot object on every read would cause an infinite render loop, so identity is a
correctness property as well as a performance detail.

## 13. App shell

The shell is intentionally operational rather than decorative.

| Element                 | Responsibility                                                  |
| ----------------------- | --------------------------------------------------------------- |
| Skip link               | First focusable control; moves keyboard focus to `#main`        |
| Wordmark                | Comes from the selected tenant profile and links to Fleet       |
| Navigation              | Fleet and Map only; robot detail is contextual navigation       |
| Header connection label | Compact persistent connection state                             |
| Connection banner       | Detailed, polite live-region message and Retry where applicable |
| Main outlet             | One route at a time inside one main landmark                    |

The banner remains mounted even when connected and visually empty. A live region that is
introduced at the same moment as its message is not announced consistently, so the
region’s lifetime is longer than the warning’s lifetime. Connection changes never steal
focus.

## 14. Fleet page

The fleet page is the operator’s dense scanning surface.

### Composition

1. One `h1`, “Fleet overview”.
2. Resource-state alert or loading treatment where applicable.
3. A fleet-wide freshness summary.
4. Site, vendor, reporting-status, and free-text filters.
5. An explicit empty state when no robots are registered or no robots match.
6. A semantic table.
7. A provenance footer naming snapshot and latest-frame times.

### Summary and filters answer different questions

The summary always counts the whole fleet. Filters narrow only the table. If the summary
changed with a search for one robot, the operator would lose fleet context while trying to
locate an item.

Site options come from the decoded site directory. Vendor options are derived from the
robots in the snapshot because vendor ID is an open contract value. Adding Vendor D must
not require adding it to a UI constant.

### Table semantics

The columns are Robot id, Vendor, Status, Reporting status, Site, Battery, and Last seen.

- Robot id is the only link and activation path in a row.
- Rows are not given click handlers or tab stops.
- Status and health severity determine chip treatment.
- Non-Live status chips are outlined and labelled “last known.”
- Battery is an em dash unless the observation is Live.
- Reporting-status text is suppressed whenever the stream is not connected.
- “Last seen” uses the vendor-reported time for operator provenance; it is not used to
  derive freshness.
- No row container is an `aria-live` region, so ten frames per second do not become a
  stream of screen-reader interruptions.

### Scale posture

The table renders one semantic row per robot and is deliberately not virtualized. The
current defensible statement is:

> The table is verified at 500 robots under the documented stream workload; that is not a
> claimed ceiling.

In production Chromium at 500 rows and ten frames per second, all measured frames applied
and delta-to-next-paint p95 was 53.7 ms. That evidence did not justify paying the
accessibility, bundle, DOM, and styling cost of virtualization. If measured churn later
exceeds the current behavior, MUI’s own grid is evaluated before a second component
system.

## 15. Map page

The map is spatial context, not navigation replacement or a floor plan.

### What it shows

- exactly one site at a time;
- a derived coordinate frame in metres;
- an inline SVG containing positioned robots;
- a visible legend;
- a side list with the accessible robot links;
- explicit accounting for robots that have no position.

Each site has an independent local coordinate frame. Plotting North and South together
would imply shared origin, scale, and adjacency that the data does not provide.

### Derived extents

For the selected site, pure entity selectors:

1. keep robots with a non-null position in that site;
2. compute a bounding box;
3. pad each axis by 10 percent;
4. enforce a 10-metre minimum span;
5. merge it with the session’s previous extents so the box only widens;
6. project positions into an SVG view box, including y-axis inversion.

The feature owns only the selected site and running per-site extents. Those are local view
state, not fleet facts. The caption explicitly says “derived site frame · metres · no
floor plan.”

### Marker and keyboard semantics

Marker color comes from canonical status. Fill expresses freshness: filled means Live
while connected; hollow means not Live or the console is offline. Text in the legend and
side list carries the same information, so color is never the only signal.

Markers are not interactive. The side list supplies one link per robot, avoiding two
focus targets for every machine. The SVG is one accessible image whose name includes the
site and “N of M robots positioned.”

## 16. Robot detail page

Robot detail combines a fetched diagnostic resource with live fleet reconciliation.

### Page structure

1. Back to Fleet, robot identity, status, freshness, site, vendor, and model.
2. Operator/Technician persona toggle.
3. Summary: battery, position, status, health, connectivity, and last seen.
4. Battery history.
5. Declared operator capability panels.
6. Technician-only diagnostics.
7. Technician-only raw payload.
8. Data provenance plate.

The page defaults to Operator. Technician is additive rather than a separate route or
role system.

### Multiple resources with different lifetimes

Opening a robot starts three related reads:

- robot detail from `GET /api/robots/:id`;
- adapter-wide diagnostics from `GET /api/health`, used only to decorate one technician
  field;
- battery history from `GET /api/robots/:id/history`.

Robot detail is the primary resource. Diagnostics failure leaves its one field unknown.
History failure degrades only the history section. Neither secondary failure blanks a
valid robot page.

Once fetched, the page subscribes to the fleet store for that robot ID. Live fleet rows
are overlaid onto the fetched detail, updating battery, status, position, health,
connectivity, freshness, and last seen. Diagnostics and raw payload remain the fetched
evidence and are not invented from stream data.

### Capability-driven rendering

Capability panels are selected from a typed registry keyed by operator capability name.
The current panels are:

| Capability   | Typical content            |
| ------------ | -------------------------- |
| Dock         | Dock relationship or state |
| Lidar health | Lidar health details       |
| Water level  | Water level details        |

Sequence is a declared diagnostic capability, not an operator panel. It appears in the
Technician diagnostics section.

A panel renders only when both are true:

1. the robot declares the capability;
2. the tenant’s typed configuration enables the panel.

No component checks the robot’s vendor or tenant name.

### Battery history

History is loaded only when a robot is opened. The fleet page therefore does not fetch a
minute of history for every visible robot.

The server retains compact `{receivedAt, batteryPercent | null}` samples for a fixed
60-second window, with capacity derived from the supported 50 Hz maximum. The endpoint
returns at most 60 points. Above that, extrema-preserving decimation keeps the first,
last, minimum, and maximum behavior needed to avoid hiding spikes and troughs.

The inline SVG sparkline uses a fixed 0–100% y-axis and a fixed one-minute x-axis. Visible
text and its accessible name state minimum, maximum, latest, window, and sample count.
Empty, battery-missing, and single-reading histories render distinct prose rather than a
misleading zero chart.

### Technician diagnostics and raw evidence

The diagnostics section can show:

- adapter ID and version;
- sequence value and continuity, or Not evaluated;
- vendor report and server receipt times;
- clock delta;
- schema version;
- adapter-wide unknown-field count;
- console-session rejected-frame count.

The scopes matter. An adapter-wide field is not labelled as robot-specific, and a
console-session count is not presented as machine health.

Raw payload comes only from the single-robot endpoint. It is bounded, copied, and shown
exactly as received. It is not redacted and the route is not access-controlled in this
demonstration. That notice is a security boundary, not incidental copy: authentication,
diagnostic permission, and audit are required before real deployment.

## 17. Shared UI components

`shared/ui` contains domain-free primitives. Features supply already-derived labels,
variants, and callbacks.

| Component          | Responsibility                                                 |
| ------------------ | -------------------------------------------------------------- |
| `StatusChip`       | Status appearance, current versus last-known outline treatment |
| `FreshnessLabel`   | Freshness word and optional as-of text                         |
| `SectionLabel`     | Visual section index; never substitutes for a real heading     |
| `DataPlate`        | Compact provenance or technical caption                        |
| `Stat`             | One labelled summary value with optional tone                  |
| `EmptyState`       | Deliberate empty or not-found content and optional action      |
| `ConnectionBanner` | Stream warning, terminal cause, and Retry behavior             |
| `PersonaToggle`    | Operator/Technician view switch                                |

These components do not import robot types. For example, `StatusChip` knows how to draw a
“fault” variant, but the entity selector decides that critical health should use it.

## 18. Tenant configuration and styling

The selected tenant profile carries identity, theme, endpoint paths, and flags together.
It is validated at build time. Unknown tenant IDs fail the build rather than silently
shipping the wrong customer’s brand.

| Profile  | Wordmark           | Theme | Lidar panel |
| -------- | ------------------ | ----- | ----------- |
| Tenant A | Fleet Console      | Dark  | Enabled     |
| Tenant B | Northwind Robotics | Light | Disabled    |

The theme is deployment policy, not a user preference. There is no theme toggle,
`localStorage` preference, or `prefers-color-scheme` branch.

MUI supplies components and theme integration. CSS custom properties supply semantic
tokens for color, spacing, typography, radii, and operational states. Raw visual literals
are restricted to the configuration and shared-primitive layers. A second styling system
would create another theme and accessibility surface to keep synchronized.

## 19. Complete user-visible state behavior

The UI treats asynchronous states as product behavior rather than edge cases.

| Condition                   | Fleet                                              | Map                                                       | Robot detail                      |
| --------------------------- | -------------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| Initial load                | Loading text and skeleton rows                     | Loading text and skeleton canvas                          | Header skeleton                   |
| Refresh                     | Retained rows and quiet refresh message            | Retained positions and quiet message                      | Values reconcile in place         |
| Empty roster                | “No robots registered”                             | “No robots registered”                                    | Not applicable                    |
| Empty filter/site content   | Designed filter empty state                        | No-position accounting                                    | Empty capability section omitted  |
| Registered, never observed  | Unknown row with no fabricated telemetry           | Listed under no position                                  | Registration facts only           |
| Stale robot                 | Last-known chip, no current battery                | Hollow marker and last-known row                          | Server-provided stale treatment   |
| Stream down                 | Rows retained, freshness hidden, summary qualified | Positions retained, all markers hollow, heading qualified | Values retained, freshness hidden |
| Recoverable request failure | Retained data and Retry                            | Retained data and Retry                                   | Page or history-section Retry     |
| Terminal contract failure   | Issue paths/codes; no false Retry                  | Same contract treatment                                   | Terminal message and route back   |
| Unknown robot route         | Not applicable                                     | Not applicable                                            | Deliberate not-found state        |

The guiding rule is simple: retain valid context, qualify its currency, and offer an action
only when that action can change the result.

## 20. Accessibility model

Accessibility is part of the architecture because real-time data can otherwise create an
unusable focus and announcement model.

The principal choices are:

- semantic headings and landmarks;
- a skip link first in focus order;
- one link per robot as the only activation path;
- a semantic fleet table;
- visible logical focus;
- status and freshness expressed in text, shape, and color rather than color alone;
- no focus movement when stream state or telemetry changes;
- one connection live region rather than row-level live regions;
- a visible side list as the map’s keyboard and screen-reader equivalent;
- textual summaries for charts and spatial counts;
- browser tests using accessible roles and names rather than CSS selectors.

Automation does not prove screen-reader output or subjective forced-colors quality. Those
remain manual verification responsibilities.

## 21. HTTP and WebSocket surfaces

| Surface                       | Consumer                     | Purpose                                            |
| ----------------------------- | ---------------------------- | -------------------------------------------------- |
| `POST /api/telemetry/:vendor` | Simulator or vendor producer | Raw ingest after vendor selection and size checks  |
| `GET /api/fleet`              | Browser transport            | Full snapshot for cold start and rejoin            |
| `GET /api/robots/:id`         | Robot detail                 | One robot plus diagnostic envelope and raw payload |
| `GET /api/robots/:id/history` | Battery history section      | Fixed-window, decimated compact history            |
| `GET /api/health`             | Diagnostics and operations   | Adapter unknown-field and process health counters  |
| `WS /ws`                      | Browser transport            | Coalesced canonical robot deltas                   |

The snapshot includes the site directory, registered or observed robots, capture time,
server session ID, and flush sequence. The stream never carries raw payload or history.

## 22. Package-by-package landmarks

### `packages/contracts`

Start at `src/index.ts`. The important modules are:

- `envelope/` — adapter envelope, canonical envelope, registered state, snapshot, batch,
  robot diagnostics, encoding, parsing, and reconciliation;
- `capabilities/` — capability names, payloads, operator/diagnostic classification;
- `freshness/` — the pure freshness function and policy schema;
- `errors/` — one issue and error vocabulary;
- `health/` — adapter and process diagnostics response;
- `history/` — fixed battery-history contract.

This package imports no other workspace package and is the bottom of the graph.

### `packages/adapters`

Start at `src/index.ts` and `src/registry.ts`.

- `core/` owns the adapter contract, units, time parsing, results, vendor vocabulary, and
  unknown-field ledger;
- `vendors/a`, `vendors/b`, and `vendors/c` each own a strict schema, adapter, tests,
  representative fixtures, boundary fixtures, and malformed fixtures;
- `testing/` exposes recorded fixtures through a narrow test-only subpath.

Adding a vendor should stay inside this package except for deployment roster data. Adding
a genuinely new capability begins in contracts, not in a component.

### `packages/simulator`

Start at `src/index.ts` and `src/app.ts`.

- `cli/` and `config/` decode command-line settings;
- `fleet/` creates and evolves deterministic robots;
- `vendors/` builds raw A/B/C payloads;
- `faults/` implements dropped-robot policy;
- `scheduling/` controls per-robot emission cadence;
- `transport/` posts to ingest;
- `recording/` regenerates adapter fixtures and manifests;
- `observability/` reports simulator counters.

Its production code imports no workspace package. The only connection to the application
is HTTP.

### `packages/server`

Start at `src/main.ts` and `src/runServer.ts`.

- `config/` validates manifest, freshness, host, port, and origin policy;
- `http/` mounts the five HTTP routes;
- `ingest/` owns the transport-independent ingest transition;
- `state/` owns current robot state and bounded rings;
- `freshness/` runs the recurring sweep;
- `fanout/` owns pending deltas and WebSocket delivery;
- `history/` selects and decimates the fixed window;
- `health/` joins counters;
- `observability/` emits structured logs.

`runServer.ts` is the composition root. It constructs one store, one adapter registry, one
health ledger, one session ID, one sweep, and one fan-out instance, then injects narrow
functions into the HTTP router.

### `packages/web`

Start at `src/main.tsx` and `src/app/appRouter.tsx`.

- `app/` owns bootstrap, the one transport, providers, routes, shell, and theme bridge;
- `features/fleet/` owns fleet composition and local filters;
- `features/map/` owns site selection, SVG composition, and robot list;
- `features/robot/` owns detail composition, persona, capabilities, history, and raw view;
- `entities/robot/` owns mapping, normalized state, selectors, and resource hooks;
- `entities/site/` owns site label selection;
- `shared/lib/` owns transport, decoding helpers, lifecycle, contexts, and formatting;
- `shared/ui/` owns domain-free primitives;
- `config/` owns typed tenant profiles and endpoint paths;
- `styles/` owns tokens and global presentation.

## 23. How agentic coding is governed

The repository treats agentic coding as a controlled engineering workflow, not as an
unstructured code-generation step. The goal is to let an agent act autonomously inside an
accepted boundary while keeping durable choices explicit, implementation evidence honest,
and documentation useful to the next agent and to human reviewers.

### 23.1 Authority hierarchy

An agent must know which document is allowed to answer which question. Reading a nearby
file is not enough if that file has lower authority than the decision being changed.

| Authority                                   | What it owns                                                                           | What it must not do                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `PRINCIPLES.md`                             | Fifteen binding engineering principles and non-negotiable safety rules                 | Be bypassed by an ADR, plan, specification, or local implementation              |
| Numbered ADRs in `docs/00_adr/`             | Durable architectural positions and their arguments                                    | Become status notes, implementation plans, or duplicated rationale in other docs |
| Page, component, and package specifications | Current behavior, public contracts, responsibilities, states, and consequences of ADRs | Reverse an ADR or repeat its full argument                                       |
| Root and path-scoped `AGENTS.md`            | How an agent works in the repository or package, including routing and verification    | Override a principle or ADR                                                      |
| `docs/DOCUMENT_LIFECYCLES.md`               | The process by which decisions and plans change state                                  | Ratify a product or architecture choice itself                                   |
| Active plans in `docs/05_plans/`            | Work sequence, scope, acceptance criteria, and evidence still needed                   | Ratify architecture or remain active after their content is consumed             |
| `TODO.md` and package TODOs                 | Planning-only queues and known gaps                                                    | Describe intended work as current implementation                                 |
| README files                                | Supported operation, entry points, and current user/developer instructions             | Become the normative source for an architectural choice already owned by an ADR  |
| Audits and `docs/04_archive/`               | Historical evidence and superseded work                                                | Be treated as present truth                                                      |
| Code and tests                              | Current implementation and executable evidence                                         | Quietly contradict the governing documents                                       |

`PRINCIPLES.md` wins whenever authorities disagree. A numbered ADR is the sole normative
decision record. Documentation is authoritative over code, so a mismatch is surfaced and
corrected rather than rationalized from whatever the current implementation happens to do.

### 23.2 Search-first context loading

The root `AGENTS.md` contains a routing table because loading too much context can be as
dangerous as loading too little. An agent follows the first matching route and narrows
from an index to one owner:

```text
task term
  → search for an existing plan or registered decision
  → family index, such as 00_PAGE_SPECS or 00_PACKAGE_SPECS
  → one owning ADR/specification
  → affected package AGENTS.md
  → public package entry point
  → smallest relevant implementation path
```

The agent searches before reading, does not preload whole documentation or source
directories, and does not paste large governing documents into its working context. It
quotes only the smallest span that decides the change.

This routing discipline has three purposes:

- it prevents a stale TODO or historical audit from outranking current authority;
- it reduces the chance that several similar modules are mistaken for multiple owners;
- it makes the agent’s reasoning reproducible—another reader can follow the same route
  and reach the same governing decision.

### 23.3 When an agent must stop

Autonomy applies only inside the accepted architecture. An agent stops and surfaces the
conflict when:

- the requested outcome violates a principle or active ADR;
- two governing documents prescribe incompatible behavior;
- the work needs a durable choice that has not been decided;
- a package or layer cannot legally own the proposed behavior;
- completion requires new authority, external coordination, or a materially wider scope;
- an apparently local shortcut would create a second source of domain truth;
- a security, authorization, freshness, accessibility, or data-integrity guarantee would
  be weakened to make implementation easier.

It does not hide the conflict behind a feature flag, lint suppression, type assertion,
duplicate helper, client-side fallback, or undocumented exception.

### 23.4 The decision-making algorithm

Durable decisions follow the repository process in
`docs/DOCUMENT_LIFECYCLES.md`. In practical terms, an agent works through this sequence:

1. **Read the principles.** If the proposed outcome conflicts with a non-negotiable rule,
   stop before designing around it.
2. **Search `docs/decisions.json`.** Reuse the existing D-id and inspect only its mapped
   ADR when the question is already registered.
3. **Decide whether an ADR is warranted.** Local implementation detail, status reporting,
   and easily reversible choices do not receive ADRs. Durable architecture, public
   contracts, dependencies, mechanical enforcement, and cross-package ownership do.
4. **Register an unresolved question honestly.** If evidence or authority is still
   missing, add the next contiguous D-id with `adr: null` and a concrete `next` event. Do
   not reserve an ADR number or pretend a preferred option is decided.
5. **Decide when the evidence is available.** Allocate the next unused ADR number and
   record the issue, assumptions, constraints, viable positions, chosen position,
   argument, implications, open questions, and related authorities.
6. **Separate decision state from implementation state.** An ADR can be Decided while its
   implementation is Not started or Partial. Writing the ADR does not make it Implemented.
7. **Map and enforce the decision.** Route the D-id to the ADR, remove its `next`, and put
   mechanically recognizable consequences into code, lint, runtime validation, or tests.
8. **Synchronize current-truth documents.** Specifications receive consequences, TODOs
   receive remaining work, and READMEs receive supported operation. Those documents link
   to the ADR instead of copying its rationale or status.
9. **Verify and record evidence.** Regenerate the decision index, run architecture checks,
   run affected code checks, and add dated observed consequences when operation produces
   a material result.
10. **Resolve remaining questions.** Close them from evidence or promote each durable
    unresolved question to its own D-id with an observable resolution event.

The decision record is therefore an argument among viable positions, not a post-hoc note
that says “we used this library” or “the code now works.”

### 23.5 Amending and superseding decisions

Agents preserve architectural history.

- Amend an existing ADR to clarify it, record evidence, close an anticipated question, or
  refine consequences without changing the selected position.
- Create a replacement ADR when the selected position changes or two active records would
  otherwise conflict.
- Mark the old ADR Superseded, name the replacement, keep its historical text, and route
  the owning D-id to the new record.
- Never delete an ADR, reuse its number, or leave two active normative answers to one
  question.
- Update mechanical enforcement and its decision registration in the same change; remove
  the old enforcement only after replacement evidence passes.

This makes a reversal visible as a reversal. An agent cannot rewrite history to make the
new implementation appear to have been the plan all along.

### 23.6 Plans sequence work but do not make decisions

An agent searches `docs/05_plans/` before creating a plan. If one plan already owns the
work, it updates that plan rather than creating a competing roadmap.

Every active planning document declares `Authority: Planning only`, a status, and an
updated date. The permitted non-terminal states are:

| Plan state         | Meaning                                                               | Required metadata      |
| ------------------ | --------------------------------------------------------------------- | ---------------------- |
| `Active`           | Accepted and executable now                                           | No trigger or blocker  |
| `Blocked`          | Accepted but unable to progress after safe alternatives are exhausted | One concrete `Blocker` |
| `Trigger-deferred` | Deliberately out of scope until an observable event occurs            | One concrete `Trigger` |

A plan records one measurable outcome, scope and exclusions, ordering, dependencies,
acceptance criteria, documentation synchronization, and the narrowest verification
commands. Recommendations and reserved identifiers in a plan are hints that must be
revalidated before implementation; a plan cannot waive a principle or ratify an ADR.

When a trigger fires or blocker clears, the agent revalidates the entire plan against
current authority before setting it Active. When work completes, the plan leaves the
active directory and moves to `docs/04_archive/` only after its durable content has been
consumed by code, ADRs, specifications, or explicit follow-up plans. Plans are not deleted
merely because they became stale.

### 23.7 Documentation has distinct owners

The repository avoids one giant design document by assigning each kind of statement an
owner:

| If the statement answers…                                                 | It belongs in…                                           |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| “Why did we choose this durable position over the alternatives?”          | A numbered ADR                                           |
| “What does this route do in every user-visible state?”                    | A page specification                                     |
| “What are this primitive’s props, semantics, and accessibility contract?” | A component specification                                |
| “What does this package own, export, consume, and enforce?”               | A package specification                                  |
| “How do I run or operate what is supported now?”                          | README documentation                                     |
| “How should an agent work in this directory?”                             | The scoped `AGENTS.md`                                   |
| “What work remains and in what order?”                                    | A TODO or active plan                                    |
| “What happened historically?”                                             | An audit or archived plan                                |
| “Which D-id maps to which ADR?”                                           | `docs/decisions.json`                                    |
| “What is the generated decision-status view?”                             | `docs/PENDING_ARCHITECTURE_DECISIONS.md`, generated only |

The generated pending-decision index is never edited by hand. `pnpm docs:decisions`
regenerates it from ADR metadata and `docs/decisions.json`.

### 23.8 Mechanical rules must point back to decisions

If a rule can be recognized mechanically, the agent does not leave it as prose-only
guidance. It implements the rule with the narrowest suitable mechanism:

- static analysis for imports, layering, unsafe syntax, or token usage;
- types for invalid internal state combinations;
- runtime decoding for untrusted boundaries;
- unit, contract, component, browser, or process tests for behavior;
- review only where context cannot be automated reliably.

Every mechanical rule cites its owning ADR in a nearby comment and registers the enforcing
file in `docs/decisions.json` under `mechanicalRules`. The repository tests enforcement
with deliberate violations and legal controls, so a misconfigured rule that reports
nothing does not appear healthy merely because the ordinary code passes.

`pnpm check:architecture-docs` verifies decision and plan metadata, D-id continuity,
resolved and open mappings, supersession links, generated output, authority markers,
mechanical citations, and state-specific trigger or blocker metadata.

### 23.9 Implementation workflow for an agent

Once authority and scope are settled, the expected execution loop is:

1. Inspect the package’s public entry point and best existing example in the same area.
2. Preserve unrelated user changes in the working tree and keep the diff focused.
3. Write or update the narrowest failing test first when behavior changes.
4. Put the rule in its authoritative layer rather than duplicating it at the call site.
5. Decode every external value at its boundary and keep state separated by authority,
   lifetime, and transition model.
6. Add one informative sentence of documentation to every exported class, function,
   type, and React component.
7. Document non-trivial cross-file or cross-package coupling on both sides so a future
   search finds the relationship.
8. Update specifications, README instructions, TODOs, plans, and decision records in the
   same change when their current claims change.
9. Run the narrowest relevant checks, followed by broader checks in proportion to risk.
10. For a user-facing UI change, verify behavior in a running browser or the documented
    Playwright equivalent; unit tests alone are insufficient.
11. Report what was and was not verified. Do not convert an environmental limitation,
    near-complete checklist, or written plan into a claim that the work is done.

Agents do not commit on the user’s behalf. They also avoid drive-by refactors, parallel
test execution that races boundary fixtures, new dependencies without a decision, and
destructive cleanup of changes they do not own.

### 23.10 Example: how the table-virtualization decision was handled

The fleet table is a useful example of the process working as intended:

1. Documentation contained an unmeasured claim that the table should be virtualized.
2. The question affected accessibility, dependencies, styling, bundle size, and scale, so
   it warranted a durable decision rather than a local refactor.
3. ADR 24 compared adopting a library, hand-rolling windowing, and narrowing the claim.
4. The chosen position kept the semantic table, asserted correct behavior at 500 rows,
   and named live delta churn as the evidence that could reopen the choice.
5. ADR 32 later produced that browser measurement against the production bundle.
6. The evidence did not trigger virtualization, so the implementation state and observed
   consequences changed while the selected position remained intact.

This is the repository’s preferred pattern: state uncertainty, name the evidence that can
resolve it, gather that evidence at the right boundary, and update the decision record
without pretending the original uncertainty never existed.

## 24. Verification and evidence

The test strategy follows the cheapest reliable boundary:

| Claim                                 | Evidence                                                       |
| ------------------------------------- | -------------------------------------------------------------- |
| Freshness thresholds                  | Pure contract tests with injected time                         |
| Vendor normalization                  | Adapter contract tests against recorded and malformed fixtures |
| Unknown-field accounting              | Adapter and server tests                                       |
| Server transitions                    | Store, ingest, sweep, route, fan-out, and process tests        |
| Entity rules                          | Pure selector and mapping tests                                |
| UI states and accessibility semantics | Testing Library component/page tests by role and name          |
| Layer restrictions                    | Lint plus deliberate legal/illegal enforcement fixtures        |
| Real recovery and keyboard flow       | Playwright against server, simulator, and production bundle    |
| 500-robot browser behavior            | Chromium scale project and machine-readable report             |
| Tenant differences                    | Tenant B production-build browser project                      |

The smoke suite uses real processes and a production Vite bundle. It exercises live
updates, vendor capability differences, keyboard navigation, robot silence, server loss,
and automatic restart recovery in Chromium and Firefox locally, with WebKit included in
CI. Screenshots and traces are failure evidence, not visual-regression baselines.

## 25. Decisions that require justification

These are the decisions to prepare for in a technical demo. Each row states the rationale,
the accepted cost, and what would justify revisiting it.

| Decision                                                  | Why it was chosen                                                                                         | Accepted cost or risk                                                                                               | Evidence or revisit trigger                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Canonical core plus declared capabilities                 | Normalizes genuine sameness without erasing vendor differences or spreading vendor checks downstream      | A new capability requires a contracts change and a panel registry entry                                             | Fixture joins prove A/B/C normalization; revisit if the capability record stops expressing a real vendor difference |
| Freshness only on the server                              | One clock and one rule can distinguish silent robots from a blind console                                 | UI cannot continue aging rows while offline; it must suppress the labels                                            | Acts 4 and 5 plus sweep tests; revisit only if a new authoritative freshness source is designed                     |
| Server receipt time drives freshness                      | Vendor clocks can drift; the server can only make a reliable age guarantee against its own clock          | “Last seen” and freshness may be based on different timestamps                                                      | Technician clock delta exposes the difference; changing this would weaken the guarantee                             |
| HTTP per-reading ingest                                   | Simple, observable, and sufficient for the documented workload without a broker                           | Request overhead is the named ingest ceiling                                                                        | Batch ingest first if measured HTTP overhead becomes the bottleneck; broker or runtime changes need a new ADR       |
| HTTP snapshot plus WebSocket deltas                       | Efficient push updates with one stable frame shape and a deterministic rejoin path                        | Join logic needs buffering, session IDs, and flush reconciliation                                                   | Real restart tests; polling becomes viable only if sub-second updates cease to matter                               |
| Whole-robot delta replacement                             | Atomic keyed application is simple and idempotent                                                         | More bytes than field patches                                                                                       | Revisit only if measured frame size or apply cost—not intuition—shows a problem                                     |
| Bounded in-memory state, no database                      | Keeps the demo reproducible and the runtime small                                                         | Restart loses observations and history; no horizontal durability                                                    | Persistence, audit, multi-process coordination, or restart continuity requirements trigger a new design             |
| Unvirtualized semantic table                              | Preserves native table semantics and avoids an unneeded dependency and styling system                     | DOM contains all rows; ceiling beyond the measured workload is unknown                                              | Current 500-row/10-Hz browser evidence did not trigger change; remeasure under a larger real workload               |
| Fetch-on-visit battery history                            | Avoids streaming or prefetching detail data for hundreds of robots                                        | Chart is not a continuously streamed history surface                                                                | Revisit if operators need a live trend while remaining on detail                                                    |
| Fixed 60-second, 60-point history                         | Comparable axes, bounded wire cost, preserved extrema, auditable memory                                   | Callers cannot request another window; server retains about 89.5 MiB at the maximum 500 × 3,001 sample design point | A second window or metric requires contract and capacity work                                                       |
| Build-time tenant profile                                 | Wrong or partial tenant config fails before deployment; components stay tenant-neutral                    | One build per tenant; no live tenant switching                                                                      | Revisit if runtime tenancy is a real deployment requirement, including caching and authorization implications       |
| MUI plus semantic tokens only                             | One component, theme, and accessibility system                                                            | MUI conventions and bundle cost constrain component choice                                                          | New styling system needs an ADR and must justify duplicate theming and enforcement                                  |
| One-site derived map                                      | Independent site frames cannot be honestly combined; no real bounds or floor plan exist                   | Bounds are not architecture and can remain generous after an outlier                                                | Floor-plan calibration, geodetic data, or linkable site views trigger new decisions                                 |
| Operator default, Technician toggle                       | Keeps operational scanning primary while preserving integration evidence                                  | Persona is local view state, not a permission model                                                                 | Real roles or protected diagnostics require server authorization, not a stronger toggle                             |
| Exact unredacted raw payload, bounded and unauthenticated | Exact unknown vendor evidence is useful, and fake redaction of unknown fields would offer false assurance | Sensitive data could be exposed; current route is demo-only                                                         | Authentication plus diagnostic permission and audit are mandatory before deployment                                 |
| Real-stack production-build E2E                           | Browser, proxy, socket, process restart, focus, and paint behavior cannot be proven in jsdom              | Slower CI and browser dependencies                                                                                  | Keep while these remain release claims; unit tests are not a substitute                                             |

## 26. Known boundaries, omissions, and release blockers

Do not let the demo imply that these are already solved:

### Security and commands

- There is no authentication or authorization.
- API and WebSocket surfaces are not user-protected.
- Raw payload is unredacted and explicitly not access-controlled.
- There are no robot commands, confirmations, permissions, requested-state workflows, or
  command audit trails.
- A Technician toggle changes presentation only; it is not a security role.

This is the largest gap between the demonstration and a deployable operations product.

### Persistence and distributed operation

- State, history, session identity, and counters are process-local.
- A restart deliberately resets telemetry knowledge.
- There is no database, broker, multi-node state replication, or durable event log.
- The design assumes only a small number of connected consoles.

### Spatial model

- Positions are local site-frame metres, not latitude/longitude.
- There is no floor plan, calibration, obstacle model, route, mission, or robot heading on
  the map.
- Derived extents show relative geometry only.

### Product scope

- No discovery, commissioning, fleet editing, or manifest management UI.
- No missions or work queues.
- No user preferences or runtime theme selection.
- No promise beyond the measured scale profile.
- Split-origin production deployment needs explicit CORS configuration and integration
  evidence.

These are intentional cuts, not features hidden elsewhere in the repository.

## 27. Presenter questions and concise answers

### “Why not calculate freshness in React?”

Because the browser cannot distinguish a silent robot from its own broken connection. A
server sweep has one clock and can keep reporting robot silence while the stream remains
healthy. When the stream itself is down, the browser suppresses the claim.

### “Why both reportedAt and receivedAt?”

`reportedAt` tells the operator when the robot says the observation happened.
`receivedAt` tells the system when its own server received it. Freshness uses the latter;
the technician clock delta exposes disagreement between them.

### “Why not put every vendor field on one big type?”

That makes absence ambiguous and pushes vendor knowledge into the UI. The canonical core
contains only shared meaning; declared capabilities state real differences explicitly.

### “Why WebSocket instead of polling?”

Polling either misses sub-second transitions or repeatedly sends the entire fleet quickly
enough to imitate push badly. Snapshot plus deltas sends a complete baseline once and only
changed robots afterward.

### “Is 500 robots the UI ceiling?”

No. It is the documented and measured operating point. The table and stream were verified
there; the ceiling above it is unmeasured. The architecture avoids claiming a number it
has not established.

### “Why is the table not virtualized?”

At the measured 500-row workload, the semantic table remains usable. Virtualization would
replace native semantics, complicate keyboard focus, add bundle and styling cost, and may
not fix parent-level recomputation. It is deferred until measurement justifies it.

### “Why does history load only after opening a robot?”

The fleet view needs current summary values, not 50 or 500 historical windows. Fetching
history on visit keeps the primary surface light and gives the secondary resource its own
error lifecycle.

### “Why does Vendor B say sequence is not evaluated rather than zero?”

Vendor B has no sequence counter. Zero would mean the system evaluated continuity and
found no gaps; “Not evaluated” states that no such measurement exists.

### “Why show unknown fields?”

An accepted payload can still contain new vendor fields. Counting their dotted paths
turns silent integration drift into visible evidence without promoting an unknown field
into the canonical model automatically.

### “Why is the map not a real floor plan?”

No floor-plan or calibration authority exists in the data. The UI can honestly show only
relative positions inside one site’s observed frame, so it labels the derived frame and
does not imply architecture.

### “Is Tenant B runtime feature flagging?”

No. It is a separate validated build profile. Wordmark, palette, endpoint paths, and
feature policy are selected together before the bundle ships.

### “Can this be deployed as-is?”

Not as a production operations system. Authentication, authorization, protected
diagnostics, command safety, durable state, and deployment-specific integration evidence
are still required.

## 28. Glossary

| Term                  | Meaning in this project                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Adapter               | Vendor-specific decoder and normalizer                                                   |
| Canonical core        | Fields with shared operational meaning across every vendor                               |
| Capability            | A typed declaration of a genuine non-shared robot feature or diagnostic                  |
| Wire format / dialect | The raw network payload shape, units, and conventions used by one vendor                 |
| Envelope              | Canonical observation plus identity, provenance, timestamps, freshness, and capabilities |
| Registered state      | Manifest identity for a robot that has never reported                                    |
| Snapshot              | Complete fleet baseline fetched over HTTP                                                |
| Delta batch           | WebSocket frame containing whole envelopes for changed robots only                       |
| Flush sequence        | Server-wide ordering number used to reconcile snapshot and frames                        |
| Server session ID     | Process epoch used to detect restart and reset reconciliation                            |
| Freshness             | Server-derived age classification: Unknown, Live, Stale, or Unreachable                  |
| Connection state      | Browser transport state: Connecting, Connected, Reconnecting, or Disconnected            |
| Read model            | Browser-friendly representation mapped from decoded contracts                            |
| Persona               | Operator or Technician presentation choice; not a security role                          |
| Last known            | Retained observation whose current validity cannot be asserted                           |
| Decimation            | Reducing historical samples while preserving important extrema                           |
| Provenance            | Where and when a displayed value came from                                               |

## 29. A final mental checklist before presenting

- Keep the connection banner visible during Acts 4–6.
- Describe Unknown as “registered but never observed,” not as an error.
- Describe Vendor A/B/C input as different raw network formats, not different UI models.
- Keep robot freshness, stream connection, and resource loading state separate.
- Say that the server owns freshness and the browser only renders it.
- Explain that capability declarations, not vendor names, choose detail panels.
- Call 500 robots a measured workload, never a ceiling.
- Call the map a derived site frame, never a floor plan.
- Call Technician a presentation mode, never a permission.
- State the raw-payload and authentication limitation before an audience has to discover it.
- End on the distinction between a robot going silent and the console going blind; that is
  the clearest proof of the architecture.
