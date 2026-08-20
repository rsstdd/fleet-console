# `packages/`

This directory holds the five workspace packages that make up the fleet
operations console: one UI, and the four packages that feed it.

The split exists so one claim is easy to check: **multi-vendor normalization
belongs at a boundary, not in the UI.** Vendor disagreement is absorbed by
`adapters`. Canonical meaning is defined once in `contracts`. `web` may display
and filter vendor identity, but rendering behavior comes from declared
capabilities and never branches on a vendor name.

| Package                    | Owns                                                               | Status                                      |
| -------------------------- | ------------------------------------------------------------------ | ------------------------------------------- |
| [`contracts`](./contracts) | Canonical envelope, capabilities, wire schemas, freshness function | Landed                                      |
| [`adapters`](./adapters)   | Vendor dialect decoding, unknown-field accounting                  | Landed — three vendors, dispatch registry   |
| [`simulator`](./simulator) | Deterministic vendor telemetry, fault injection                    | Landed                                      |
| [`server`](./server)       | Ingest, state, history, freshness sweep, fan-out, health           | Live process; backpressure trigger-deferred |
| [`web`](./web)             | The operations console                                             | Live data, automatic recovery, browser E2E  |

A **canonical envelope** is the shared robot record every vendor is translated
into. A **capability** is an optional payload a vendor may or may not send;
presence of the key is the declaration. **Freshness** is whether we have recent
enough telemetry to trust a robot's last known state.

---

## Dependency direction

```
        simulator  ──HTTP──▶  server  ──WebSocket──▶  web
                                 │                     │
                                 ▼                     │
                             adapters                  │
                                 │                     │
                                 ▼                     ▼
                             ┌───────────────────────────┐
                             │        contracts          │
                             └───────────────────────────┘
```

Every arrow into `contracts` is one-way. `contracts` imports nothing from this
directory. That is what lets it be the place a disagreement gets settled.

`simulator` has **no production** edge to `contracts` on purpose. It emits raw vendor
payloads and must not be able to construct a canonical envelope — otherwise it
would be testing the adapters against themselves. It restates the three vendor
identifiers locally, in `src/fleet/simulatedRobot.ts`, and
`src/fleet/vendorId.test.ts` asserts that its list and the adapters'
`SUPPORTED_VENDORS` agree — in both directions, so neither a vendor without an
adapter nor an adapter without a producer gets through (ADR 16).

That test is the intended use of `@fleet/adapters` in `simulator`, where it is a dev
dependency: lint bans the specifier in production code and lifts the ban for
`**/*.test.ts`, and `src/__enforcement__/` probes both directions — including a
test-file fixture that must report nothing — so the rule cannot go inert.

**Every arrow above now exists at both ends** (20 August 2026). `simulator ──HTTP──▶
server` was verified by a `pnpm dev` run in which 1,993 readings were sent and 1,993
accepted; `server ──WebSocket──▶ web` by a subscriber that received one robot as `live`
and then as `stale`, the second frame produced by the freshness sweep alone with no
telemetry behind it.

`server ──▶ adapters` is no longer only the supported-vendor list: every reading is
dispatched through the registry's `decodeTelemetry`, and the vendor modules stay
unreachable from a handler because lint bans the deep import in production **and** in
tests, admitting only `@fleet/adapters/testing` for the ingest test's recorded bytes
(ADR 11, amended 20 August 2026).

If you go looking for edges, you will also find `@fleet/server` imported inside
`adapters`, and a `__boundary-violation__` directory in `server`. Those are
fixtures that prove lint catches an illegal import. Leave them broken — being
broken is their job.

---

## `contracts` — the shared definition of a robot

The model every vendor's telemetry is translated into. It contains:

- the declared capability record
- the runtime Zod schemas that decode untrusted input
- the pure freshness function

It is framework-independent and side-effect free. It reads no clock, opens no
socket, and imports no workspace package. Lint enforces the clock ban and the
import ban directly; the absence of a socket follows from having no transport
dependency to open one with.

**Owns:** identity, connectivity, battery, position, status, health, the two
timestamps, capability payloads and their wire representation, `SCHEMA_VERSION`,
and `deriveFreshness`.

**Does not own:** vendor decoding, transport, storage, scheduling, rendering.

The rule that shapes everything downstream: the normalized core carries only
meaning **every** vendor can populate. Anything one vendor has and another does
not is a declared capability. A core field that is simply empty for some vendors
is the failure mode [ADR 1](../docs/00_adr/01_ADAPTER_BOUNDARY.md) exists to
prevent.

---

## `adapters` — what a vendor said

One module per vendor dialect. Each translates an untrusted payload into a
canonical envelope.

Vendors A, B, and C disagree on nesting, battery units, distance units,
timestamp format, status vocabulary, and which fields exist at all. Those
disagreements are load-bearing fixtures, not incidental flavour.

**Owns:** per-vendor decoding, the vendor-support union that gives ingest
dispatch its exhaustiveness check, and the unknown-field ledger.

**Does not own:** the canonical model. Adding a fourth vendor is one module plus
fixtures here. It is never an edit to `contracts`.

Unknown fields a vendor sends are **counted, not silently dropped**. Vendor C's
undocumented field increments the per-adapter tally at
`telemetry.firmware_channel`; `GET /api/health` exposes it under the explicitly accepted
payload scope.

**Landed:** the result type, accepted-payload unknown-field ledger and path discovery,
the supported-vendor set and parity guard, the complete fixture matrix, all three
schemas/adapters and their exact contract tests, and the boundary-enforcement fixtures.

`createAdapterRegistry()` is the public dispatch boundary and owns one accumulated
unknown-field ledger, which `packages/server` now consumes on `GET /api/health`. Each vendor has
representative, empty-boundary, and full-boundary recorded fixtures plus one separately
hand-authored malformed payload, published through `@fleet/adapters/testing`; the nine
generated fixtures are drift-gated in CI (ADR 13).

---

## `simulator` — something to normalize

A deterministic producer that emits raw Vendor A, B, and C wire payloads over
HTTP ingest. Seeded, so a run reproduces. Fault-injectable, so the console's
honesty claims can be exercised rather than asserted.

**Owns:** fleet generation, per-vendor payload construction, emission
scheduling, fault policy, and the ingest client.

**Does not own:** canonical envelopes. It produces the mess; it does not clean
it up.

The `--drop` flag is why this package exists in a submission that could have
shipped fixtures instead. It silences specific robots while the stream stays
healthy. That is the only way to show that freshness detects **absence**, rather
than reacting only to arrivals.

---

## `server` — the runtime authority

Thin. Its framework-independent core keeps one in-memory entry per robot, sweeps
freshness every 500 ms, and coalesces pending deltas. The composition root accepts
telemetry over HTTP, dispatches to the right adapter, serves the four read routes, and
fans those deltas out over WebSocket.

**Owns:** receipt time (`receivedAt`), the current-state store, bounded
per-robot history, the freshness sweep, delta coalescing, and health accounting.
`HealthMetrics` owns the process counters; `GET /api/health` joins them with adapter and
per-robot sequence scopes through the contracts-owned response.

**Does not own:** freshness _derivation_. That is `contracts`' pure function,
called by the sweep here. The split is deliberate: the rule is unit-testable
against an injected clock; the schedule is the server's problem.

No database. Current state rebuilds from the next telemetry snapshot. History is
a bounded ring buffer of compact `{receivedAt, batteryPercent | null}` samples —
one 60-second contract window at the simulator's 50 Hz ceiling — served decimated
to at most 60 extrema-preserving points (ADR 6 as amended by ADR 33).

**Landed:** configuration and the fleet manifest, the current-state store, the
ring buffer, the pending-delta set, clocks, health metrics, and the sweep itself.
Configuration now has two sources with different lifetimes: the committed
`config/*.json` files carry deployment policy, and `FLEET_SERVER_HOST`,
`FLEET_SERVER_PORT` and `FLEET_ALLOWED_ORIGINS` carry per-machine values, decoded
once by `loadRuntimeEndpoints()` — the only `process.env` read in the package (ADR
21). Both raise the same `ConfigValidationError`.

**Landed 20 August 2026:** the composition root. `pnpm --filter @fleet/server start` binds
what `loadRuntimeEndpoints()` returns, serves `POST /api/telemetry/:vendor` and the four
reads (fleet, robot, battery history, health), runs the ADR 3 sweep, fans coalesced deltas
out on `/ws`, and refuses to continue past a `ConfigValidationError`. `FLEET_ALLOWED_ORIGINS` is now enforced ahead of every
route, and the ingest size cap runs before `JSON.parse` rather than after it — both were
configuration with no consumer, and `FIXME.md` **F13** closed with them.

**Not yet:** backpressure on a console that stops reading, deferred on ADR 8's undecided
question of whether the connection cap is configuration or a constant. The history read
landed 20 August 2026 under ADR 33: `GET /api/robots/:id/history` serves the retained
minute decimated behind the contracts-owned response, and capacity resolved from the
window and the validated source ceiling rather than from the sparkline's point count.

**Retention is decided.** One raw payload per robot, replaced not accumulated,
kept verbatim with no redaction, bounded at 64 KiB per request — 31.25 MiB across
500 robots — and deep-copied in both directions so retained evidence cannot be
mutated by whoever wrote it or whoever reads it. The diagnostic endpoint that
serves it has **no access rule**, which is a decision rather than an oversight and
a release blocker rather than a permanent state (`FIXME.md` **F15**).

---

## `web` — the deliverable

The React operations console. Feature-sliced into `app`, `features`, `entities`,
`shared`, and `config`, with the dependency rule enforced in lint —
`eslint-plugin-boundaries` plus the resolver ADR 7 makes mandatory — not in the
build.

**Owns:** the fleet table, robot detail with capability-driven panels, the
operator/technician toggle, tenant theming, and the connection banner.

**Does not own:** freshness. It holds no timer. Freshness arrives as a field on
the envelope and the console displays it.

While the stream is down, ADR 3 requires the console to suppress per-robot
freshness labels and let the connection banner carry the connection-level
truth. **Both halves now exist** (ADR 23). `ConnectionContext` in `shared/lib` —
the only layer both `app` and `features` may import — carries the state from
`AppShell` to the two pages, which render `<FreshnessLabel>` only while the stream
is connected. `reconnecting` counts as not connected. Nothing is substituted for a
suppressed label.

The app-owned transport now reports the real state. The context and `AppShell` defaults
remain `disconnected`, so missing composition fails closed rather than asserting
freshness. Recovery is automatic under ADR 31 — full-jitter reconnect with a
server-session check that detects a restarted server — and the banner's manual retry
remains for the terminal states (initial probe exhausted, contract failure, stream
integrity mismatch).

A row reading LIVE from a socket that died two minutes ago is the failure this
rule prevents. A row reading UNREACHABLE is no better: it blames the machine for
the console's own blindness.

Where that stream will connect is settled. Both tenant profiles carry
`endpoints: { apiBaseUrl: "/api", streamUrl: "/ws" }` — same-origin paths that
Vite's dev proxy forwards to the server, so the console never learns a host and
nothing it sends is cross-origin (ADR 21). Nothing reads those values yet; the
transport client that will is `features/fleet/TODO.md` **A3**.

Robot detail renders exactly the panels a robot's adapter declared. Absence is
the interface — no disabled placeholders. `if (vendor === …)` in a component is
a defect, not a shortcut.

**Landed:** the shell, the shared primitives, the fleet page, robot detail, and
the entity layer that maps a canonical envelope into the read model.

**Landed 20 August 2026:** the transport. `shared/lib` holds the cold-start ordering, the
stream lifecycle, the one decode boundary and the client that sequences them; `app` owns
the socket and publishes connection state; `useFleetRobots` reads a keyed store,
`useRobotDetail` fetches `GET /api/robots/:id`, and `useRobotHistory` fetches the
battery-history window once per visit for the detail-page sparkline (ADR 33). No hook
renders invented data.

**Also landed 20 August 2026:** both halves of what this section used to defer.
Reconnection is automatic under ADR 31 — full-jitter schedule, capped initial probe,
server-session restart detection — and the proof in a browser is the committed Playwright
suite under ADR 32 (`packages/web/e2e`): real server, real simulator, production bundle,
three engines, plus the reported 500-robot client measurement.

---

## Working in here

All five packages implement the four verification script names the root recursive
commands call:

```bash
pnpm test        # pnpm --recursive test
pnpm typecheck
pnpm lint        # per-package lint, then repo-wide prettier
pnpm build
```

Development is a separate root fan-out:

```bash
pnpm dev         # in parallel, for packages that define a dev script
```

Only `simulator` and `web` currently define `dev`. `contracts` and `adapters` are
libraries with nothing to start; `server` is intended to be executable but has no
composition root or runtime script yet. Consequently `pnpm dev` is a two-process start
today and gains the server only when its composition root lands.
The four Node packages add `test:coverage`; `simulator` adds `start`; `web` adds
`lint:css` and `preview`. All five define `test:watch`.

One caveat on those scripts. ADR 9 says executable packages run through `tsx`,
but `simulator`'s `dev` and `start` invoke plain `node`, and `server` declares a
`tsx` devDependency while defining neither script. `pnpm-workspace.yaml` approves
the `esbuild` native build on the grounds that without it "`pnpm dev` and `pnpm
start` fail" — yet no current script invokes `tsx` at all. See
[`FIXME.md`](./FIXME.md) F2.

Scoped to one package — note that `web`'s package name is bare `web`, while the
other four are scoped:

```bash
pnpm --filter @fleet/contracts test
pnpm --filter @fleet/contracts test:watch
pnpm --filter web dev
```

The four Node packages are consumed as **source** (`exports` maps `.` to
`./src/index.ts`). `build` is a typecheck rather than an emit, so no `dist`
needs keeping in sync. Consumers import from the package root. Deep imports into
another package's internals are not part of any contract here.

## Where the rules live

Every package carries a `CLAUDE.md`, and the four Node packages carry an
`AGENTS.md` holding the scoped rules their `CLAUDE.md` points at. `web` keeps
its rules in `CLAUDE.md` directly. Those files are authoritative for their
directory; this one is a map, not a rulebook.

| Concern                                          | Source                                    |
| ------------------------------------------------ | ----------------------------------------- |
| Binding engineering principles                   | [`PRINCIPLES.md`](../PRINCIPLES.md)       |
| Architecture decisions and their consequences    | [`docs/00_adr/`](../docs/00_adr)          |
| Adapter boundary, canonical core, capabilities   | ADR 1                                     |
| Transport, ingest, fan-out                       | ADR 2                                     |
| Freshness derivation and its two halves          | ADR 3                                     |
| Feature-sliced structure and the dependency rule | ADR 4                                     |
| Material UI and the CSS-token styling boundary   | ADR 5                                     |
| In-memory state and bounded history              | ADR 6, amended by ADR 33                  |
| Module-resolution boundary enforcement           | ADR 7                                     |
| Server HTTP/WebSocket implementation libraries   | ADR 8                                     |
| Source exports and TypeScript runtime            | ADR 9                                     |
| Pre-freshness adapter envelope                   | ADR 10                                    |
| Public testing subpath for fixtures              | ADR 11                                    |
| Test-only web dependency on adapters             | ADR 12                                    |
| Recorded fixtures and CI drift guard             | ADR 13                                    |
| Shared fleet roster parity                       | ADR 14                                    |
| Accepted-only unknown-field accounting           | ADR 15                                    |
| Independent vendor lists with test-only parity   | ADR 16                                    |
| Per-package scoped rules                         | `<name>/AGENTS.md`, or `<name>/CLAUDE.md` |
| Remaining work — the four Node packages          | `<name>/TODO.md`                          |
| Remaining work — `web`                           | `UI_PLAN.md`, per-slice `TODO.md`         |
| Cross-package audit findings                     | [`FIXME.md`](./FIXME.md)                  |
