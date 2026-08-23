import type { ReactNode } from "react";
import { Paper, Stack, Typography } from "@mui/material";

import type { RobotDetail } from "@/entities/robot/model";
import {
  selectClockDeltaDisplay,
  selectSequenceDuplicateDisplay,
  selectSequenceGapDisplay,
} from "@/entities/robot/selectors";
import { useStreamDiagnostics } from "@/context/streamDiagnosticsContext";
import { formatTimeUtc } from "@/utils/time";

import { Field, Section } from "./detailSection";

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
export function DiagnosticsSection({ robot }: { readonly robot: RobotDetail }): ReactNode {
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
