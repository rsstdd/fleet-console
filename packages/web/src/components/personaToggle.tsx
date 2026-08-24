import type { MouseEvent, ReactElement } from "react";
import { ToggleButton, ToggleButtonGroup, styled } from "@mui/material";
import { toggleButtonClasses } from "@mui/material/ToggleButton";

/** The two audiences robot detail renders for; see component spec 08 §3. */
export type Persona = "operator" | "technician";

/** Display-only inputs for the persona toggle: the current value and a change callback. */
export interface PersonaToggleProps {
  readonly value: Persona;
  readonly onChange: (persona: Persona) => void;
  readonly className?: string;
  readonly isDisabled?: boolean;
}

/**
 * The persona buttons, styled directly rather than reached through a
 * `& .MuiToggleButton-root` descendant selector on the group.
 *
 * That selector named MUI's internal DOM: a release that wraps the button, or
 * renames the class, deletes every rule below it and nothing fails until someone
 * looks at the control. Styling the component this file already renders addresses
 * the element MUI guarantees without routing through the group's descendant structure.
 *
 * What it corrects: the app-level theme's global `MuiToggleButton` override gives
 * `.Mui-selected` a filled accent background, which was written for the tenant-switch
 * toggle in the shell. This component's own spec explicitly forbids that treatment —
 * the accent is reserved for primary actions, and persona is identity, not a status
 * or a command. `styled()` composes after the theme's `styleOverrides`, so these rules
 * win at equal specificity without touching the global theme or the tenant toggle's
 * legitimate filled style (component spec 08 §6, ADR 5).
 *
 * The disabled rule is explicit rather than left to MUI's default, because replacing
 * root's border/color here also silently overrides whatever disabled dimming the theme
 * would otherwise supply — the spec calls for 40% opacity specifically, so that value
 * is stated rather than assumed.
 *
 * The focus ring is deliberately absent: `:focus-visible` in `src/styles/global.css`
 * already draws a 2px `--focus-ring` outline on every focusable element, which is what
 * spec §8 asks for. Repeating it here would be a second authority for the same decision.
 */
const PersonaButton = styled(ToggleButton)({
  minHeight: "var(--compact-control-height)",
  padding: "var(--space-1) var(--space-3)",
  fontSize: "var(--text-small)",
  lineHeight: "var(--leading-normal)",
  textTransform: "none",
  borderColor: "var(--line-strong)",
  color: "var(--ink)",
  [`&.${toggleButtonClasses.selected}`]: {
    backgroundColor: "var(--surface-raised)",
    color: "var(--accent-text)",
    borderColor: "var(--accent-text)",
    "&:hover": {
      backgroundColor: "var(--surface-raised)",
    },
  },
  [`&.${toggleButtonClasses.disabled}`]: {
    opacity: 0.4,
    pointerEvents: "none",
    color: "var(--ink-muted)",
    borderColor: "var(--line)",
  },
});

/**
 * Switches Operator vs Technician on robot detail without a second layout.
 * Presentational only — the parent owns which panels render for each persona,
 * and the default (Operator) belongs to the feature, not here.
 *
 * A deselect attempt from MUI (both buttons off) is ignored: an exclusive
 * group always has a value, so `next` reaches the caller only when it is not
 * null (component spec 08 §10). Selection is announced through the
 * `aria-pressed` MUI puts on each button; moving to radio semantics is a
 * specification change, not an implementation detail (§9).
 */
export function PersonaToggle({
  value,
  onChange,
  className,
  isDisabled,
}: PersonaToggleProps): ReactElement {
  const handleChange = (_event: MouseEvent<HTMLElement>, nextPersona: Persona | null): void => {
    if (nextPersona !== null) {
      onChange(nextPersona);
    }
  };

  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={handleChange}
      aria-label="View persona"
      className={className}
      disabled={isDisabled}
    >
      <PersonaButton value="operator">Operator</PersonaButton>
      <PersonaButton value="technician">Technician</PersonaButton>
    </ToggleButtonGroup>
  );
}
