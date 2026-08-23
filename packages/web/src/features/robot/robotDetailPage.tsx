import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Alert, Box, Button } from "@mui/material";

import { DataPlate } from "@/components/dataPlate";
import { EmptyState } from "@/components/emptyState";
import { type Persona } from "@/components/personaToggle";

import type { RobotDetail } from "@/entities/robot/model";
import { useRobotDetail, type RobotDetailState } from "@/entities/robot/useRobotDetail";
import { useFleetRobot } from "@/entities/robot/useFleetRobots";
import { reconcileDetailWithRow } from "@/entities/robot/fromEnvelope";

import { TENANT } from "@/config/tenant";

import { BatteryHistorySection } from "./batteryHistorySection";
import { CapabilitiesSection } from "./capabilitiesSection";
import { BackToFleet, DetailHeader } from "./detailHeader";
import { DetailSkeleton } from "./detailSkeleton";
import { DiagnosticsSection } from "./diagnosticsSection";
import { RawPayloadSection } from "./rawPayloadSection";
import { SummarySection } from "./summarySection";

import { formatTimeUtc } from "@/shared/lib/time";

/**
 * The footer's source line: which adapter produced what is on screen, and
 * when. A robot that has never reported has no source to name, and says so.
 */
function describeSource(robot: RobotDetail): string {
  const { diagnostics } = robot;
  if (diagnostics === null) {
    return "Registered in the fleet manifest · no telemetry received";
  }
  const sequence = diagnostics.sequence === null ? "—" : String(diagnostics.sequence);
  return `Adapter ${diagnostics.adapterId} ${diagnostics.adapterVersion} · sequence ${sequence} · received ${formatTimeUtc(diagnostics.receivedAt)}`;
}

/** The full detail body for a robot that loaded. */
function RobotDetailBody({ robot }: { readonly robot: RobotDetail }): ReactNode {
  // Persona is local view state owned by this feature: not written to the
  // store, not derived from telemetry, not shared with the shell (spec §8,
  // Principle 11). Technician sections are additive and appear after the
  // toggle, so switching needs no focus management (component spec 08).
  const [persona, setPersona] = useState<Persona>("operator");

  return (
    <>
      <DetailHeader robot={robot} persona={persona} onPersonaChange={setPersona} />
      <SummarySection robot={robot} />
      <BatteryHistorySection robotId={robot.id} />
      <CapabilitiesSection robot={robot} />
      {persona === "technician" ? (
        <>
          <DiagnosticsSection robot={robot} />
          <RawPayloadSection robot={robot} />
        </>
      ) : null}
      <Box sx={{ mt: 4 }}>
        <DataPlate as="footer">{describeSource(robot)}</DataPlate>
      </Box>
    </>
  );
}

/**
 * Robot detail — page spec 03. Renders one machine's state, its declared
 * capabilities, and (for technicians) what the adapter saw.
 *
 * The panel set comes from the robot's declared capabilities through the
 * registry in `capabilityPanels.tsx`; nothing here branches on vendor
 * (Principle 3). Freshness is displayed, never derived — the header label
 * changes because a delta changed it, and this page holds no timer (ADR 3).
 *
 * Live by overlay, not by polling: the page fetches diagnostics and history
 * once per visit, then keeps core values and freshness current by reconciling
 * this robot's fleet row — fed by the same stream the fleet page reads — over
 * the fetched detail. No delta re-triggers a fetch, and deltas for other
 * robots do not re-render this page.
 */
export function RobotDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  // The one boundary condition on the address, resolved here so every data hook
  // below takes a robot id that exists — none reasons about an absent id mid-render.
  const isAddressedRobot = typeof id === "string" && id !== "";

  return (
    <Box>
      <BackToFleet />
      {isAddressedRobot ? (
        <ResolvedRobotDetail id={id} />
      ) : (
        <EmptyState
          title="Robot not found"
          description="That address does not name a robot."
          action={<Link to="/">Back to fleet</Link>}
        />
      )}
    </Box>
  );
}

/** The addressed half of the page: `id` is guaranteed, so every data hook runs unconditionally. */
function ResolvedRobotDetail({ id }: { readonly id: string }): ReactNode {
  // The address is deployment configuration; this layer may read it and the entity may
  // not (ADR 4, ADR 21).
  const fetched: RobotDetailState = useRobotDetail(id, {
    apiBaseUrl: TENANT.endpoints.apiBaseUrl,
  });
  /*
   * The live half: this robot's fleet row, updated by stream deltas. Identity-
   * stable while frames name other robots, so this page re-renders only for its
   * own machine, and the overlay never refetches diagnostics or history —
   * `reconcileDetailWithRow` carries those forward from the one fetch.
   */
  const live = useFleetRobot(id);
  const state = useMemo(() => {
    if (live === undefined) return fetched;
    if (fetched.status === "ready") {
      return { ...fetched, robot: reconcileDetailWithRow(fetched.robot, live) };
    }
    if (fetched.status === "error" && fetched.recoverable && fetched.robot !== null) {
      return { ...fetched, robot: reconcileDetailWithRow(fetched.robot, live) };
    }
    return fetched;
  }, [fetched, live]);

  return renderState(state);
}

/**
 * The complete asynchronous state set from spec §10, in one exhaustive switch
 * so a new state cannot be added without the compiler naming this file
 * (Principle 5, Principle 11).
 */
function renderState(state: RobotDetailState): ReactNode {
  switch (state.status) {
    case "loading":
      return <DetailSkeleton />;

    case "ready":
      return <RobotDetailBody robot={state.robot} />;

    case "not-found":
      // Not an error banner: an unknown id is a navigation outcome, not a
      // failure of the console (spec §10). The id is never empty here: the
      // route boundary answers an absent address before any fetch can run.
      return (
        <EmptyState
          title="Robot not found"
          description={`No robot with id ${state.id} is registered.`}
          action={<Link to="/">Back to fleet</Link>}
        />
      );

    case "error":
      if (state.recoverable) {
        return (
          <>
            {/* Keep whatever is still valid on screen; do not blank the page. */}
            <Alert
              severity="warning"
              action={
                <Button color="inherit" size="small" onClick={state.retry}>
                  Retry
                </Button>
              }
              sx={{ mb: 2 }}
            >
              {state.message}
            </Alert>
            {state.robot === null ? null : <RobotDetailBody robot={state.robot} />}
          </>
        );
      }
      return (
        <EmptyState
          title="Robot detail unavailable"
          description={state.message}
          action={<Link to="/">Back to fleet</Link>}
        />
      );
  }
}
