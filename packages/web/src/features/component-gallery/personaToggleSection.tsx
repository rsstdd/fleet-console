import { useState, type ReactElement } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";

import { PersonaToggle, type Persona } from "@/components/personaToggle";
import { SectionLabel } from "@/components/sectionLabel";

const handleDisabledPersonaChange = (): void => {};
const SECTION_SX = { p: 3 } as const;
const HEADING_SX = { mt: 1 } as const;
const DESCRIPTION_SX = { mt: 0.5, mb: 2 } as const;
const CODE_SX = { fontFamily: "var(--font-mono)" } as const;
const SELECTED_PERSONA_SX = { alignItems: "center" } as const;
const PERSONA_DESCRIPTION_SX = {
  p: 2,
  border: "var(--border-width) solid var(--line)",
  borderRadius: "var(--radius)",
} as const;
const DISABLED_LABEL_SX = { color: "text.disabled" } as const;

export function PersonaToggleSection(): ReactElement {
  const [persona, setPersona] = useState<Persona>("operator");

  return (
    <Paper component="section" aria-labelledby="gallery-persona-toggle-heading" sx={SECTION_SX}>
      <SectionLabel>04 — PersonaToggle</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-persona-toggle-heading" sx={HEADING_SX}>
        PersonaToggle states
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={DESCRIPTION_SX}>
        Compare the selected-state treatment here against the tenant switch above: same underlying
        MUI component, deliberately different appearance. The global theme gives{" "}
        <Box component="code" sx={CODE_SX}>
          .Mui-selected
        </Box>{" "}
        a filled accent background — correct for the tenant switch, wrong for persona, which is
        identity rather than a primary action. PersonaToggle styles its own buttons with{" "}
        <code>styled()</code>, which composes after the theme and renders a subtle outline instead.
      </Typography>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={SELECTED_PERSONA_SX}>
          <PersonaToggle value={persona} onChange={setPersona} />
          <Typography variant="body2" color="text.secondary">
            Selected: {persona}
          </Typography>
        </Stack>

        <Box sx={PERSONA_DESCRIPTION_SX}>
          {persona === "operator" ? (
            <Typography variant="body2">
              Operator view: summary block plus declared-capability panels only.
            </Typography>
          ) : (
            <Typography variant="body2">
              Technician view: adds diagnostics and the raw payload, additive to the operator
              content — not a second layout.
            </Typography>
          )}
        </Box>

        <Typography variant="overline" sx={DISABLED_LABEL_SX}>
          Disabled state
        </Typography>
        <PersonaToggle value="operator" onChange={handleDisabledPersonaChange} isDisabled />
      </Stack>
    </Paper>
  );
}
