# `web` — the fleet operations console

The React console operators watch. It renders one coherent fleet from three vendor
dialects, and it is explicit about **how old** every value is.

The whole package is organised around one claim: **the console never presents stale data as
current.** Most of what looks like extra machinery below is there to hold that line.

## Run it

```bash
pnpm dev                       # console, server and simulator together
pnpm --filter web dev          # console alone, on http://localhost:5173
pnpm --filter web test         # unit and component suites (vitest)
pnpm --filter web lint         # eslint + stylelint + tsc
```

The console alone is honest but empty: with no server it reports itself **disconnected**,
suppresses every per-robot freshness label, and shows no rows. That is the designed
behaviour, not a broken build.

`VITE_TENANT` selects a tenant profile at build time — `tenant-a` (dark, "Fleet Console")
or `tenant-b` (light, "Northwind Robotics", with the lidar panel disabled). An unknown
value fails the build
([ADR 17](../../docs/00_adr/17_BUILD_TIME_TENANT_CONFIGURATION.md)). To browse the
tenant-B profile against the live dev stack, run `pnpm dev:tenant-b` from the repository
root; `pnpm test:e2e:tenant` drives its production bundle in Chromium.

## Layers, and the rule that matters

```
app       transport lifecycle, routing, theme, providers
features  fleet · robot            composition only
entities  robot · site             domain model, selectors, the store — no JSX
shared    ui (presentational) · lib (time, connection state, the transport)
config    tenant profiles, flags, endpoints
```

Dependencies point **downward only**, enforced by `eslint-plugin-boundaries` with
deliberate violation fixtures proving the rules fire. `features` may not import `app`, and
that single constraint explains two designs that otherwise look ornate: connection state
travels through a context in `shared/lib`
([ADR 23](../../docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md)) and the
fleet store travels through one in `entities/robot`, because neither can be passed down the
import graph.

## How data arrives

Open the socket → buffer → fetch the snapshot → discard what the snapshot covers → replay
the rest. **In that order.** Fetching before opening loses every delta emitted in the gap,
and the symptom is a row that quietly stops updating rather than an error — so the ordering
lives in its own tested module (`shared/lib/coldStart.ts`) rather than inside the transport
that would be tempted to inline it.

- `shared/lib/transportDecoding.ts` — the **one** decode. A failed request is recoverable;
  a body the contract refuses is terminal, because retrying returns the same bytes.
- `shared/lib/streamLifecycle.ts` — the complete state matrix, as a pure reducer.
- `entities/robot/fleetStore.ts` — robots keyed by id, **replaced whole, never merged**,
  under the entity-owned `FleetResourceState` machine: the transport reports what
  happened (snapshot start/success, recoverable or terminal failure, a frame) and the
  store owns what the fleet surface shows — loading, ready, refreshing, a recoverable
  error with the one Retry, or a terminal contract failure naming issue paths and codes.
- `entities/robot/fromEnvelope.ts` — the one place a canonical envelope becomes a read
  model. No component ever reaches into a response. Its `reconcileDetailWithRow` is what
  keeps robot detail live: one fetch per visit, then core values and freshness update by
  overlaying this robot's fleet row, with no refetch and no re-render for other robots'
  deltas.

**There is no freshness timer anywhere in this package, and adding one is a defect.**
`freshness` is a field the server's sweep computed and sent. A client that aged robots
locally would be a second authority that can disagree with the first, and the disagreement
would be invisible ([ADR 3](../../docs/00_adr/03_FRESHNESS.md)).

## Two failures the UI keeps apart

A robot going silent and the console going blind look similar and mean opposite things:

- **A robot stops reporting.** Its row degrades `Live → Stale → Unreachable` while the
  banner still says connected. The server has a current answer about that robot, and it is
  bad news.
- **The stream drops.** Every row is retained, every per-robot freshness label is
  **suppressed**, and the banner carries the connection-level state instead. The console has
  no current answer about anything and says so once, rather than blaming fifty machines for
  its own socket.

Both were watched in a browser on 20 August 2026. Deriving freshness server-side is what
makes them distinguishable at all.

## Rendering rules worth knowing before editing

- **Absence is the interface.** A capability panel exists because a robot declared the
  capability. No disabled placeholders, and `if (vendor === …)` in a component is a defect
  rather than a shortcut.
- **Non-live rows do not show live numbers.** Battery renders as an em dash and status
  chips go hollow with `(last known)`. While the stream itself is down, per-robot freshness
  labels are suppressed and the fleet summary's heading reads "Fleet reporting status ·
  last known" over unchanged counts (ADR 23).
- **A robot that never reported has `null`, not zero.** No health severity, no battery, no
  last-seen. `nominal` for a machine nobody has heard from is a fabricated reassurance.
- **Tokens, not literals.** Colours live in `styles/tokens.css`; `scripts/checkTokens.mjs`
  fails CI on a drifted value or a WCAG ratio below AA.
- **Operator view is default**; technician diagnostics — adapter ids, clock delta, the raw
  vendor payload — sit behind an explicit toggle.

## Site labels

Site labels come from the manifest's `sites` directory, carried on the fleet snapshot
(ADR 34): the console holds no fixture table and invents no label. `entities/site`
resolves labels against the decoded directory and falls back to the raw id only before
the first snapshot arrives.

## Browser evidence

Browser-driven end-to-end tests are committed under
[ADR 32](../../docs/00_adr/32_BROWSER_EVIDENCE_WITH_PLAYWRIGHT_AGAINST_THE_REAL_STACK.md):
`pnpm test:e2e` runs the smoke scenarios per engine (Chromium, Firefox, and — in CI,
where its system libraries exist — WebKit) against the real server, real simulator, and
the production bundle served by `vite preview`; `pnpm test:e2e:scale` reports the
500-robot client measurement, and `pnpm test:e2e:tenant` builds and drives the tenant-B
production bundle in Chromium (light theme, disabled lidar panel, narrow viewport).
Locally, run the Chromium and Firefox projects; WebKit is exercised in CI where its
system libraries are installed. The harness lives in [`e2e/`](./e2e/), builds once in
global setup, gives each test a fresh stack, and attaches process logs, traces, and
screenshots on failure. Automatic reconnection (landed 20 August 2026 under
[ADR 31](../../docs/00_adr/31_JITTERED_RECONNECT_AND_SERVER_SESSION_RECONCILIATION.md))
is proven there against a really-restarted server. Real screen-reader output and
subjective forced-colors inspection remain manual.

Remaining work lives in three per-slice TODOs under `src/entities/robot`,
`src/features/fleet` and `src/features/robot`. (The historical `UI_PLAN.md` is archived
at `docs/04_archive/WEB_UI_PLAN.md`; it is not current remaining work.)
[`AGENTS.md`](./AGENTS.md) is the scoped guide and has the task routing table.
