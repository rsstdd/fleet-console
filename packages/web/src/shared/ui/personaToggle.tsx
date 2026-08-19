import type { ReactElement } from "react";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";

/** The two audiences robot detail renders for; see component spec 08 §3. */
export type Persona = "operator" | "technician";

/** Display-only inputs for the persona toggle: the current value and a change callback. */
export interface PersonaToggleProps {
  readonly value: Persona;
  readonly onChange: (persona: Persona) => void;
  readonly className?: string;
  readonly disabled?: boolean;
}

/**
 * Compact-control height from component spec 08 §6. MUI's `size="small"`
 * alone lands near 39px (13px text at the button variant's 1.75 line height
 * plus 7px padding), so the height is stated rather than inherited. Raw px is
 * permitted here because `shared/ui` is where the token mapping lives, and no
 * control-height token exists to reach for (Principle 8).
 */
const CONTROL_HEIGHT = "32px";

/**
 * Local override for the selected state. The app-level theme's global
 * MuiToggleButton style override gives `.Mui-selected` a filled accent
 * background, which was written for the tenant-switch toggle in the shell.
 * This component's own spec explicitly forbids that treatment here — the
 * accent is reserved for primary actions, and persona is identity, not a
 * status or a command. `sx` on the group produces a more specific selector
 * than the theme's `styleOverrides`, so this scopes the correction to
 * PersonaToggle without touching the global theme or the tenant toggle's
 * legitimate filled style (component spec 08 §6, ADR 5).
 *
 * The disabled rule is explicit rather than left to MUI's default, because
 * replacing root's border/color here also silently overrides whatever
 * disabled dimming the theme would otherwise supply — the spec calls for
 * 40% opacity specifically, so that value is stated rather than assumed.
 *
 * The focus ring is deliberately absent: `:focus-visible` in
 * `src/styles/global.css` already draws a 2px `--focus-ring` outline on every
 * focusable element, which is what spec §8 asks for. Repeating it here would
 * be a second authority for the same decision.
 */
const PERSONA_TOGGLE_SX = {
  "& .MuiToggleButton-root": {
    minHeight: CONTROL_HEIGHT,
    padding: "var(--space-1) var(--space-3)",
    fontSize: "var(--text-small)",
    lineHeight: "var(--leading-normal)",
    textTransform: "none",
    borderColor: "var(--line-strong)",
    color: "var(--ink)",
    "&.Mui-selected": {
      backgroundColor: "var(--surface-raised)",
      color: "var(--accent-text)",
      borderColor: "var(--accent-text)",
      "&:hover": {
        backgroundColor: "var(--surface-raised)",
      },
    },
    "&.Mui-disabled": {
      opacity: 0.4,
      pointerEvents: "none",
      color: "var(--ink-muted)",
      borderColor: "var(--line)",
    },
  },
} as const;

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
  disabled,
}: PersonaToggleProps): ReactElement {
  return (
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
      sx={PERSONA_TOGGLE_SX}
    >
      <ToggleButton value="operator">Operator</ToggleButton>
      <ToggleButton value="technician">Technician</ToggleButton>
    </ToggleButtonGroup>
  );
}

export default PersonaToggle;
