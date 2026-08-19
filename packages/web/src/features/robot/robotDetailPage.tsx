import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { Alert, Box, Button, Paper, Skeleton, Stack, Typography } from "@mui/material";

import { DataPlate } from "@/shared/ui/dataPlate";
import { EmptyState } from "@/shared/ui/emptyState";
import { isStreamConnected, useConnectionState } from "@/shared/lib/connectionContext";
import { FreshnessLabel } from "@/shared/ui/freshnessLabel";
import { PersonaToggle, type Persona } from "@/shared/ui/personaToggle";
import { SectionLabel } from "@/shared/ui/sectionLabel";
import { StatusChip } from "@/shared/ui/statusChip";

import type { RobotDetail, RobotHealth } from "@/entities/robot/model";
import {
  selectBatteryDisplay,
  selectClockDeltaDisplay,
  selectPanelCapabilities,
  selectPositionDisplay,
  selectSequenceDuplicateDisplay,
  selectSequenceGapDisplay,
  selectStatusPresentation,
} from "@/entities/robot/selectors";
import { useRobotDetail, type RobotDetailState } from "@/entities/robot/useRobotDetail";

import { TENANT } from "@/config/tenant";

import { CapabilityPanel } from "./capabilityPanels";
import { disabledPanelsFor } from "./panelVisibility";
import { selectSiteLabel } from "@/entities/site/model";

import { formatTimeUtc } from "@/shared/lib/time";

const MONO = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
} as const;

/** Back to the fleet, per spec §2. A link, not a history-popping button. */
function BackToFleet(): ReactNode {
  return (
    <Typography component={Link} to="/" variant="body2" sx={{ color: "var(--accent-text)" }}>
      ← Fleet
    </Typography>
  );
}

/** One labelled value in a definition list. */
function Field({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
      <Typography variant="body2" component="dt" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="body2" component="dd" sx={{ m: 0, ...MONO }}>
        {value}
      </Typography>
    </Stack>
  );
}

/**
 * Section index plus the real `h2` it introduces. `SectionLabel` is not a
 * heading (component spec 03), so every section pairs the two and the page
 * has a heading outline rather than one `h1` and four decorative strings
 * (spec §9, Principle 6).
 */
function Section({
  index,
  title,
  children,
}: {
  readonly index: string;
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  const id = `section-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <Box component="section" aria-labelledby={id} sx={{ mt: 4 }}>
      <SectionLabel>
        {index} — {title}
      </SectionLabel>
      <Typography id={id} variant="h2" component="h2" sx={{ mt: 1, mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Box>
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
            {selectSiteLabel(robot.siteId)} · Vendor {robot.vendor} · {robot.model ?? "—"}
          </Typography>
        </Stack>
      </Box>
      <PersonaToggle value={persona} onChange={onPersonaChange} />
    </Stack>
  );
}

/**
 * Health as one string: severity, plus the vendor's prose when there is any.
 * A robot that has never reported has no health to state, and says so rather
 * than borrowing `nominal` from the severity vocabulary (Principle 4).
 */
function formatHealth(health: RobotHealth | null): string {
  if (health === null) {
    return "Not reported";
  }
  return health.description === undefined
    ? health.severity
    : `${health.severity} — ${health.description}`;
}

/** Core fields only. Capability payloads never appear here, and vice versa. */
function SummarySection({ robot }: { readonly robot: RobotDetail }): ReactNode {
  const presentation = selectStatusPresentation(robot);

  return (
    <Section index="01" title="Summary">
      <Paper sx={{ p: 3 }}>
        <Stack component="dl" spacing={1.5} sx={{ m: 0 }}>
          <Field label="Battery" value={selectBatteryDisplay(robot)} />
          <Field label="Position" value={selectPositionDisplay(robot)} />
          <Field label="Status" value={presentation.label} />
          {/*
            Health is its own field, not text appended to status: a degraded
            robot that is idle is two facts, and collapsing them loses one
            (spec §6, revision 3).
          */}
          <Field label="Health" value={formatHealth(robot.health)} />
          <Field
            label="Connectivity"
            value={robot.connectivity === null ? "Not reported" : robot.connectivity}
          />
          <Field label="Last seen" value={formatTimeUtc(robot.lastSeenAt)} />
        </Stack>
      </Paper>
    </Section>
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
    <Section index="02" title="Capabilities">
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

/** Technician only. Severity is carried by words, never by colour (spec §9). */
function DiagnosticsSection({ robot }: { readonly robot: RobotDetail }): ReactNode {
  const { diagnostics } = robot;

  if (diagnostics === null) {
    // Registration names no adapter and no schema version. A row of em dashes
    // would imply the robot reported and said nothing (spec §10).
    return (
      <Section index="03" title="Diagnostics">
        <Paper sx={{ p: 3 }}>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            This robot is registered and has not reported yet. There is nothing for an adapter to
            have seen.
          </Typography>
        </Paper>
      </Section>
    );
  }

  return (
    <Section index="03" title="Diagnostics">
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
            value={String(diagnostics.unknownFieldCount)}
          />
        </Stack>
      </Paper>
    </Section>
  );
}

/** Technician only. States the absence rather than rendering an empty block. */
function RawPayloadSection({ robot }: { readonly robot: RobotDetail }): ReactNode {
  return (
    <Section index="04" title="Raw payload">
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
 * What this page cannot do yet — the ADR 3 suppression path, the real
 * transport behind the fixture, the three async states nothing can currently
 * produce — is recorded in `./TODO.md`, one item each with its owner. Read it
 * before concluding a gap here is an oversight.
 */
export function RobotDetailPage(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const state: RobotDetailState = useRobotDetail(id);

  return (
    <Box>
      <BackToFleet />
      {renderState(state)}
    </Box>
  );
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
