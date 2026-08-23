# 02 — FreshnessLabel

- **Status:** implementation-ready
- **Revision 4:** `asOf` widens to `string | null`. A robot registered but never seen has freshness `unknown` and no observation time at all (ADR 3), which a required string could only satisfy by inventing one — the failure Principle 4 exists to prevent. `null` means never observed and is not the same as a missing prop. Adds the disconnected-stream rule from ADR 3. Conditional rendering switched from `&&` to explicit ternaries.
- **Revision 3:** `asOf` required rather than optional; `receivedAt` added for receipt time where transport delay matters (Principle 4). Token mapping moved to the `--status-*` / `--ink-*` role names; the `--online` / `--offline` family no longer exists.

Implementation: `components/freshnessLabel.tsx`

## 1. Responsibility

`FreshnessLabel` surfaces how old a value is: `live` | `stale` | `unreachable` | `unknown`. It implements Principle 4: any surface showing operational state shows how old it is.

It does not compute freshness from timestamps (entity/selector owns that, per Principle 1), does not replace `StatusChip`, and does not render charts.

## 2. Dependencies

- Design tokens (see § 6 for the current mapping)
- Optional: relative-time formatting from `utils` (pure function only)
- No domain entity imports (Principle 9)

## 3. Public contract

```ts
type FreshnessState = "live" | "stale" | "unreachable" | "unknown";

interface FreshnessLabelProps {
  readonly state: FreshnessState;
  /**
   * ISO 8601 source timestamp. Required, and explicitly nullable:
   * `null` means the robot is registered but has never reported, which is
   * the only case with no observation time (ADR 3). Omitting the prop is
   * a type error; passing `null` is a statement.
   */
  readonly asOf: string | null;
  /** Receipt time, where transport delay matters (Principle 4). */
  readonly receivedAt?: string;
  /** Chip only, against chip plus formatted age. Intended for table cells. */
  readonly compact?: boolean;
  readonly className?: string;
}
```

`asOf` is required as a prop and nullable as a value. A caller holding a timestamp must pass it; a caller whose robot has never reported passes `null` rather than inventing an epoch. Those are different facts and the type distinguishes them.

## 4. Required output

Compact:

```tsx
<span className={["freshness", `freshness--${state}`].join(" ")}>
  <span className="freshness__dot" aria-hidden="true" />
  {stateLabel}
</span>
```

Full:

```tsx
<span className={...}>
  <span className="freshness__dot" aria-hidden="true" />
  {stateLabel}
  {asOfFormatted !== null ? (
    <span className="freshness__asOf mono"> · {asOfFormatted}</span>
  ) : null}
  {receivedAtFormatted !== null ? (
    <span className="freshness__received mono"> (recv: {receivedAtFormatted})</span>
  ) : null}
</span>
```

`stateLabel` is fixed copy: Live / Stale / Unreachable / Unknown.

Conditionals are explicit ternaries, never `&&`. With a string operand `&&` renders the empty string when the value is `""`, which is a silent way to emit a stray text node.

When `asOf` is `null` the component renders the state word alone. That is the never-observed case and it is honest; it is not a licence to omit an age that exists.

## 5. Content rules

- Always visible text for state.
- The component is pure: it formats only from its props and never reads `Date.now()` during render. Relative ages are computed by the caller from an injected clock, which is what makes freshness testable at a controlled time (Principle 10).
- `asOf` formatting is tabular mono; prefer absolute UTC in technician contexts, relative in operator table if space-constrained — caller chooses by passing preformatted string or raw value to a shared formatter.
- If `receivedAt` is provided (e.g. in technician diagnostics where transport delay matters), append it as a secondary timestamp.
- Do not invent "connected" or vendor-specific wording (Principle 3).

## 6. Design-system mapping

Freshness is not a status and does not share the status colour palette (six variants: neutral, active, charging, degraded, fault, unknown, mapped from the canonical status enum plus health severity). Freshness is expressed by emphasis and the state word itself, not by borrowing a status hue. (Principle 8: tokens only, no raw literals).

| State         | Treatment                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `live`        | Full opacity, `--ink`. Dot in `--status-active` (green) — the one place freshness borrows a status colour, since "currently reporting" and "the robot is doing something" are visually adjacent ideas. |
| `stale`       | `--ink-soft`, dotted underline on the age text                                                                                                                                                         |
| `unreachable` | `--ink-muted`; never `--accent`                                                                                                                                                                        |
| `unknown`     | `--ink-muted`, neutral                                                                                                                                                                                 |

Type: mono caption. Same chip geometry as `StatusChip` for visual rhythm.

**Project rule:** `unreachable` and `unknown` use `--ink-muted`; never the tenant accent (`--accent`).

## 7. Responsive behavior

Compact mode intended for table cells. Full mode may wrap; `asOf` must not overflow with horizontal scroll at 320px.

## 8. Interaction states

Non-interactive. Parent row/link owns activation.

**While the stream is disconnected, this component is not rendered per robot.** ADR 3 makes the connection-integrity banner part of the freshness mechanism's correctness: a per-robot label sourced from a dead socket asserts currency the client cannot support. The feature suppresses per-robot labels in favour of the connection-level state, and a console showing them with no live connection is a defect against Principle 4 regardless of what the banner says.

## 9. Accessibility contract

- State name in text.
- Time is DOM text (not CSS `content`), always present since `asOf` is required (Principle 6).
- Pairing with `StatusChip` is common; ensure the accessible name of the row still makes sense (e.g. table cell contents read in order). When paired, `StatusChip`'s own accessible name carries the "(last known)" qualification — `FreshnessLabel` does not duplicate it.

## 10. Failure behavior

- Missing `state` or `asOf` → type error. `asOf: null` is a valid value, not a missing one.
- `asOf: null` with a state other than `unknown` is a caller bug: only a never-observed robot lacks a timestamp. The component renders the state alone rather than throwing, and the condition is caught by the selector test rather than at render.
- Invalid `asOf` or `receivedAt` string → component throws in development; in production, render the state without a formatted time rather than silently guessing a date.
- `unknown` when registered but never seen (per product rules); component does not validate that policy (Principle 1).

## 11. Verification

| Concern      | Check                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Principle 4  | Fleet table cells include freshness, not status alone; a real `asOf` is never replaced by a placeholder, and `null` appears only for never-observed robots |
| Never seen   | Fixture robot with `freshness: "unknown"` and `asOf: null` renders the state word and no date                                                              |
| Tokens only  | No hex; six-status palette and freshness treatment reference only tokens defined in `tokens.css` (Principle 8)                                             |
| Timer policy | Documented in ADR 3; component only displays                                                                                                               |
| Themes       | All four states in both tenant profiles (dark and light)                                                                                                   |

## 12. Change rules

Thresholds (2s / 10s) live in config and ADR 3, not in this component (Principle 13). Changing labels or states updates this spec and all call sites.
