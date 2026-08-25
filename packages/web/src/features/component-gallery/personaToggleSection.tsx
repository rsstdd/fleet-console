import { useState, type ReactElement } from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";

import { PersonaToggle, type Persona } from "@/components/personaToggle";
import { SectionLabel } from "@/components/sectionLabel";

const handleDisabledPersonaChange = (): void => {};

export function PersonaToggleSection(): ReactElement {
  const [persona, setPersona] = useState<Persona>("operator");

  return (
    <Paper component="section" aria-labelledby="gallery-persona-toggle-heading" sx={{ p: 3 }}>
      <SectionLabel>04 — PersonaToggle</SectionLabel>
      <Typography variant="h3" component="h2" id="gallery-persona-toggle-heading" sx={{ mt: 1 }}>
        PersonaToggle states
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Compare the selected-state treatment here against the tenant switch above: same underlying
        MUI component, deliberately different appearance. The global theme gives{" "}
        <Box component="code" sx={{ fontFamily: "var(--font-mono)" }}>
          .Mui-selected
        </Box>{" "}
        a filled accent background — correct for the tenant switch, wrong for persona, which is
        identity rather than a primary action. PersonaToggle styles its own buttons with{" "}
        <code>styled()</code>, which composes after the theme and renders a subtle outline instead.
      </Typography>
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <PersonaToggle value={persona} onChange={setPersona} />
          <Typography variant="body2" color="text.secondary">
            Selected: {persona}
          </Typography>
        </Stack>

        <Box
          sx={{
            p: 2,
            border: "var(--border-width) solid var(--line)",
            borderRadius: "var(--radius)",
          }}
        >
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

        <Typography variant="overline" sx={{ color: "text.disabled" }}>
          Disabled state
        </Typography>
        <PersonaToggle value="operator" onChange={handleDisabledPersonaChange} isDisabled />
      </Stack>
    </Paper>
  );
}
