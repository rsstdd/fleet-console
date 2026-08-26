import { OPERATOR_CAPABILITY_NAMES, type OperatorCapabilityName } from "@fleet/contracts";
import type { FreshnessState, HealthSeverity, RobotStatus } from "@fleet/contracts";
import type { Robot, RobotDetail } from "@/types/robot";

/** Values that cannot be vouched for are suppressed rather than shown as current. */
export const NO_HONEST_VALUE = "—";

const LAST_KNOWN_SUFFIX = "(last known)";

/** Distinct from a measured zero. */
const NOT_EVALUATED = "Not evaluated";

export type StatusVariant = "neutral" | "active" | "charging" | "degraded" | "fault" | "unknown";

const STATUS_VARIANT: Record<RobotStatus, StatusVariant> = {
  idle: "neutral",
  busy: "active",
  charging: "charging",
  fault: "fault",
  unknown: "unknown",
};

const STATUS_LABEL: Record<RobotStatus, string> = {
  idle: "Idle",
  busy: "Busy",
  charging: "Charging",
  fault: "Fault",
  unknown: "Unknown",
};

export const FRESHNESS_LABEL: Record<FreshnessState, string> = {
  live: "LIVE",
  stale: "STALE",
  unreachable: "UNREACHABLE",
  unknown: "UNKNOWN",
};

export const SEVERITY_LABEL: Record<HealthSeverity, string> = {
  nominal: "Nominal",
  degraded: "Degraded",
  critical: "Critical",
};

export interface StatusPresentation {
  readonly variant: StatusVariant;
  readonly label: string;
  readonly isCurrent: boolean;
}

/** Stale status remains visible only because its label marks it last known. */
function isSelfReportedLive(robot: Robot): boolean {
  return robot.freshness === "live";
}

/** Unmarked telemetry values require live freshness and a connected stream. */
function isTelemetryTrustworthy(robot: Robot, isStreamConnected: boolean): boolean {
  return isStreamConnected && isSelfReportedLive(robot);
}

/** The displayed variant reflects the worst applicable status or severity. */
function selectStatusVariant(robot: Robot): StatusVariant {
  const severity = robot.health?.severity;

  if (robot.status === "fault" || severity === "critical") {
    return "fault";
  }

  if (severity === "degraded") {
    return "degraded";
  }

  return STATUS_VARIANT[robot.status];
}

function formatStatusLabel(status: RobotStatus, isCurrent: boolean): string {
  const label = STATUS_LABEL[status];

  return isCurrent ? label : `${label} ${LAST_KNOWN_SUFFIX}`;
}

export function selectStatusPresentation(robot: Robot): StatusPresentation {
  const isCurrent = isSelfReportedLive(robot);

  return {
    variant: selectStatusVariant(robot),
    label: formatStatusLabel(robot.status, isCurrent),
    isCurrent,
  };
}

export function selectBatteryDisplay(robot: Robot, isStreamConnected: boolean): string {
  if (!isTelemetryTrustworthy(robot, isStreamConnected) || robot.batteryPercent === null) {
    return NO_HONEST_VALUE;
  }

  return `${String(Math.round(robot.batteryPercent))}%`;
}

export function selectPositionDisplay(robot: Robot, isStreamConnected: boolean): string {
  if (!isTelemetryTrustworthy(robot, isStreamConnected) || robot.position === null) {
    return NO_HONEST_VALUE;
  }

  const { frame, x, y } = robot.position;

  return `${frame} · ${x.toFixed(1)}, ${y.toFixed(1)}`;
}

export type FreshnessSummary = Record<FreshnessState, number>;

function emptyFreshnessSummary(): FreshnessSummary {
  return { live: 0, stale: 0, unreachable: 0, unknown: 0 };
}

export function selectFreshnessSummary(robots: readonly Robot[]): FreshnessSummary {
  const summary = emptyFreshnessSummary();

  for (const robot of robots) {
    summary[robot.freshness] += 1;
  }

  return summary;
}

/** Capability presence, never vendor identity, controls panel availability. */
export function selectPanelCapabilities(robot: Robot): readonly OperatorCapabilityName[] {
  return OPERATOR_CAPABILITY_NAMES.filter((name) => robot.capabilities[name] !== undefined);
}

export function selectSequenceDisplay(robot: RobotDetail, field: "gaps" | "duplicates"): string {
  const health = robot.diagnostics?.sequenceHealth;

  if (health === undefined || !health.evaluated) {
    return NOT_EVALUATED;
  }

  return String(health[field]);
}

export function selectClockDeltaDisplay(robot: RobotDetail): string {
  const delta = robot.diagnostics?.clockDeltaMs ?? null;

  if (delta === null) {
    return NO_HONEST_VALUE;
  }

  const sign = delta > 0 ? "+" : "";

  return `${sign}${String(delta)} ms`;
}
