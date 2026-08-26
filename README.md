# Fleet Console

A real-time operations console for robots supplied by three vendors that disagree about
almost everything: payload shape, units, timestamp format, status vocabulary, and which
sensors they report at all.

```bash
pnpm install
pnpm dev        # console on http://localhost:5173, server and simulator alongside
```

## What it claims

**1. The console never shows a stale reading as current.**

Silence is an event. If a robot stops reporting, nothing arrives to tell the system so —
which means a console that reacts only to messages will keep displaying the last reading
forever, with no indication it has gone cold.

So freshness is not derived on arrival. The server runs a recurring sweep over each
robot's `receivedAt` and moves it `LIVE → STALE → UNREACHABLE` on its own schedule. That
answer travels as a field on the envelope, and the browser displays it without running a
competing timer. Stop the simulator and every row degrades on the server's clock while the
socket stays open.

When the stream itself drops, per-robot freshness is _suppressed_ rather than frozen: the
console cannot vouch for any of it, so a single banner says so and the readings blank out.

**2. Vendor differences are normalized where shared, preserved where real.**

Every vendor maps onto one canonical core — identity, battery, position, status, health.
What genuinely differs travels as a _declared capability_: vendor A reports lidar, C
reports a water level, B reports neither and sends no sequence number at all.

The UI renders panels from those declarations. There is no vendor conditional anywhere in
`packages/web`. A robot that stops declaring a capability stops rendering that panel.

Two consequences worth naming:

- Vendor B sends no sequence, so its continuity reads **"Not evaluated"**, never `0 gaps`.
  Reporting zero would be a false statement to an operator.
- Vendor C sends an undocumented `firmware_channel`. It is accepted, counted on
  `/api/health`, and never invented into the canonical model.

## Architecture

```text
simulator ──HTTP──▶ server ──WS/HTTP──▶ console
   3 wire            adapters             renders from
   dialects          → canonical          declarations
                     freshness sweep
```

| Package              | Contents                                                                |
| -------------------- | ----------------------------------------------------------------------- |
| `packages/contracts` | Canonical envelope, capability schemas, pure `deriveFreshness`.         |
| `packages/server`    | Adapters, ingest, in-memory state, freshness sweep, fan-out, simulator. |
| `packages/web`       | React + Material UI console.                                            |

`contracts` sits at the bottom and imports nothing from the workspace. `web` never imports
`server` — they share `contracts` only. Both edges are lint-enforced.

### Joining the stream without a gap

A console that fetches a snapshot and _then_ opens a socket loses everything sent in
between. This one opens the socket first and buffers, then fetches the snapshot, then
discards every buffered delta the snapshot already covers.

That comparison needs `flushSequence` (which flush produced this frame) and
`serverSessionId` (which server process). The sequence restarts at zero when the server
restarts, so comparing across sessions is meaningless — a session mismatch is detected and
surfaced rather than silently applied. Reconnects use full-jitter exponential backoff so a
server restart is not stampeded.

## Verifying the claims

```bash
pnpm check       # lint, typecheck, unit tests, build
pnpm test:e2e    # Playwright against the real stack, nothing mocked
```

To watch freshness degrade by hand:

```bash
pnpm dev
# then stop the simulator process and watch every row go STALE, then UNREACHABLE,
# while the connection banner stays quiet — the socket is still up.
```

The unknown-field ledger and per-adapter continuity are visible at
`http://localhost:8080/api/health`.

## Scope

Built: the three vendor adapters, the canonical model, the freshness sweep, the delta
fan-out with cold-start reconciliation, the fleet table, and robot detail with
capability-driven panels and a technician diagnostics view.

Deliberately not built: authentication, persistence (state is in-memory and bounded by the
manifest), horizontal scale (the fan-out assumes one process), and command dispatch — the
console is read-only, which is why "the UI never authorizes an operation" is cheap to
honor here and would need real work to keep honoring.

The fleet table is not virtualized. At the measured fleet size a plain table stays
responsive, and windowing would cost keyboard and find-in-page behavior operators use.
That trade changes at a few thousand rows.
