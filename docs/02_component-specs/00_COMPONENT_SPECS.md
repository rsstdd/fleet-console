# canonical-fleet component specifications

Status: implementation-ready component contract index
Stack: React · TypeScript · MUI · design-token layer
Layer: `/web/src/components` only

## 1. Purpose

Each reusable presentational component has one owning document. Feature code may compose these components but must not redefine their API, token mapping, or accessibility contract.

This separation keeps domain logic out of primitives (Principle 1), enforces layer boundaries (Principle 9), and keeps the token layer free of raw literals (Principle 8).

## 2. Ownership

| Component         | Owning specification      | Implementation                   |
| ----------------- | ------------------------- | -------------------------------- |
| Status chip       | `01_STATUS_CHIP.md`       | `components/statusChip.tsx`       |
| Freshness label   | `02_FRESHNESS_LABEL.md`   | `components/freshnessLabel.tsx`   |
| Section label     | `03_SECTION_LABEL.md`     | `components/sectionLabel.tsx`     |
| Data plate        | `04_DATA_PLATE.md`        | `components/dataPlate.tsx`        |
| Stat              | `05_STAT.md`              | `components/stat.tsx`             |
| Empty state       | `06_EMPTY_STATE.md`       | `components/emptyState.tsx`       |
| Connection banner | `07_CONNECTION_BANNER.md` | `components/connectionBanner.tsx` |
| Persona toggle    | `08_PERSONA_TOGGLE.md`    | `components/personaToggle.tsx`    |

## 3. Normative hierarchy

- `PRINCIPLES.md` and `/docs/00_adr` own product and architectural rules. Where this document and a principle disagree, the principle governs and this document is corrected.
- Design tokens (`tokens.css`) own colour, type, and spacing values.
- These specs own the mapping of those rules onto one component.
- Features own composition; they do not own primitive appearance.

## 4. Shared conventions

- Presentational only: no domain types, no entity/feature imports (Principle 9).
- Explicit `readonly` prop interfaces; no arbitrary prop spreading onto DOM. A component accepts the props it documents and no others.
- Native HTML / MUI semantics before ARIA; no redundant roles (Principle 6).
- Tokens only: no raw hex or raw px outside `/components` and `/config` (Principle 8, lint-enforced).
- Source order equals reading and focus order (Principle 6).
- Status and freshness never rely on colour alone; text label is required (Principle 6).
- The tenant accent is identity and primary action only; never status. The token is `--accent`; there is no `--gold`.
- No second styling system. MUI plus the token layer is the decision (ADR 5).

**React conventions**, binding on every component in this layer:

- Plain function components. No `React.FC`, no class components, no default exports where a named export will do.
- React 19: `ref` is an ordinary prop. Do not wrap components in `forwardRef`.
- Conditional rendering uses explicit ternaries returning `null`, never `&&`. With string or number operands `&&` renders `""` or `0` into the DOM.
- Lists are keyed by a stable domain identifier, never by array index. Rows re-key on `robotId` so a delta update patches rather than remounts (Principle 12).
- Components are pure in render: no `Date.now()`, no `Math.random()`, no reads of mutable module state. Anything time-dependent arrives as a prop, which is what makes freshness testable against an injected clock (Principle 10).
- No memoisation without a measurement. `memo`, `useMemo` and `useCallback` are added against a profile, not on suspicion (Principle 12).
- Generated DOM ids come from `useId`, never from a counter or a random value.

## 5. Shared document template

Every component specification includes:

1. Responsibility and non-responsibilities
2. Dependencies
3. Public props
4. Required semantic output
5. Content rules
6. Design-system mapping
7. Responsive behavior
8. Interaction states
9. Accessibility contract (Principle 6)
10. Failure behavior
11. Verification matrix (Principle 10: tests prove behavior at the cheapest reliable boundary)
12. Change rules

## 6. Definition of done

A component is complete when its implementation matches this contract, typechecks, passes a11y lint (Principle 6), passes component tests written against accessible user behaviour rather than implementation detail (Principle 10), uses only tokens for colour and spacing (Principle 8), and degrades as specified when props are absent or invalid (Principle 15).

No snapshot tests. A snapshot asserts that output did not change, which is not the same as asserting it is correct.
