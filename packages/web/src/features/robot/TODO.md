# TODO — `features/robot`

**Authority:** Planning only. This checklist is non-normative; accepted ADRs and current package specifications govern conflicts.

**Created:** 19 August 2026
**Scope:** the robot detail surface only. Items that cannot be finished in this directory name the package or root item that owns them.
**Governing documents:** [`03_ROBOT_DETAIL.md`](../../../../../docs/01_page-specs/03_ROBOT_DETAIL.md), [`PRINCIPLES.md`](../../../../../PRINCIPLES.md), [ADR 1](../../../../../docs/00_adr/01_ADAPTER_BOUNDARY.md), [ADR 3](../../../../../docs/00_adr/03_FRESHNESS.md), [`packages/web/CLAUDE.md`](../../../CLAUDE.md). Root items are referenced by their current ids — **P1.2** (server transport) and **P1.3** (the web live store) — in [`/TODO.md`](../../../../../TODO.md). The earlier **T**/**D** ids this file used were retired when the root TODO was renumbered.

The page is built and passes its § 11 verification table. What follows is what it
still cannot do, and why — recorded here rather than in a doc comment so the next
agent working in this directory finds it without reading 400 lines first.

---

## R1. Per-robot freshness is not suppressed while the stream is down — **CLOSED 19 August 2026**

**Closed by [ADR 23](../../../../../docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md)** (register stub **D15**, option 1).

ADR 3 requires the console to stop rendering per-robot `FreshnessLabel`s when the
transport reports the stream down, and to let `ConnectionBanner` carry the
connection-level state. A label sourced from a dead socket asserts a currency the
client cannot support.

The blocker was structural and is gone: connection state now travels through
`ConnectionContext` in `shared/lib`, the only layer both `app` and `features` may
import. `DetailHeader` reads it once via `useConnectionState()` and renders the
label only when `isStreamConnected` is true — `reconnecting` counts as not
connected, because nothing updates freshness during a reconnect.

**Suppression, not substitution.** Nothing renders in the label's place. The
summary values below stay frozen at last known; only the currency claim is
withdrawn. A per-robot "unreachable" here would attribute the console's own dead
socket to the machine.

**Verified, not assumed.** Three tests cover disconnected, reconnecting, and that
the frozen values remain visible. Removing the condition from this page and from
`features/fleet` together fails exactly four tests and no others, so the guard is
not vacuous.

**What is still missing** is a transport reporting a _real_ state (fleet TODO
**A3**). Until then `AppShell` supplies nothing and the default is `disconnected`,
so this page renders no freshness label at all. That is correct and deliberate —
do not restore an optimistic default to make the label reappear.

## R2. The data is a fixture, but the path is real — narrowed 19 August 2026

`packages/contracts` now exists, so `useRobotDetail` no longer builds a
`RobotDetail` by hand. It builds the JSON body `GET /api/robots/:id` will serve,
serializes it, decodes it with `parseRobotDiagnosticEnvelope` as untrusted input,
and maps it with `entities/robot/fromEnvelope.ts`. Everything after the response
is the production path; only the response itself is local. Nothing in this
package constructs a read model directly.

**What remains:** the fetch and the store subscription. `packages/server` serves
no single-robot endpoint yet (root **P1.2**), and the fleet-wide store is root **P1.3**.

**Done when:** `buildWireResponse` is replaced by the fetch and everything below
it is untouched.

## R3. Three of the five async states are unreachable, and therefore untested

The page renders all of spec § 10: `loading`, `ready`, `not-found`, recoverable
error and terminal error. The fixture hook only ever produces `ready` and
`not-found`, so the skeleton, the retry alert and the terminal empty state have no
test covering them. They are written for the transport that will produce them
(Principle 5), not decoration — but "written" is not "verified", and this file says
so rather than letting the § 11 table imply otherwise.

**Narrowed 19 August 2026.** The terminal error state is now reachable: a
response that fails the canonical schema produces it, with the failing paths in
the message. It is still not exercised, because the fixture response is built
against the same schema that validates it. `loading` and the recoverable error
remain unreachable until there is a network call to be slow or to fail.

**Done when:** **R2** lands and the state matrix is driven through the real hook,
including the recoverable case that keeps a stale robot on screen while retrying.

## R4. Tenant panel flag — CLOSED 19 August 2026 ([ADR 17](../../../../../docs/00_adr/17_BUILD_TIME_TENANT_CONFIGURATION.md))

`DESIGN_SYSTEM.md` § 1 makes "one panel disabled" part of the tenant axis, which is
how the profile demonstrates white-label deployment. `config/tenant.ts` had no flags
field, so the registry in `capabilityPanels.tsx` gated on declared capability alone.

The gate went where this item said it should: beside the capability check, not
inside a panel body, and never as a tenant conditional in a component
(Principle 13).

**Done.** `config/tenant.ts` validates `flags.lidarHealthPanel` at module load;
`panelVisibility.ts` in this directory is the one place a flag name meets a panel
name; `selectPanelCapabilities(robot, disabled)` applies it in `entities/robot`.
`tenantPanelFlag.test.tsx` renders R-055 — which declares lidar health — under
tenant B and asserts no Lidar panel, and it was probed by removing the gate.
No tenant name appears anywhere in this directory.

## R5. The retained payload is trusted, not decoded — CLOSED 19 August 2026

The single-robot response, `rawPayload` included, is now decoded by
`parseRobotDiagnosticEnvelope` from `@fleet/contracts` before anything in this
feature sees it. The payload itself stays `Record<string, unknown>` by design —
it is a vendor's own shape and the contract deliberately declines to model it —
but it arrives through a validated envelope rather than as an unchecked object,
and an unrecognised canonical field is rejected as contract drift rather than
carried into the page.

## R6. Background refresh is unverified

Spec § 10 requires values to update in place, with tabular numerals and no layout
shift, as deltas arrive. Every value that changes is already mono with
`tabular-nums`, so the mechanism is in place, but with a static fixture nothing has
ever updated in place here. Unmeasured claims do not land (Principle 12).

**Done when:** **R2** lands and a delta visibly updates the header and Summary
without a reflow.

## R7. `index.ts` still exports a placeholder string

`export const RobotDetail = "placeholder"` exists only because
`features/fleet/__boundary-violation__/violation.ts` imports that name to prove the
dependency rule rejects `feature → feature`. Retarget the fixture at
`RobotDetailPage` and delete the placeholder — but do not delete or repair the
fixture itself, which is load-bearing (`packages/web/CLAUDE.md`).

**Done when:** the fixture imports a real export and the boundary test still fails
lint with `feature may not import feature`.
