import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Alert, Box, Button, Typography } from "@mui/material";
import { identifierSchema } from "@fleet/contracts";

import { EmptyState } from "@/components/emptyState";
import { type Persona } from "@/components/personaToggle";

import type { Robot } from "@/types/robot";
import { useRobotDetail, type RobotDetailState } from "@/hooks/useRobotDetail";
import { useFleetRobot } from "@/hooks/useFleetRobots";
import { reconcileDetailWithRow } from "@/utils/fromEnvelope";

import { TENANT } from "@/config/tenant";

import { DetailBody, type DetailBodySource } from "./detailBody";
import { BackToFleet } from "./detailHeader";
import { DetailSkeleton } from "./detailSkeleton";

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
  const { id } = useParams<{ readonly id: string }>();
  const parsedId = identifierSchema.safeParse(id);

  return (
    <Box>
      <BackToFleet />
      {parsedId.success ? (
        <ResolvedRobotDetail id={parsedId.data} />
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
  // The address is deployment configuration; this layer may read it and the hooks may
  // not (ADR 4, ADR 21).
  const fetched: RobotDetailState = useRobotDetail(id, {
    apiBaseUrl: TENANT.endpoints.apiBaseUrl,
    requestTimeoutMs: TENANT.requestPolicy.timeoutMs,
  });
  /*
   * The live half: this robot's fleet row, updated by stream deltas. Identity-
   * stable while frames name other robots, so this page re-renders only for its
   * own machine, and the overlay never refetches diagnostics or history —
   * `reconcileDetailWithRow` carries those forward from the one fetch.
   */
  const live = useFleetRobot(id);
  const state = reconcileRobotDetailState(fetched, live);
  /*
   * Persona is local view state owned by this feature: not written to the store, not
   * derived from telemetry, not shared with the shell (spec §8, Principle 11). It lives
   * here rather than in the body because the body is replaced when the detail request
   * fails or recovers, and an operator's choice must outlive that (component spec 08).
   */
  const [persona, setPersona] = useState<Persona>("operator");

  return renderState(state, live, { persona, onPersonaChange: setPersona });
}

/** The persona the rendered body reads, owned one level above every branch that shows one. */
interface PersonaControls {
  readonly persona: Persona;
  readonly onPersonaChange: (next: Persona) => void;
}

/**
 * Renders the notice and the body in one shape for every state that has a body.
 *
 * The slots are positional on purpose: a `null` notice still occupies its place, so the
 * body keeps its position and its type across a failure or a recovery and React reconciles
 * it rather than remounting — which is what stops the battery history refetching.
 */
function renderDetailFrame(
  notice: ReactNode,
  source: DetailBodySource | null,
  { persona, onPersonaChange }: PersonaControls,
): ReactNode {
  return (
    <>
      {notice}
      {source === null ? null : (
        <DetailBody source={source} persona={persona} onPersonaChange={onPersonaChange} />
      )}
    </>
  );
}

function reconcileRobotDetailState(
  fetched: RobotDetailState,
  live: Robot | undefined,
): RobotDetailState {
  if (live === undefined || fetched.status !== "ready") {
    return fetched;
  }

  return { ...fetched, robot: reconcileDetailWithRow(fetched.robot, live) };
}

/**
 * The complete asynchronous state set from spec §10, in one exhaustive switch
 * so a new state cannot be added without the compiler naming this file
 * (Principle 5, Principle 11).
 */
function renderState(
  state: RobotDetailState,
  live: Robot | undefined,
  controls: PersonaControls,
): ReactNode {
  switch (state.status) {
    case "loading":
      return <DetailSkeleton />;

    case "ready":
      return renderDetailFrame(null, { kind: "detail", robot: state.robot }, controls);

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
        const notice = (
          <Box sx={{ mb: 2 }}>
            <Alert
              severity="warning"
              action={
                <Button
                  color="inherit"
                  size="small"
                  // Named beyond its visible label because the battery-history section
                  // can offer its own Retry at the same time (WCAG 2.5.3 keeps "Retry").
                  aria-label="Retry loading robot detail"
                  onClick={state.retry}
                >
                  Retry
                </Button>
              }
            >
              {state.message}
            </Alert>
            {/*
                Beside the alert, not inside it: `role="alert"` is assertive, so progress
                written into it re-announces the failure. The control stays operable —
                disabling it on activation would move focus to the body.
              */}
            <Typography role="status" variant="body2" sx={{ color: "text.secondary" }}>
              {state.retrying ? "Retrying…" : null}
            </Typography>
          </Box>
        );
        // The fetch is gone; the stream is not. Whatever the fleet row still knows stays.
        return renderDetailFrame(
          notice,
          live === undefined ? null : { kind: "row", robot: live },
          controls,
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
