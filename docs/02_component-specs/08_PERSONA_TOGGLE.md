
# 08 — PersonaToggle

Status: implementation-ready
Implementation: `shared/ui/PersonaToggle.tsx`

## 1. Responsibility

`PersonaToggle` switches Operator vs Technician on robot detail without a second layout. Presentational only; parent owns which panels render.

## 2. Dependencies

- MUI `ToggleButtonGroup` + `ToggleButton` for keyboard behaviour and selection semantics
- Tokens for selected and outline states
- No domain, feature, or transport imports (Principle 9)

## 3. Public contract

```ts
type Persona = "operator" | "technician";

interface PersonaToggleProps {
  readonly value: Persona;
  readonly onChange: (persona: Persona) => void;
  readonly className?: string;
  readonly disabled?: boolean;
}
```

## 4. Required output

```tsx
<ToggleButtonGroup
  exclusive
  size="small"
  value={value}
  onChange={(_event, next: Persona | null) => {
    if (next !== null) {
      onChange(next);
    }
  }}
  aria-label="View persona"
  className={className}
  disabled={disabled}
>
  <ToggleButton value="operator">Operator</ToggleButton>
  <ToggleButton value="technician">Technician</ToggleButton>
</ToggleButtonGroup>
```

`disabled` is forwarded to the group, not to each button; earlier revisions declared the prop and dropped it on the floor.

The handler is defined inline and recreated each render. That is correct here: the component renders two buttons, `ToggleButtonGroup` is not memoised, and wrapping this in `useCallback` would add a dependency array to maintain in exchange for nothing measurable.

## 5. Content rules

- Labels fixed: Operator / Technician.
- Do not add more personas without product + spec change.
- Default selection is owned by the feature (Operator).

## 6. Design-system mapping

- Unselected: transparent, `--line-strong` border, `--ink`
- Selected: `--surface-raised` with `--accent-text` text and border — identity, not status
- Height aligned with compact controls (~32px)
- **No filled accent style.** The accent is reserved for primary actions. If the app theme sets a filled `.Mui-selected` background for another toggle, this component overrides it locally rather than the theme being bent to suit one caller (ADR 5).

## 7. Responsive behavior

Stays in header row; may shrink padding on narrow screens but keeps both options visible (no select collapse for MVP).

## 8. Interaction states

- Keyboard: arrows within group per MUI; Tab moves past group.
- Disabled: 40% opacity, no pointer.
- Focus: token focus ring on focused button.

## 9. Accessibility contract

- Group has an accessible name (`aria-label="View persona"`).
- Selection is exposed via `aria-pressed` on each button, which is MUI's default for an exclusive group. Radio semantics would also be defensible for a mutually exclusive choice; changing to them is a specification change, not an implementation detail, because it alters what assistive technology announces.
- Changing persona reveals and hides whole sections. Focus must not be dropped: the technician sections are additive and appear *after* the toggle, so leaving focus on the toggle is correct and no focus management is required. If a future change removes a section containing focus, the feature moves focus to the section heading before removal (Principle 6).
- Toggling must not be announced as a navigation. There is no route change (§ 8 of the robot detail spec).

## 10. Failure behavior

- `onChange` with `null` from MUI (deselect attempt) → ignore; exclusive group must always have a value.
- Invalid value → type error.

## 11. Verification

| Concern        | Check                                                                |
| -------------- | -------------------------------------------------------------------- |
| Exclusive      | Always exactly one selected; deselect attempt is ignored             |
| Disabled       | `disabled` reaches the rendered group                                |
| Keyboard       | Operable without a pointer; focus retained across a persona change (Principle 6) |
| Feature wiring | Technician reveals diagnostics and raw payload; operator shows neither |
| Tokens         | Selected style uses variables, and is not filled accent (Principle 8) |

## 12. Change rules

Additional personas or icons require this specification and the README persona section to update together. Switching from `aria-pressed` to radio semantics requires the same, plus the robot detail accessibility section.
```
