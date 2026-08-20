# 01 — StatusChip

- **Status:** implementation-ready
- **Revision 2:** the variant union is replaced. The seven-value set (`online`, `offline`, `degraded`, `critical`, `charging`, `maintenance`, `info`) predates the canonical status enum and named states no adapter can produce; `maintenance` and `info` are removed, and the remainder is re-derived from `RobotStatus` plus health severity per ADR 1. Adds the required `current` prop, which carries the freshness qualification the design profile and wireframes both depend on. Token mapping updated to the `--status-*` role names; the `--online` / `--offline` family no longer exists.

Implementation: `shared/ui/statusChip.tsx`

## 1. Responsibility

`StatusChip` displays a semantic robot or system status as a labelled chip, and shows whether that status is current or last-known. It is the only approved way to render status in the product UI.

It does not decide status from telemetry, map vendor enums, compute freshness, or act as a button or link. The mapping from `RobotStatus` and `HealthSeverity` to a variant is a tested selector in `entities/robot` (Principle 1).

## 2. Dependencies

- Design tokens: `--status-*` role, tint and border variables
- MUI: none required (native `span` preferred); `Box` allowed if needed for layout
- No domain, feature, or transport imports (Principle 9)

Per ADR 4 this component may not import `@fleet/contracts`. Its prop union is a presentational token set that coincides in shape with the domain enum; the two are never unified.

## 3. Public contract

```ts
type StatusVariant =
  | "neutral" // idle
  | "active" // busy
  | "charging"
  | "degraded" // health severity, not a vendor status
  | "fault"
  | "unknown";

interface StatusChipProps {
  readonly variant: StatusVariant;
  /** Required. Colour alone never carries meaning (Principle 6). */
  readonly label: string;
  /**
   * false renders the outline-only treatment. The caller supplies the
   * "(last known)" wording in `label`; this component supplies only the
   * visual distinction.
   */
  readonly current: boolean;
  readonly size?: "small" | "medium";
  readonly className?: string;
}
```

Six variants, one per state the canonical model can produce: five map to the canonical status enum (`idle`, `busy`, `charging`, `fault`, `unknown`), and `degraded` maps to health severity. No variant exists for a state no adapter emits (ADR 1).

Health severity outranks status where it is the more serious of the two, and `critical` severity therefore renders as `fault` rather than getting a seventh variant of its own — the chip is the only health signal on the fleet table (fleet spec §2), and the danger colour already carries the meaning. The label still names the status, so a critically unhealthy idle robot reads "Idle" on a fault chip. The ranking is `selectStatusPresentation`'s, and is tested there (ADR 1, Observed consequences, 19 August 2026).

`label` is mandatory. Callers supply human-readable copy. The component does not map variants to strings and does not i18n.

## 4. Required output

```tsx
<span
  className={[
    "status",
    `status--${variant}`,
    current ? null : "status--last-known",
    sizeClass,
    className,
  ]
    .filter(Boolean)
    .join(" ")}
>
  {label}
</span>
```

No `role`. The dot is supplied by `.status::before` in CSS and is therefore never in the accessibility tree; the component emits no dot element of its own.

## 5. Content rules

- Label is visible text, not `title` or `aria-label` only.
- Do not pass an empty label; omit the chip instead.
- Do not use for freshness (use `FreshnessLabel`).
- Do not use the tenant accent for any variant. The accent is identity and primary action only.
- When `current` is false the caller's label carries the qualification, e.g. `"Busy (last known)"`. The chip does not append it.

## 6. Design-system mapping

| Part       | Token                                                       |
| ---------- | ----------------------------------------------------------- |
| Text + dot | `--status-neutral` … `--status-unknown` per variant         |
| Background | `--status-*-bg`                                             |
| Border     | `--status-*-border`                                         |
| Type       | `--font-mono`, `--text-caption`                             |
| Radius     | `--radius-sm`                                               |
| Dot        | 6×6px, `border-radius: 50%`, `currentColor`, via `::before` |

Padding `0.25rem 0.6rem`; gap between dot and label `0.4rem`.

`current: false` drops the tint to transparent, sets text to `--ink-muted`, borders with `--line-strong`, and renders the dot hollow. A reader scanning the status column alone is therefore not misled about currency (Principle 4).

## 7. Responsive behavior

Chip does not grow with viewport. Long labels wrap only if the parent forces width; prefer short labels. No breakpoint-specific markup.

## 8. Interaction states

Non-interactive. No hover or focus styles of its own. If placed inside a row link or button, the parent owns focus.

## 9. Accessibility contract

- Meaning is in the text node, never colour or the dot (Principle 6).
- The dot is a CSS pseudo-element and is not exposed to assistive technology.
- Because the qualification lives in `label`, the accessible name carries currency without an `aria-label`. Do not add one; it would duplicate the visible text and diverge from it.
- When paired with `FreshnessLabel` in a table row, the age arrives from the adjacent cell in reading order. `FreshnessLabel` does not repeat the "(last known)" qualification.
- Contrast: text on tinted background must remain readable in both tenant themes. If a pair fails, adjust the token in `tokens.ts`, never in the component (Principle 8).
- Forced colours: border and text must remain visible; the background tint may disappear.

## 10. Failure behavior

- Missing `label`, `variant`, or `current` → TypeScript error.
- Unknown `variant` → TypeScript error; no silent fallback to a default colour.
- Empty string label → return `null` rather than render an unlabelled dot.

## 11. Verification

| Concern  | Check                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------- |
| API      | `label` and `current` required; variant union exhaustive against `RobotStatus` plus `degraded` |
| Mapping  | `selectStatusPresentation` unit test in `entities/robot` (Principle 10)                        |
| Currency | `current: false` renders the last-known treatment and the caller's qualified label             |
| Tokens   | No raw hex in the component file (Principle 8)                                                 |
| A11y     | Colour is not the sole indicator; dot absent from the accessibility tree (Principle 6)         |
| Themes   | Visual check in both tenant profiles for all six variants                                      |
| Lint     | jsx-a11y clean                                                                                 |

## 12. Change rules

New variants require a design-token addition and an update to this document in the same change, and a corresponding state the canonical model can actually produce (ADR 1). Interactive behaviour is a new component or an explicit ADR, never a prop on this one.
