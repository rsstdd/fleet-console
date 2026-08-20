# `web` — the fleet operations console

The React console operators watch. It renders one coherent fleet from three vendor
dialects, and it is explicit about **how old** every value is.

The whole package is organised around one claim: **the console never presents stale data as
current.** Most of what looks like extra machinery below is there to hold that line.

## Run it

```bash
pnpm dev                       # console, server and simulator together
pnpm --filter web dev          # console alone, on http://localhost:5173
pnpm --filter web test         # 265 tests
pnpm --filter web lint         # eslint + stylelint + tsc
```

The console alone is honest but empty: with no server it reports itself **disconnected**,
suppresses every per-robot freshness label, and shows no rows. That is the designed
behaviour, not a broken build.

`VITE_TENANT` selects a tenant profile at build time — `tenant-a` (dark) or `tenant-b`
(light, with the lidar panel disabled). An unknown value fails the build
([ADR 17](../../docs/00_adr/17_BUILD_TIME_TENANT_CONFIGURATION.md)).

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
- `entities/robot/fleetStore.ts` — robots keyed by id, **replaced whole, never merged**.
- `entities/robot/fromEnvelope.ts` — the one place a canonical envelope becomes a read
  model. No component ever reaches into a response.

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
  chips go hollow with `(last known)`.
- **A robot that never reported has `null`, not zero.** No health severity, no battery, no
  last-seen. `nominal` for a machine nobody has heard from is a fabricated reassurance.
- **Tokens, not literals.** Colours live in `styles/tokens.css`; `scripts/checkTokens.mjs`
  fails CI on a drifted value or a WCAG ratio below AA.
- **Operator view is default**; technician diagnostics — adapter ids, clock delta, the raw
  vendor payload — sit behind an explicit toggle.

## Still fixture-backed

`entities/site` alone, and not for want of trying: the fleet manifest carries a `siteId` per
robot and no label for it, so there is nothing to read. Recorded as `packages/FIXME.md`
**F16** with the two ways to close it.

## Not built

Automatic reconnection — the banner's retry is manual, and the schedule is registered as
open decision **D22** — and browser-driven end-to-end tests, registered as **D23**. Both are
in [`docs/PENDING_ARCHITECTURE_DECISIONS.md`](../../docs/PENDING_ARCHITECTURE_DECISIONS.md).

Remaining work lives in [`UI_PLAN.md`](./UI_PLAN.md) and three per-slice TODOs under
`src/entities/robot`, `src/features/fleet` and `src/features/robot`.
[`AGENTS.md`](./AGENTS.md) is the scoped guide and has the task routing table.
