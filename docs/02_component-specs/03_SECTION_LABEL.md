# 03 — SectionLabel

Status: implementation-ready
Implementation: `shared/ui/sectionLabel.tsx`

## 1. Responsibility

`SectionLabel` renders the design-system section index: mono overline plus an accent tick. It marks the start of a logical block (Summary, Capabilities, Diagnostics).

It does not render the section heading body, choose numbering, or create landmarks by itself.

## 2. Dependencies

- Tokens: `--accent`, `--ink-muted`, `--font-mono`, `--text-overline`
- No MUI requirement
- No domain, feature, or transport imports (Principle 9)

## 3. Public contract

```ts
interface SectionLabelProps {
  readonly children: React.ReactNode; // e.g. "01 — Capabilities"
  readonly className?: string;
}
```

## 4. Required output

```tsx
<div className={["section-label", className].filter(Boolean).join(" ")}>{children}</div>
```

Tick via CSS `::before` (decorative).

## 5. Content rules

- Children should be short index text; full title may sit in a following `h2`/`h3` owned by the feature.
- One tick per logical section; do not stack on every card.
- Do not use for status or errors.

## 6. Design-system mapping

- `::before`: width `1.25rem`, height `2px`, `background: var(--accent)`
- Flex row, gap `0.6rem`, uppercase, letter-spacing `0.1em`
- Colour: `--ink-muted`
- No background, radius, or shadow

## 7. Responsive behavior

Tick size fixed; label text wraps if needed. No duplicate mobile markup.

## 8. Interaction states

None.

## 9. Accessibility contract

- Tick is CSS-only and not in the accessibility tree.
- **This component is not a heading and must not be used as one.** It renders a `div`. A section that needs to appear in the document outline pairs it with a real `h2` or `h3` owned by the feature, placed immediately after. Robot detail depends on this: its sections are navigable by heading, and a `SectionLabel` alone would leave them invisible to a screen-reader heading list (Principle 6).
- Do not give the label an `aria-label` or a `role="heading"` to compensate. Emit the real heading element instead.

## 10. Failure behavior

Empty children → omit render at caller.

## 11. Verification

| Concern         | Check                                                                  |
| --------------- | ---------------------------------------------------------------------- |
| Motif           | Accent tick present; colour from token (Principle 8)                   |
| No domain       | File imports only React and styles (Principle 9)                       |
| Heading pairing | Each use in robot detail is followed by a real `h2`/`h3` (Principle 6) |
| Forced colours  | Section still understandable via text                                  |

## 12. Change rules

Tick geometry/colour are design-system decisions; change tokens first, then this mapping.
