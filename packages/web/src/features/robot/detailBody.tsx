import type { ReactNode } from "react";
import { Box, Paper, Typography } from "@mui/material";

import { DataPlate } from "@/components/dataPlate";
import { type Persona } from "@/components/personaToggle";
import type { Robot, RobotDetail } from "@/types/robot";
import { formatTimeUtc } from "@/utils/time";

import { BatteryHistorySection } from "./batteryHistorySection";
import { CapabilitiesSection } from "./capabilitiesSection";
import { DetailHeader } from "./detailHeader";
import { Section } from "./detailSection";
import { DiagnosticsSection } from "./diagnosticsSection";
import { RawPayloadSection } from "./rawPayloadSection";
import { SummarySection } from "./summarySection";

/**
 * Where the body's values come from: the fetched detail, or the live fleet row standing in
 * while that fetch is failing (spec §10).
 *
 * One union rather than a detail beside a nullable row, so a source can never carry both
 * and the technician sections cannot be handed one that has no diagnostics to render.
 */
export type DetailBodySource =
  | { readonly kind: "detail"; readonly robot: RobotDetail }
  | { readonly kind: "row"; readonly robot: Robot };

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

function TechnicianSections({ source }: { readonly source: DetailBodySource }): ReactNode {
  switch (source.kind) {
    case "detail":
      return (
        <>
          <DiagnosticsSection robot={source.robot} />
          <RawPayloadSection robot={source.robot} />
        </>
      );
    case "row":
      return <DetailUnavailableNote />;
  }
}

/** The footer's source line: which adapter produced what is on screen, and when. */
function describeSource(source: DetailBodySource): string {
  switch (source.kind) {
    case "row":
      return "Live fleet row · the full robot detail could not be loaded";
    case "detail": {
      const { diagnostics } = source.robot;
      if (diagnostics === null) {
        return "Registered in the fleet manifest · no telemetry received";
      }
      const sequence = diagnostics.sequence === null ? "—" : String(diagnostics.sequence);
      return `Adapter ${diagnostics.adapterId} ${diagnostics.adapterVersion} · sequence ${sequence} · received ${formatTimeUtc(diagnostics.receivedAt)}`;
    }
  }
}

/**
 * One body for both sources, rather than one per source.
 *
 * Two components rendering this same section order would be swapped by element type when
 * the detail request fails or recovers, remounting `BatteryHistorySection` and re-fetching
 * a window it already holds. Keeping one type means React reconciles the transition
 * instead, and the persona this receives outlives it for the same reason.
 */
export function DetailBody({
  source,
  persona,
  onPersonaChange,
}: {
  readonly source: DetailBodySource;
  readonly persona: Persona;
  readonly onPersonaChange: (next: Persona) => void;
}): ReactNode {
  const { robot } = source;

  return (
    <>
      <DetailHeader
        robot={robot}
        receivedAt={
          source.kind === "detail" ? (source.robot.diagnostics?.receivedAt ?? null) : null
        }
        persona={persona}
        onPersonaChange={onPersonaChange}
      />
      <SummarySection robot={robot} />
      <BatteryHistorySection robotId={robot.id} />
      <CapabilitiesSection robot={robot} />
      {persona === "technician" ? <TechnicianSections source={source} /> : null}
      <Box sx={{ mt: 4 }}>
        <DataPlate as="footer">{describeSource(source)}</DataPlate>
      </Box>
    </>
  );
}
