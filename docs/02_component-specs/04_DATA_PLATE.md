# 04 — DataPlate

Status: implementation-ready
Implementation: `shared/ui/DataPlate.tsx`

## 1. Responsibility

`DataPlate` is the mono caption boundary under tables, detail footers, and live snapshots. It distinguishes recorded/system metadata from prose.

It does not format dates, compute freshness, or provide card chrome.

## 2. Dependencies

- Tokens: `--line`, `--ink-muted`, `--font-mono`, `--text-overline`
- No domain, feature, or transport imports (Principle 9)

## 3. Public contract

```ts
interface DataPlateProps {
  readonly children: React.ReactNode;
  readonly as?: "div" | "footer" | "figcaption";
  readonly className?: string;
}
```

Default `as="div"`.

`as` is a closed union of three element names, not a generic polymorphic `as` accepting any component. That is deliberate: an open `as` would drag element-specific prop types through the component and invite prop spreading, which § 4 of the index forbids. Adding a value requires a change to this document.

## 4. Required output

```tsx
<Component className={["data-plate", className].filter(Boolean).join(" ")}>{children}</Component>
```

## 5. Content rules

- Use for source lines, snapshot timestamps, adapter/seq footers.
- Prefer caller-formatted strings already in mono-friendly shape.
- `figcaption` only inside `figure`; `footer` only for section/article footer, not app shell footer.

## 6. Design-system mapping

- `border-top: 1px solid var(--line)`
- `padding-top: 0.6rem`, `margin-top: 0.75rem`
- Font mono, muted colour, overline size
- Transparent background; no radius/shadow/accent fill

Hairline is decorative (may be low contrast); meaning is in the text.

## 7. Responsive behavior

Text wraps; no horizontal scroll forced by the plate. No truncation utility built in.

## 8. Interaction states

Non-interactive unless caller places a link inside (rare; allowed if the link text is self-describing).

## 9. Accessibility contract

- No extra role.
- Hairline not in the accessibility tree.
- Content is real text for zoom and text-spacing.

## 10. Failure behavior

Empty children → caller omits component.

## 11. Verification

| Concern   | Check                                                    |
| --------- | -------------------------------------------------------- |
| Tokens    | Border, colour and type from variables (Principle 8)     |
| Semantics | `as` restricted by the union; no prop spreading onto DOM |
| No domain | File imports only React and styles (Principle 9)         |
| Themes    | Readable in both tenant profiles                         |

## 12. Change rules

Visual motif changes go through design tokens first. New `as` values require this doc update.

---
