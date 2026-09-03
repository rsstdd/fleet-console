# 06 — EmptyState

Status: implementation-ready
Implementation: `shared/ui/emptyState.tsx`

## 1. Responsibility

`EmptyState` provides a consistent title, optional description, and optional action for empty lists, failed filters, or unavailable detail.

It does not handle routing or data fetching.

## 2. Dependencies

- Tokens for muted text
- No domain, feature, or transport imports (Principle 9)

MUI is permitted **only inside the caller-supplied `action` node** — an MUI `Button` passed as `action` is fine. The component's own markup is plain semantic HTML, per § 4. Earlier revisions read as though MUI could be used for the body; it cannot.

## 3. Public contract

```ts
interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  /** A real control supplied by the caller, e.g. an MUI Button. */
  readonly action?: React.ReactNode;
  readonly className?: string;
}
```

There is no prop for heading level. See § 4.

## 4. Required output

```tsx
<div className={["empty-state", className].filter(Boolean).join(" ")}>
  <h2 className="empty-state__title">{title}</h2>
  {description ? <p className="empty-state__description">{description}</p> : null}
  {action ? <div className="empty-state__action">{action}</div> : null}
</div>
```

Heading level is fixed at `h2`. Every page that uses this component already owns the single `h1`, and every current placement sits directly under it, so `h2` is correct in all of them.

A feature that needs a different level does not work around this with ARIA or a wrapper; it amends this specification and adds a typed prop. A silently adjustable heading level is how document outlines rot (Principle 6).

## 5. Content rules

- Title states the condition (“No robots match these filters”).
- Description states the next step.
- Action is a real control supplied by the caller (e.g. Clear filters).
- This component also carries the recoverable and terminal error states required by Principle 5: a recoverable error passes a retry control as `action`, a terminal error passes none. The copy states what failed and what remains valid; it never implies data is present when it is not.

## 6. Design-system mapping

- Title: `--ink`, body/h3 scale
- Description: `--ink-soft`
- No illustration required for MVP
- No gold decorative shapes

## 7. Responsive behavior

Text wraps at 320px; action button full-width optional via caller styles, not mandatory inside component.

## 8. Interaction states

Owned by slotted action.

## 9. Accessibility contract

- Real heading element for the title, so the state appears in the document outline.
- Description follows the heading in DOM order; no `aria-describedby` is needed for static prose.
- The component never moves focus. If a filter change replaces a table with this state, deciding whether to focus the action is the feature's call, and it must not steal focus on every keystroke (Principle 6).

## 10. Failure behavior

Missing title → invalid. Empty action node → omit action container.

## 11. Verification

| Concern                 | Check                                                              |
| ----------------------- | ------------------------------------------------------------------ |
| Used for filtered fleet | Renders with title, description and a working clear action         |
| Error states            | Recoverable renders an action; terminal renders none (Principle 5) |
| a11y                    | Title is a real `h2`; no focus stolen on render (Principle 6)      |
| No MUI in body          | Component markup is plain HTML; MUI only inside `action`           |
| Tokens                  | Text colours from variables (Principle 8)                          |

## 12. Change rules

Adding forced illustrations or error codes requires this document to define slots.

---
