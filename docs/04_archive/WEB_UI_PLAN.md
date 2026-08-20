# Minimal MUI component set — `canonical-fleet`

**Authority:** Historical. This implementation plan records earlier reasoning; current ADRs, package specifications, and shipped tests supersede its status claims.

**Archived 20 August 2026** from `packages/web/UI_PLAN.md`. Its replacement as the record of web-package alignment work is [`WEB_ALIGNMENT_PLAN.md`](./WEB_ALIGNMENT_PLAN.md) (since archived in turn) together with the current `docs/03_package-specs/05_WEB.md`; the per-slice TODOs under `packages/web/src/**` carry any remaining items. Nothing links this file as current remaining work.

**Revision 6.** § 2, § 3, § 6 and § 7 were re-checked against the tree on 19 August 2026 and their status claims corrected: all eight shared components are built and styled, and the shell, router and robot detail exist. The plan's own reasoning is unchanged; only the claims about what had been written were wrong.

**Revision 5.** The § 1 mapping sample is corrected: it declared the presentational union by importing it from `shared/ui`, which the dependency rule forbids and which ADR 4 recorded as a known-wrong sample. The virtualization deferral no longer cites ADR 6, which is a server-persistence decision. § 2, § 6 and § 7 now record what exists against what is planned, so the document can be checked against the tree rather than read as intent.

Carried from Revision 4: `FreshnessLabel.asOf` is required and `receivedAt` is named where transport delay matters (Principle 4); the mapping rule has framework-independent tests (Principle 1); feature composition maps asynchronous surface states (Principle 5) and state separation (Principle 11); component testing goes through accessible user behaviour (Principle 10).

Aligned with `PRINCIPLES.md` (fifteen principles), the design profile, and ADRs 1–6.

---

## 0. Layer responsibilities

| Layer          | Responsibility                                                                       |
| -------------- | ------------------------------------------------------------------------------------ |
| MUI primitives | Layout, inputs, structure                                                            |
| `shared/ui`    | Pure presentational primitives, no domain imports (Principle 9)                      |
| `entities/*`   | Domain model, contract decoding (Principle 2), and mapping domain values to variants |
| `features/*`   | Composition of shared UI and entities, no cross-feature imports                      |

Do not rebuild MUI. Add a shared component only where the design profile or a principle demands consistency.

---

## 1. The mapping rule, stated because the boundary forbids the obvious approach

`StatusChip` and `FreshnessLabel` live in `shared/ui` and therefore cannot import `RobotStatus`, `HealthSeverity` or `Freshness` from `@fleet/contracts`. Their prop unions are presentational tokens that happen to coincide in shape with domain values. They are not the same types and must not be unified.

The mapping lives in `entities/robot/selectors.ts` and is covered by framework-independent tests (Principle 1).

The union is **declared here, not imported**. An entity may import `shared/lib` and never `shared/ui` (ADR 4), so importing `StatusVariant` from `shared/ui` fails the boundary rule. Structural typing makes a locally declared union assignable to the prop at the feature layer where the two meet, with no import and no boundary crossed.

```ts
// entities/robot/selectors.ts
import type { HealthSeverity, Robot, RobotStatus } from "./model";

/**
 * Structurally identical to StatusChip's StatusVariant and deliberately not
 * imported from it. Unifying the two is what the prose above forbids.
 */
export type StatusPresentationVariant =
  | "neutral" // idle
  | "active" // busy
  | "charging"
  | "degraded" // health severity, not a vendor status
  | "fault"
  | "unknown";

const STATUS_VARIANT: Record<RobotStatus, StatusPresentationVariant> = {
  idle: "neutral",
  busy: "active",
  charging: "charging",
  fault: "fault",
  unknown: "unknown",
};

const STATUS_LABEL: Record<RobotStatus, string> = {
  idle: "Idle",
  busy: "Busy",
  charging: "Charging",
  fault: "Fault",
  unknown: "Unknown",
};

function selectVariant(status: RobotStatus, severity: HealthSeverity): StatusPresentationVariant {
  return severity === "degraded" && status !== "fault" ? "degraded" : STATUS_VARIANT[status];
}

export function selectStatusPresentation(robot: Robot) {
  const current = robot.freshness === "live";
  const base = STATUS_LABEL[robot.status];

  return {
    variant: selectVariant(robot.status, robot.health.severity),
    label: current ? base : `${base} (last known)`,
    current,
  };
}
```

The `(last known)` wording is decided here, once, rather than at each call site. `receivedAt` is not on this shape yet: the fixture `Robot` carries `lastSeenAt` only, and the `reportedAt`/`receivedAt` pair arrives with the canonical envelope from `@fleet/contracts` (ADR 1). Add it to the selector when the contract lands, not before.

Without this rule written down, the first agent to touch `StatusChip` imports the domain enum, and the boundary lint rule fails the build in a way that reads like a tooling problem rather than a design decision. Add one line to `packages/web/CLAUDE.md` under the hard rules: presentational unions in `shared/ui` are never unified with contract types, and the mapping is a tested selector.

---

## 2. What lives in `shared/ui`

Eight components. Everything else is MUI composition.

| Component          | Why it exists                                          | Used by                           | State |
| ------------------ | ------------------------------------------------------ | --------------------------------- | ----- |
| `StatusChip`       | Status and its currency must look identical everywhere | Fleet table, robot detail         | Built |
| `FreshnessLabel`   | Principle 4: no telemetry value without its age        | Table cells, detail header        | Built |
| `SectionLabel`     | Accent-tick section index from the design profile      | Detail panels, page sections      | Built |
| `DataPlate`        | Mono caption under tables and live snapshots           | Fleet table footer, detail footer | Built |
| `Stat`             | Compact freshness count for the summary strip          | Fleet summary                     | Built |
| `EmptyState`       | Consistent empty, filtered and error messaging (P5)    | Table, detail, connection loss    | Built |
| `ConnectionBanner` | Connection integrity is visible or it is not handled   | App shell                         | Built |
| `PersonaToggle`    | Operator against technician without a second layout    | Robot detail                      | Built |

All eight are built. `ConnectionBanner` was the last and is the load-bearing one: ADR 3 makes the banner part of the freshness mechanism's correctness rather than adjacent UI, because a client showing per-robot freshness over a dead socket asserts currency it cannot support. It ships with an attempt counter and an `onRetry` control, resolving the spec/wireframe disagreement this revision used to leave open.

`Stat` and `EmptyState` are styled: `global.css` carries `.stat__value`, `.stat__label`, `.stat__hint`, `.stat--warning`, `.stat--critical`, `.empty-state`, `.empty-state__title`, `.empty-state__description` and `.empty-state__action`, so `tone` has a visual effect.

**What is still missing is not a component.** `ConnectionContext` in `shared/lib` carries connection state from `app` to both features and defaults to `disconnected` ([ADR 23](../../docs/00_adr/23_CONNECTION_STATE_TRAVELS_THROUGH_SHARED_LIB.md)); no transport supplies a real value, so the console honestly reports itself disconnected. That is fleet TODO **A3**, not a gap in `shared/ui`.

---

## 3. Component APIs

```tsx
// shared/ui/StatusChip.tsx
export type StatusVariant =
  | "neutral" // idle
  | "active" // busy
  | "charging"
  | "degraded" // health severity, not a vendor status
  | "fault"
  | "unknown";

export type StatusChipProps = {
  variant: StatusVariant;
  label: string; // always required; colour alone never carries meaning
  /** false renders outline-only and suffixes "(last known)" */
  current: boolean;
  size?: "small" | "medium";
};

// shared/ui/FreshnessLabel.tsx
export type FreshnessState = "live" | "stale" | "unreachable" | "unknown";

export type FreshnessLabelProps = {
  state: FreshnessState;
  /** required; `null` only when the robot has never reported (resolved, see below) */
  asOf: string | null; // ISO 8601 source timestamp
  /** optional: Principle 4 requires receipt time where transport delay matters */
  receivedAt?: string; // ISO 8601 receipt timestamp
  compact?: boolean; // chip only, against chip plus relative age
};

// shared/ui/SectionLabel.tsx
export type SectionLabelProps = { children: React.ReactNode }; // "02 — Capabilities"

// shared/ui/DataPlate.tsx
export type DataPlateProps = { children: React.ReactNode };

// shared/ui/Stat.tsx
export type StatProps = {
  label: string;
  value: string | number;
  hint?: string; // "of 50"
  tone?: "default" | "warning" | "critical"; // emphasis only, not the status taxonomy
};

// shared/ui/EmptyState.tsx
export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

// shared/ui/ConnectionBanner.tsx
export type ConnectionBannerProps = {
  state: "connected" | "reconnecting" | "disconnected";
  lastEventAt?: string;
  attempt?: number;
  /** must force an immediate attempt and surface it; a control that does nothing is the same lie this project argues against */
  onRetry?: () => void;
};

// shared/ui/PersonaToggle.tsx
export type Persona = "operator" | "technician";

export type PersonaToggleProps = {
  value: Persona;
  onChange: (persona: Persona) => void;
};
```

Every one of these imports only MUI primitives and theme tokens, accepts no domain type, and is safe under the token and hex lint rule (Principle 8).

**Accessible names.** `StatusChip` composes its accessible name from label, currency and, when supplied by the caller through `aria-describedby`, the freshness age. A chip announced without its qualification reproduces for a screen reader exactly the failure the visual treatment prevents (Principle 6).

**Resolved on `asOf`.** A robot registered but never seen has freshness `unknown` and no timestamp at all, which a required `asOf: string` could only express by inventing an observation that never happened — the failure Principle 4 exists to prevent. The prop is now `asOf: string | null`, with `null` meaning never observed, so no call site fabricates an epoch-zero date.

---

## 4. Composed directly from MUI

| Need              | MUI                                                        |
| ----------------- | ---------------------------------------------------------- |
| Shell and nav     | `AppBar`, `Toolbar`, `Container`, `Box`, `Stack`           |
| Fleet table       | `Table`, `TableHead`, `TableBody`, `TableRow`, `TableCell` |
| Filters           | `TextField`, `Select`, `ToggleButtonGroup`                 |
| Detail layout     | `Paper`, `Stack`, `Divider`                                |
| Actions           | `Button`, `IconButton`, `Tooltip`                          |
| Raw payload       | `Accordion` plus `<pre>` in mono                           |
| Feature flag gate | Conditional render from `config`                           |
| Theming           | Token-driven `createTheme` plus `CssBaseline`              |

**Virtualization is deferred deliberately, and the deferral is now recorded** — [ADR 24](../../docs/00_adr/24_NARROW_THE_SCALE_CLAIM_NOW_VIRTUALIZE_ON_MEASURED_CHURN.md), register D14, replacing this paragraph's guess that it might become "ADR 7" (that number went to module resolution). The table ships unvirtualized and is asserted correct at five hundred rows in `src/features/fleet/fleetScale.test.tsx`; no ceiling is claimed. What the ADR sharpened is _which_ measurement decides it: not a static render at five hundred robots, but delta-apply cost at that size under a live stream, because the page re-renders wholesale on every delta and windowing removes only the row half of that. The result belongs in ADR 2's `## Observed consequences`. Note that virtualization inside a semantic MUI `Table` is not a drop-in, because absolute positioning conflicts with table layout, so the practical routes are `@mui/x-data-grid` — evaluated first, since a third-party shell is a second styling system in all but name (ADR 5) — `TableVirtuoso`, which supplies the shell itself, or div rows with explicit ARIA roles (Principle 6). None is a fifteen-minute change, which is the reason for deferring it behind a measurement, and whichever is chosen must fit ADR 22's bundle budget.

**Map, only if time remains:** positioned `Box` elements, not a mapping library.

---

## 5. Feature composition

**Fleet (`features/fleet`)**

- Summary strip: four `Stat` components counting freshness as LIVE, STALE, UNREACHABLE and UNKNOWN, mutually exclusive and totalling the fleet
- Filters: site select, vendor select, freshness select, text search
- Table columns: robot (mono), vendor, status (`StatusChip`), freshness (`FreshnessLabel`), site, battery, last seen (mono)
- `DataPlate` beneath the table
- Asynchronous states (Principle 5): initial loading, background refresh, empty (`EmptyState`), stale data (`FreshnessLabel`), offline, recoverable error (`EmptyState` with retry), terminal error (`EmptyState` without retry)
- State separation (Principle 11): Remote resource state (robots fetch) is kept separate from observed live state (telemetry stream) and local view state (filter inputs)

The vendor column exists because multi-vendor normalization is the second sentence of the thesis and the primary surface would otherwise never mention a vendor (Principle 3).

**Robot detail (`features/robot`)**

- Header: identifier, `StatusChip`, `FreshnessLabel`, `PersonaToggle`
- Section 01, Summary: core fields only, rendered for every robot from every vendor
- Section 02, Capabilities: declared non-core capabilities only, so the section visibly differs between a Vendor A robot and a Vendor C robot (Principle 3)
- Technician: same shell, additive diagnostics section and raw payload
- A capability not declared produces no panel and no placeholder

**Shell (`app`)**

- `ConnectionBanner` above content, handling connection lifecycle: connected, reconnecting (recoverable error), disconnected (offline/terminal error) per Principle 5
- Wordmark, accent and flags from `config`, so a tenant switch changes name, theme and feature availability together (Principle 13)

---

## 6. File layout

```
web/src/shared/ui
  StatusChip.tsx
  FreshnessLabel.tsx
  SectionLabel.tsx
  DataPlate.tsx
  Stat.tsx
  EmptyState.tsx
  ConnectionBanner.tsx
  PersonaToggle.tsx
  index.ts
```

PascalCase filenames and a barrel. Every component spec's "Implementation" line names the same paths.

**The tree still does not match this, and the disagreement is now a decision to make rather than a rename to perform.** All eight built components are camelCase (`statusChip.tsx`, `freshnessLabel.tsx`, and so on) and there is no `index.ts`, so features import deep paths. Four of the eight — `statusChip`, `freshnessLabel`, `personaToggle`, `connectionBanner` — carry both a named and a default export; the other four are named-only.

Root TODO **P2.5** owns the resolution and deliberately reopens the barrel: a barrel that hides which module a symbol came from is not obviously the right controlled surface, so the choice is between renaming to match these specs and amending the specs to match the tree. Do not treat this section as settling it.

No `RobotCard`, no `FleetTable`, no `CapabilityPanel` wrapper. Extract only after the same `Paper` and `SectionLabel` block appears three times, and extract it domain-free.

---

## 7. Build order

1. `StatusChip` and `FreshnessLabel`, plus the mapping selector and its test (Principle 10: unit test for mapping). These block an honest table. — _done_
2. `Stat`, `DataPlate`, `SectionLabel` (Principle 10: component tests for accessibility roles). — _done, styled, tested_
3. `ConnectionBanner`, `EmptyState` (Principle 10: component tests for state transitions). — _done_
4. `PersonaToggle`. — _done_
5. Compose the fleet table and robot detail (Principle 10: browser tests for critical workflows and keyboard flows). — _fleet table and robot detail both compose against fixtures; the app shell and router exist, and the browser tests this step names are committed: the Playwright smoke suite drives both pages, including the keyboard flow, in real engines (`e2e/smoke.spec.ts`, ADR 32)._

Nothing outside this list until the vertical path holds: table, freshness, detail, connection integrity.

**The vertical path holds as of 20 August 2026.** The gate this section used to name — no snapshot client, no socket, no store — is gone: `shared/lib` carries the cold-start ordering, the stream lifecycle, the decode boundary and the client that sequences them; `app` owns the socket; `useFleetRobots` reads a keyed store and `useRobotDetail` fetches `GET /api/robots/:id`. ADR 23's suppression rule now has running-browser evidence rather than injected states — headless Chrome showed every row retained with no per-robot freshness label under a `Stream reconnecting` banner once the server stopped.

---

## 9. What is left in this package

Four items, none of them a component, each recorded where the repository expects it rather than only here. The first two closed on 20 August 2026 and keep their outcomes below; the last two remain open.

### 9.1 Automatic reconnection — **done (ADR 31, 20 August 2026)**

D22 resolved everything this section held open, together, as it predicted they had to be: the transport now retries on a full-jitter schedule with a three-attempt cap only while the socket has never opened, a refused upgrade and a dropped connection are distinguished exactly as far as the browser allows, `StreamConnectionState` widened to four values with terminal causes, and the banner's Retry is the manual escape from terminal states rather than the only recovery. The browser proof — a real restarted server, re-joined without reload — is a committed scenario under ADR 32.

### 9.2 Browser-driven tests — **done (ADR 32, 20 August 2026)**

D23 resolved to a committed Playwright suite (`e2e/`), and every claim this section used to defer is automated: freshness suppression on stream loss, a delta arriving as a rendered row, and delta-apply cost at 500 robots — the last measured at p50 47.3 ms / p95 53.7 ms delta-to-paint under a live 10 Hz stream, which checked ADR 24's virtualization trigger against a real number (not fired) and closed the client-side half of root TODO **P3.2**.

### 9.3 Site labels — `packages/FIXME.md` **F16**

`entities/site` is the only invented data left in the console, and it cannot read the server: the fleet manifest carries a `siteId` per robot and **no label for it**. The shipped manifest uses ids like `SITE-NORTH` that appear in no fixture, so the table renders the raw id through `selectSiteLabel`'s fallback — correct behaviour, but it means the label layer is dead against real data while looking alive against fixtures. Two closes, both decisions rather than cleanups: put labels in the manifest schema (widens a schema two packages validate, and ADR 14 makes the roster a parity join, so the simulator's generator changes with it), or drop the label layer and show ids, which contradicts `docs/01_page-specs/02_FLEET.md`. **Do not close it by extending the fixture list to match the shipped manifest** — that hides the gap behind data that agrees by hand, which is the class of error F1 and F4 both were.

### 9.4 Forced-colors evidence — `packages/FIXME.md` **F8**, root TODO **P3.3**

The one accessibility claim that cannot be computed. `scripts/checkTokens.mjs` gates every WCAG contrast ratio in both themes, but forced-colors mode replaces the tokens outright, so a ratio says nothing about it. `global.css` already carries a `@media (forced-colors: active)` block — the status chip's dashed border standing in for a dropped `box-shadow` — and it has never been looked at in that mode. It needs a person, not a script.

---

## 8. Out of scope for `shared/ui`

Domain hooks and domain types. Map markers. Command controls of any kind (these require server-side authorization per Principle 7). Chart wrappers; inline a small SVG feature-locally if a sparkline is needed — which is exactly what the battery-history sparkline did on 20 August 2026: a feature-local polyline in `features/robot`, no charting dependency (ADR 33). Form systems. A second technician layout.
