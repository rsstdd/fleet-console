import { useState, type ReactNode } from "react";
import { Box, Paper, Typography } from "@mui/material";

import { DataPlate } from "@/components/dataPlate";
import { type Persona } from "@/components/personaToggle";
import type { Robot } from "@/types/robot";

import { BatteryHistorySection } from "./batteryHistorySection";
import { CapabilitiesSection } from "./capabilitiesSection";
import { DetailHeader } from "./detailHeader";
import { Section } from "./detailSection";
import { SummarySection } from "./summarySection";

/**
 * Stands in for the diagnostics and raw-payload sections, which have no data source while
 * the detail request is failing.
 *
 * States that the console did not read them, never that the robot did not report them:
 * the row above is live telemetry, so the absence here is the console's, not the machine's.
 */
function DetailUnavailableNote(): ReactNode {
  return (
    <Section index="04" title="Diagnostics">
      <Paper sx={{ p: 3 }}>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Adapter diagnostics and the raw payload are served only by the robot detail request, which
          is failing. Nothing here describes what this robot reported — the values above are its
          live fleet row.
        </Typography>
      </Paper>
    </Section>
  );
}

/**
 * What the console can still show for one robot when its detail request fails: the live
 * fleet row, which keeps updating from stream deltas (spec §10, "retained values keep
 * reconciling against live deltas").
 *
 * The row carries no diagnostics and no raw payload — those exist only in the fetched
 * detail — so this deliberately renders neither rather than passing nulls to sections that
 * read them as "the robot never reported".
 */
export function FleetRowBody({ row }: { readonly row: Robot }): ReactNode {
  const [persona, setPersona] = useState<Persona>("operator");

  return (
    <>
      <DetailHeader robot={row} receivedAt={null} persona={persona} onPersonaChange={setPersona} />
      <SummarySection robot={row} />
      <BatteryHistorySection robotId={row.id} />
      <CapabilitiesSection robot={row} />
      {persona === "technician" ? <DetailUnavailableNote /> : null}
      <Box sx={{ mt: 4 }}>
        <DataPlate as="footer">
          Live fleet row · the full robot detail could not be loaded
        </DataPlate>
      </Box>
    </>
  );
}
