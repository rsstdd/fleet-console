# 05 — Stat

Status: implementation-ready
Implementation: `shared/ui/Stat.tsx`

## 1. Responsibility

`Stat` displays one summary metric (value + label) for the fleet summary strip.

It does not fetch data, trend history, or sparkline.

## 2. Dependencies

- Tokens for text and optional tone colours
- Layout: caller uses Stack/Grid; Stat is the cell content
- No domain, feature, or transport imports (Principle 9)

## 3. Public contract

```ts
interface StatProps {
  readonly label: string;
  readonly value: string | number;
  readonly hint?: string; // e.g. "of 50"
  readonly tone?: "default" | "warning" | "critical";
  readonly className?: string;
}
```

## 4. Required output

```tsx
<div className={["stat", toneClass, className].filter(Boolean).join(" ")}>
  <div className="stat__value mono">{value}</div>
  <div className="stat__label">{label}</div>
  {hint ? <div className="stat__hint">{hint}</div> : null}
</div>
```

## 5. Content rules

- Value uses tabular numerals (`mono` + tabular-nums).
- Label is short plain language.
- Tone is optional emphasis only; do not encode the full status taxonomy here (use chips in tables).
- Tone names are feedback roles (`warning`, `critical`), not status variants. They resolve to the `--warning` and `--error` aliases, which the design profile defines in terms of the status palette so the two sets cannot drift (Principle 8). `StatusChip`'s variants and `Stat`'s tones are separate unions and are never unified.

## 6. Design-system mapping

| Part           | Token                                                        |
| -------------- | ------------------------------------------------------------ |
| Value          | `--ink`, mono, ~1.25–1.5rem weight 500                       |
| Label          | `--ink-muted`, small                                         |
| Hint           | `--ink-muted`, caption                                       |
| warning value  | `--warning` (alias of `--status-degraded`)                   |
| critical value | `--error` (alias of `--status-fault`)                        |
| Surface        | optional parent Paper; Stat itself has no forced card border |

## 7. Responsive behavior

In a wrapping flex/grid, stats stack; min width left to caller. Value must not truncate mid-number if possible.

## 8. Interaction states

Non-interactive by default.

## 9. Accessibility contract

- DOM order is **value then label**, matching the visual order, so the rendered sequence and the reading sequence agree (Principle 6, WCAG 1.3.2). A screen reader hears "44, Live".
- **Do not add `aria-label` to the root.** The root is a `div` with no role, and an accessible name on a role-less generic element is not reliably exposed. It would also duplicate visible text and could silently diverge from it. The visible text is the accessible content.
- If a caller genuinely needs the metric named before its value, it passes a label that reads correctly in that order rather than adding ARIA here.
- Tone colour is never the only signal; the label and value text remain clear without it.

## 10. Failure behavior

Missing label or value → type error / do not render incomplete stat.

## 11. Verification

| Concern      | Check                                                               |
| ------------ | ------------------------------------------------------------------- |
| Tabular nums | Counts and totals align in the strip as values change               |
| Tone         | `warning` and `critical` resolve to `--warning` / `--error` tokens  |
| A11y         | No `aria-label` on the root; visible text is the accessible content |
| No domain    | No robot, site, vendor or freshness types (Principle 9)             |

## 12. Change rules

Adding icons or sparklines is a new component or an explicit extension with its own spec.

---
