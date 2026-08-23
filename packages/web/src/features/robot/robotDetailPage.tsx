import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Alert, Box, Button, Paper, Skeleton, Stack, Typography } from "@mui/material";

import { DataPlate } from "@/shared/ui/dataPlate";
import { EmptyState } from "@/shared/ui/emptyState";
import { isStreamConnected, useConnectionState } from "@/shared/lib/connectionContext";
import { FreshnessLabel } from "@/shared/ui/freshnessLabel";
import { PersonaToggle, type Persona } from "@/shared/ui/personaToggle";
import { StatusChip } from "@/shared/ui/statusChip";

import type { RobotDetail } from "@/entities/robot/model";
import {
  selectClockDeltaDisplay,
  selectPanelCapabilities,
  selectSequenceDuplicateDisplay,
  selectSequenceGapDisplay,
  selectStatusPresentation,
} from "@/entities/robot/selectors";
import { useRobotDetail, type RobotDetailState } from "@/entities/robot/useRobotDetail";
import { useFleetRobot, useFleetSites } from "@/entities/robot/useFleetRobots";
import { reconcileDetailWithRow } from "@/entities/robot/fromEnvelope";
import { useStreamDiagnostics } from "@/shared/lib/streamDiagnosticsContext";

import { TENANT } from "@/config/tenant";

import { BatteryHistorySection } from "./batteryHistorySection";
import { CapabilityPanel } from "./capabilityPanels";
import { Field, MONO, Section } from "./detailSection";
import { disabledPanelsFor } from "./panelVisibility";
import { SummarySection } from "./summarySection";
import { selectSiteLabel } from "@/entities/site/model";

import { formatTimeUtc } from "@/shared/lib/time";

/** Back to the fleet, per spec §2. A link, not a history-popping button. */
function BackToFleet(): ReactNode {
  return (
    <Typography component={Link} to="/" variant="body2" sx={{ color: "var(--accent-text)" }}>
      ← Fleet
    </Typography>
  );
}

/**
 * Identity row: id, status, freshness, site, vendor and model, with the
 * persona toggle opposite. Freshness is present on every render of this row,
 * because a value without its age is the failure Principle 4 exists to
 * prevent.
 */
function DetailHeader({
  robot,
  persona,
  onPersonaChange,
}: {
  readonly robot: RobotDetail;
  readonly persona: Persona;
  readonly onPersonaChange: (next: Persona) => void;
}): ReactNode {
  const presentation = selectStatusPresentation(robot);
  /* One fact about the console's socket, not about this robot (Principle 11, ADR 23). */
  const streamConnected = isStreamConnected(useConnectionState());
  /* The snapshot's directory, the only source of a site label (ADR 34). */
  const sites = useFleetSites();

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={2}
      sx={{
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", md: "center" },
      }}
    >
      <Box>
        <Typography id="robot-heading" variant="h1" component="h1" sx={MONO}>
          Robot {robot.id}
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap", alignItems: "center", mt: 1 }}
        >
          <StatusChip
            variant={presentation.variant}
            label={presentation.label}
            current={presentation.current}
            size="small"
          />
          {/*
            Suppressed while the stream is down, in favour of the shell's banner
            (robot detail spec § 8, ADR 3). The values below freeze at last known;
            what must not survive is the claim about how current they are.
          */}
          {streamConnected ? (
            <FreshnessLabel
              state={robot.freshness}
              asOf={robot.lastSeenAt}
              receivedAt={robot.diagnostics?.receivedAt ?? undefined}
              compact
            />
          ) : null}
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {selectSiteLabel(robot.siteId, sites)} · Vendor {robot.vendor} · {robot.model ?? "—"}
          </Typography>
        </Stack>
      </Box>
      <PersonaToggle value={persona} onChange={onPersonaChange} />
    </Stack>
  );
}

/**
 * Declared non-core capabilities only. An empty declaration renders nothing at
 * all — no heading, no empty grid, no disabled placeholder (spec §10).
 *
 * A panel appears when the robot declared the capability **and** this tenant
 * enables it (ADR 17). Both conditions are resolved before rendering: there is
 * no tenant name in this file and no flag read inside a panel body, which is
 * what Principle 13 asks for structurally rather than by review.
 */
function CapabilitiesSection({ robot }: { readonly robot: RobotDetail }): ReactNode {
  const capabilities = selectPanelCapabilities(robot, disabledPanelsFor(TENANT.flags));
  if (capabilities.length === 0) {
    return null;
  }

  return (
    <Section index="03" title="Capabilities">
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: "repeat(auto-fill, minmax(var(--panel-min-width), 1fr))",
        }}
      >
        {capabilities.map((name) => (
          // Keyed by capability name so a changed declaration patches the grid
          // rather than remounting every panel in it (spec §7).
          <CapabilityPanel key={name} name={name} capabilities={robot.capabilities} />
        ))}
      </Box>
    </Section>
  );
}

/**
 * The console's own stream health, distinct from anything about this robot.
 *
 * The count is session-wide and across all robots — a property of this
 * console's socket, not of the machine on screen — and the label says exactly
 * that rather than implying a per-robot precision the counter does not have
 * (Principle 11). Whether a run of rejections should escalate to a terminal
 * state is trigger-deferred (fleet TODO A4).
 */
function StreamDiagnosticsRow(): ReactNode {
  const { rejectedFrames } = useStreamDiagnostics();
  return (
    <Field
      label="Rejected stream frames (console session, all robots)"
      value={String(rejectedFrames)}
    />
  );
}

/** Technician only. Severity is carried by words, never by colour (spec §9). */
function DiagnosticsSection({ robot }: { readonly robot: RobotDetail }): ReactNode {
  const { diagnostics } = robot;

  if (diagnostics === null) {
    // Registration names no adapter and no schema version. A row of em dashes
    // would imply the robot reported and said nothing (spec §10).
    return (
      <Section index="04" title="Diagnostics">
        <Paper sx={{ p: 3 }}>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            This robot is registered and has not reported yet. There is nothing for an adapter to
            have seen.
          </Typography>
          <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
            <StreamDiagnosticsRow />
          </Stack>
        </Paper>
      </Section>
    );
  }

  return (
    <Section index="04" title="Diagnostics">
      <Paper sx={{ p: 3 }}>
        <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
          <Field label="Adapter" value={`${diagnostics.adapterId} ${diagnostics.adapterVersion}`} />
          <Field
            label="Sequence"
            value={diagnostics.sequence === null ? "Not reported" : String(diagnostics.sequence)}
          />
          <Field label="Sequence gaps (since start)" value={selectSequenceGapDisplay(robot)} />
          <Field
            label="Sequence duplicates (since start)"
            value={selectSequenceDuplicateDisplay(robot)}
          />
          <Field label="Vendor timestamp" value={formatTimeUtc(diagnostics.vendorReportedAt)} />
          <Field label="Received" value={formatTimeUtc(diagnostics.receivedAt)} />
          <Field label="Clock delta" value={selectClockDeltaDisplay(robot)} />
          <Field label="Schema version" value={diagnostics.schemaVersion} />
          {/*
            Labelled as per-adapter and fleet-wide because that is what the
            counter measures. A bare number here would imply a per-robot
            precision it does not have (ADR 1, Implications). The rows above it
            are per-robot and come off the envelope — ADR 25 separated the two by
            their true scope, and the labels are what make that visible to a
            technician reading them side by side.
          */}
          <Field
            label="Unknown fields (adapter, fleet-wide)"
            value={
              diagnostics.unknownFieldCount === null
                ? "Not reported"
                : String(diagnostics.unknownFieldCount)
            }
          />
          <StreamDiagnosticsRow />
        </Stack>
      </Paper>
    </Section>
  );
}

/** Technician only. States the absence rather than rendering an empty block. */
function RawPayloadSection({ robot }: { readonly robot: RobotDetail }): ReactNode {
  return (
    <Section index="05" title="Raw payload">
      <Paper sx={{ p: 3 }}>
        {/*
          States the exposure rather than implying protection (ADR 26). This content is
          the vendor's own message, unredacted by decision — field-name redaction over a
          dialect nobody has catalogued removes the evidence this panel exists to show
          without reliably removing anything sensitive. The endpoint behind it has **no
          server-side access rule**, because authentication is an explicit product cut
          (README § 9), so the technician toggle is presentation and not a permission.

          This notice is a release blocker, not decoration: it is the honest statement
          that must be replaced by a real access rule before this ships anywhere a
          stranger can reach. Do not soften it to make the panel look finished.
        */}
        <Typography
          variant="body2"
          sx={{ color: "text.secondary", mb: 2 }}
          data-testid="raw-payload-exposure"
        >
          Shown exactly as the vendor sent it, with nothing removed. This view is not
          access-controlled — anyone who can reach this console can read it.
        </Typography>
        {robot.rawPayload === null ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No payload was retained for this robot.
          </Typography>
        ) : (
          <Box
            component="pre"
            tabIndex={0}
            aria-label={`Raw payload for ${robot.id}`}
            sx={{
              ...MONO,
              m: 0,
              maxHeight: "var(--scroll-block-max-height)",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "var(--text-small)",
            }}
          >
            {JSON.stringify(robot.rawPayload, null, 2)}
          </Box>
        )}
      </Paper>
    </Section>
  );
}

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
 * Header skeleton for the first load. Deliberately not an empty Summary: a
 * Summary rendered with placeholder values and then repopulated shows the
 * operator numbers that were never true (spec §10).
 */
function DetailSkeleton(): ReactNode {
  return (
    <Box aria-busy="true" aria-live="polite">
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Loading robot…
      </Typography>
      <Skeleton variant="text" width="40%" height={48} />
      <Skeleton variant="text" width="60%" />
    </Box>
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
      // failure of the console (spec §10).
      return (
        <EmptyState
          title="Robot not found"
          description={
            state.id === ""
              ? "That address does not name a robot."
              : `No robot with id ${state.id} is registered.`
          }
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

export default RobotDetailPage;
